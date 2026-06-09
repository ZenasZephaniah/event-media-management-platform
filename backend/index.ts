import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sharp from 'sharp';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient } from '@prisma/client';
import { 
  RekognitionClient, DetectLabelsCommand, IndexFacesCommand, SearchFacesByImageCommand, DeleteFacesCommand 
} from "@aws-sdk/client-rekognition";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-cig-key-2026";
const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID || "cig-faces-collection";

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// --- AUTHENTICATION & PROFILES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email is already registered" });
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ 
      data: { name, email, passwordHash, role: role || "VIEWER" } 
    });
    
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, referenceSelfie: user.referenceSelfie, awsFaceId: user.awsFaceId } });
  } catch (error) { 
    res.status(500).json({ error: "Registration failed" }); 
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, referenceSelfie: user.referenceSelfie, awsFaceId: user.awsFaceId } });
  } catch (error) { 
    res.status(500).json({ error: "Login failed" }); 
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({ 
      select: { id: true, name: true, email: true, role: true, referenceSelfie: true, awsFaceId: true } 
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve user accounts" });
  }
});

// --- NOTIFICATIONS TRAY ---
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Could not modify status" });
  }
});

// --- EVENTS & HIERARCHICAL ALBUM ROUTING ---
app.get('/api/events', async (req, res) => {
  try {
    const events = await prisma.event.findMany({ 
      include: { albums: true }, 
      orderBy: { createdAt: 'desc' } 
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch event index" });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const { name, date, category, creatorId, clubName, description } = req.body;
    
    const userExists = await prisma.user.findUnique({ where: { id: creatorId } });
    if (!userExists) {
      return res.status(400).json({ error: "Must be logged in with a valid account to create an event." });
    }

    const event = await prisma.event.create({
      data: { 
        name, 
        date: new Date(date), 
        category, 
        creatorId, 
        clubName, 
        description: description || "", 
        albums: { create: [{ name: "General Media" }] } 
      },
      include: { albums: true }
    });
    res.json(event);
  } catch (error) { 
    console.error(error);
    res.status(500).json({ error: "Event initialization failed due to database structure conflict." }); 
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const albums = await prisma.album.findMany({ where: { eventId: id } });
    
    for (const albumItem of albums) {
      const media = await prisma.media.findMany({ where: { albumId: albumItem.id } });
      for (const m of media) {
        await prisma.interaction.deleteMany({ where: { mediaId: m.id } });
        await prisma.comment.deleteMany({ where: { mediaId: m.id } });
        try {
          await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: m.s3Key }));
        } catch (s3Err) {
          console.error(`S3 deletion failed for key ${m.s3Key}`, s3Err);
        }
        await prisma.media.delete({ where: { id: m.id } });
      }
      await prisma.album.delete({ where: { id: albumItem.id } });
    }
    await prisma.event.delete({ where: { id } });
    res.json({ success: true, message: "Cascaded deletion successful" });
  } catch (error) { 
    res.status(500).json({ error: "Failed to delete event cascade hierarchy" }); 
  }
});

app.post('/api/albums', async (req, res) => {
  try {
    const { name, eventId } = req.body;
    const newAlbum = await prisma.album.create({ data: { name, eventId } });
    res.json(newAlbum);
  } catch (error) {
    res.status(500).json({ error: "Failed to create custom album" });
  }
});

app.delete('/api/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const media = await prisma.media.findMany({ where: { albumId: id } });
    
    for (const m of media) {
      await prisma.interaction.deleteMany({ where: { mediaId: m.id } });
      await prisma.comment.deleteMany({ where: { mediaId: m.id } });
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: m.s3Key }));
      } catch (s3Err) {
        console.error(`S3 deletion failed for key ${m.s3Key}`, s3Err);
      }
      await prisma.media.delete({ where: { id: m.id } });
    }
    await prisma.album.delete({ where: { id } });
    res.json({ success: true, message: "Album cascade cleanup successful" });
  } catch (error) { 
    res.status(500).json({ error: "Album deletion failed" }); 
  }
});

// --- SECURE S3 STREAMING PROXY ---
app.get('/api/media/stream', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: "Missing s3 object key parameter" });

    const s3Response = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key as string
    }));

    if (s3Response.ContentType) {
      res.setHeader('Content-Type', s3Response.ContentType);
    }
    
    (s3Response.Body as any).pipe(res);
  } catch (error) {
    console.error("Failed to stream image via credentials proxy:", error);
    res.status(404).send("Media resource not found.");
  }
});

// --- SECURE SERVER-SIDE S3 UPLOAD (Strictly JPEG & PNG Enforced) ---
app.post('/api/media/upload-direct', async (req, res) => {
  try {
    const { filename, fileType, base64Data, albumId, uploaderId, privacy } = req.body;
    
    if (fileType !== "image/jpeg" && fileType !== "image/png") {
      return res.status(400).json({ error: "Unsupported file format. Only JPEG and PNG image types are allowed." });
    }

    const uploader = await prisma.user.findUnique({ where: { id: uploaderId } });
    if (!uploader) {
      return res.status(400).json({ error: "Uploader session has expired or been wiped. Please register again." });
    }

    const targetAlbum = await prisma.album.findUnique({ where: { id: albumId } });
    if (!targetAlbum) {
      return res.status(400).json({ error: "Selected target album does not exist." });
    }

    let buffer: any = Buffer.from(base64Data, 'base64');
    let mimeType = fileType;
    const safeName = filename.replace(/[^a-zA-Z0-9.]/g, '');
    let s3Key = `uploads/${Date.now()}-${safeName}`;

    // Standardize to optimized compressed JPEG buffer using Sharp
    try {
      buffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
      mimeType = "image/jpeg";
      s3Key = s3Key.replace(/\.[^/.]+$/, "") + ".jpg"; 
    } catch (sharpErr: any) {
      return res.status(500).json({ error: "Failed to parse and optimize uploaded image buffer." });
    }

    // Node Server to S3 Direct Transfer
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType
    }));

    const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    let generatedTags: string[] = [];
    let detectedUserIds: string[] = [];

    // Safe AI Processing
    try {
      const labelsData = await rekognitionClient.send(new DetectLabelsCommand({ 
        Image: { S3Object: { Bucket: process.env.AWS_BUCKET_NAME!, Name: s3Key } }, 
        MaxLabels: 6, 
        MinConfidence: 75 
      }));
      generatedTags = labelsData.Labels?.map(l => l.Name as string) || [];
    } catch (e) { console.error("Rekognition tagging skipped:", e); }

    try {
      const faceData = await rekognitionClient.send(new SearchFacesByImageCommand({ 
        CollectionId: COLLECTION_ID, 
        Image: { S3Object: { Bucket: process.env.AWS_BUCKET_NAME!, Name: s3Key } }, 
        FaceMatchThreshold: 70 
      }));
      const matchedFaceIds = faceData.FaceMatches?.map(m => m.Face?.FaceId).filter(Boolean) as string[] || [];
      
      if (matchedFaceIds.length > 0) {
        const matchedUsers = await prisma.user.findMany({ 
          where: { awsFaceId: { in: matchedFaceIds } }, 
          select: { id: true } 
        });
        detectedUserIds = matchedUsers.map(u => u.id);
      }
    } catch (e) { console.error("Rekognition face match skipped:", e); }

    const media = await prisma.media.create({
      data: {
        s3Url,
        s3Key,
        type: "PHOTO",
        size: buffer.length,
        albumId,
        uploaderId,
        tags: generatedTags,
        facesInPhoto: detectedUserIds,
        privacy: privacy || "PUBLIC"
      }
    });

    res.json(media);
  } catch (error: any) {
    console.error("Direct S3 upload pipeline failed:", error);
    res.status(500).json({ error: `Server upload processing failed: ${error.message}` });
  }
});

// --- SECURE REFERENCE SELFIE REGISTRATION ---
app.post('/api/user/register-selfie', async (req, res) => {
  try {
    const { userId, base64Data, filename, fileType } = req.body;
    
    if (fileType !== "image/jpeg" && fileType !== "image/png") {
      return res.status(400).json({ error: "Selfie must be in JPEG or PNG format." });
    }

    const userProfile = await prisma.user.findUnique({ where: { id: userId } });
    if (!userProfile) return res.status(404).json({ error: "User profile not found." });

    let buffer: any = Buffer.from(base64Data, 'base64');
    const safeName = filename.replace(/[^a-zA-Z0-9.]/g, '');
    const s3Key = `selfies/${userId}-${Date.now()}-${safeName}`;

    try {
      buffer = await sharp(buffer)
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (sharpErr) {
      return res.status(500).json({ error: "Failed to optimize selfie buffer." });
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: s3Key,
      Body: buffer,
      ContentType: "image/jpeg"
    }));

    const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    let indexedFaceId: string | undefined = undefined;
    try {
      const faceRes = await rekognitionClient.send(new IndexFacesCommand({ 
        CollectionId: COLLECTION_ID, 
        Image: { S3Object: { Bucket: process.env.AWS_BUCKET_NAME!, Name: s3Key } }, 
        MaxFaces: 1 
      }));
      indexedFaceId = faceRes.FaceRecords?.[0]?.Face?.FaceId;
    } catch (recErr) {
      console.error("Rekognition face indexing failed:", recErr);
    }

    if (!indexedFaceId) {
      return res.status(400).json({ error: "AI Face detection failed. Ensure your face is fully visible in the image." });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        referenceSelfie: s3Url,
        awsFaceId: indexedFaceId
      }
    });

    res.json({ 
      success: true, 
      user: { 
        id: updatedUser.id, 
        name: updatedUser.name, 
        role: updatedUser.role, 
        email: updatedUser.email, 
        referenceSelfie: updatedUser.referenceSelfie, 
        awsFaceId: updatedUser.awsFaceId 
      } 
    });
  } catch (error: any) {
    console.error("Selfie registration pipeline failed:", error);
    res.status(500).json({ error: `Face registration failed: ${error.message}` });
  }
});

// --- RESET PROFILE SELFIE REFERENCE ---
app.post('/api/user/delete-selfie', async (req, res) => {
  try {
    const { userId } = req.body;
    const userObj = await prisma.user.findUnique({ where: { id: userId } });
    if (!userObj) return res.status(404).json({ error: "User profile not found." });

    if (userObj.awsFaceId) {
      try {
        await rekognitionClient.send(new DeleteFacesCommand({
          CollectionId: COLLECTION_ID,
          FaceIds: [userObj.awsFaceId]
        }));
      } catch (recErr) {
        console.error("Rekognition face index delete warning:", recErr);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        referenceSelfie: null,
        awsFaceId: null
      }
    });

    res.json({ 
      success: true, 
      user: { 
        id: updatedUser.id, 
        name: updatedUser.name, 
        role: updatedUser.role, 
        email: updatedUser.email, 
        referenceSelfie: null, 
        awsFaceId: null 
      } 
    });
  } catch (error: any) {
    console.error("Failed to reset face registration:", error);
    res.status(500).json({ error: `Face reference reset failed: ${error.message}` });
  }
});

// --- SOCIAL FEED ACTIONS ---
app.get('/api/media', async (req, res) => {
  try {
    const media = await prisma.media.findMany({
      orderBy: { createdAt: 'desc' },
      include: { 
        uploader: { select: { name: true } }, 
        album: { include: { event: true } }, 
        interactions: true, 
        comments: { include: { user: { select: { name: true } } } } 
      }
    });
    res.json(media);
  } catch (error) { res.status(500).json({ error: "Failed to load media items" }); }
});

app.post('/api/media/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    const mediaObj = await prisma.media.findUnique({ where: { id } });
    const actorUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!mediaObj || !actorUser) return res.status(404).json({ error: "Invalid context" });

    const existing = await prisma.interaction.findFirst({ 
      where: { mediaId: id, userId, type: "LIKE" } 
    });
    
    if (existing) {
      await prisma.interaction.delete({ where: { id: existing.id } });
      return res.json({ status: "unliked" });
    }
    
    const like = await prisma.interaction.create({ 
      data: { mediaId: id, userId, type: "LIKE" } 
    });

    if (mediaObj.uploaderId !== userId) {
      await prisma.notification.create({
        data: {
          userId: mediaObj.uploaderId,
          actor: actorUser.name,
          action: "liked your photo",
          mediaId: id
        }
      });
    }

    res.json(like);
  } catch (error) { res.status(500).json({ error: "Unable to process interaction" }); }
});

app.post('/api/media/:id/tag-user', async (req, res) => {
  try {
    const { id } = req.params;
    const { targetUserId, actorUserId } = req.body;
    
    const media = await prisma.media.findUnique({ where: { id } });
    const actorUser = await prisma.user.findUnique({ where: { id: actorUserId } });
    if (!media || !actorUser) return res.status(404).json({ error: "Media or Actor not found" });
    
    const updatedFaces = Array.from(new Set([...media.facesInPhoto, targetUserId]));
    const updatedMedia = await prisma.media.update({ 
      where: { id }, 
      data: { facesInPhoto: updatedFaces } 
    });

    await prisma.notification.create({
      data: {
        userId: targetUserId,
        actor: actorUser.name,
        action: "manually tagged you in an image",
        mediaId: id
      }
    });

    res.json(updatedMedia);
  } catch (error) { res.status(500).json({ error: "Failed to register manual tag" }); }
});

app.post('/api/media/:id/comment', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, text } = req.body;
    
    const mediaObj = await prisma.media.findUnique({ where: { id } });
    const actorUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!mediaObj || !actorUser) return res.status(404).json({ error: "Record verification failed" });

    const comment = await prisma.comment.create({
      data: { text, mediaId: id, userId }
    });

    if (mediaObj.uploaderId !== userId) {
      await prisma.notification.create({
        data: {
          userId: mediaObj.uploaderId,
          actor: actorUser.name,
          action: `commented: "${text.substring(0, 30)}..."`,
          mediaId: id
        }
      });
    }

    res.json(comment);
  } catch (error) { res.status(500).json({ error: "Failed to commit comment" }); }
});

// --- BULLETPROOF MEDIA CASCADE DELETION ---
app.delete('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) return res.status(404).json({ error: "Media reference not found" });
    
    try { 
      await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME!, Key: media.s3Key })); 
    } catch (e) {
      console.error("S3 file deletion warning:", e);
    }
    
    // Manual database cascade execution
    await prisma.interaction.deleteMany({ where: { mediaId: id } });
    await prisma.comment.deleteMany({ where: { mediaId: id } });
    await prisma.media.delete({ where: { id } });
    
    res.json({ success: true });
  } catch (error: any) { 
    console.error("CRITICAL Prisma Deletion Error:", error);
    res.status(500).json({ error: `Cascaded deletion failed: ${error.message}` }); 
  }
});

// --- WATERMARKED DOWNLOAD ---
app.get('/api/media/download/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const userId = req.query.userId as string;

    const media = await prisma.media.findUnique({ 
      where: { id: mediaId }, 
      include: { album: { include: { event: true } } } 
    });
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!media) return res.status(404).json({ error: "Resource metadata missing." });

    const s3Response = await s3Client.send(new GetObjectCommand({ 
      Bucket: process.env.AWS_BUCKET_NAME!, 
      Key: media.s3Key 
    }));
    
    const chunks = [];
    for await (const chunk of s3Response.Body as any) {
      chunks.push(chunk);
    }
    const originalImageBuffer = Buffer.concat(chunks);

    const clubName = media.album?.event?.clubName || 'CIG Vault';
    const eventName = media.album?.event?.name || 'General';
    const userRole = user?.role || 'Guest';
    const watermarkText = `${clubName} | ${eventName} | ${userRole}`;
    
    const svgBuffer = Buffer.from(
      `<svg width="800" height="80">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" rx="15" ry="15" />
        <text x="50%" y="58%" text-anchor="middle" fill="#ffffff" font-size="24px" font-family="Arial" font-weight="bold">${watermarkText}</text>
      </svg>`
    );
    
    const watermarkedBuffer = await sharp(originalImageBuffer)
      .composite([{ input: svgBuffer, gravity: 'southeast' }])
      .toBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="Watermarked_${media.id}.jpg"`);
    res.send(watermarkedBuffer);
  } catch (error) { 
    console.error(error);
    res.status(500).json({ error: "Processing dynamic watermark failed" }); 
  }
});

// --- ROBUST COLLISION LISTEN LOGIC ---
const server = app.listen(process.env.PORT || 5001, () => {
  console.log("Backend online on port 5001");
});

server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.error("\nCRITICAL SYSTEM CONFLICT: Port 5001 is locked by an existing process!");
    console.error("Execute: 'killall -9 node' in macOS terminal to free up port 5001, then restart with npm run dev.\n");
    process.exit(1);
  }
});