import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { 
  RekognitionClient, 
  DetectLabelsCommand, 
  CreateCollectionCommand, 
  IndexFacesCommand, 
  SearchFacesByImageCommand 
} from "@aws-sdk/client-rekognition";




dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Initialize AWS Rekognition Client (Put this right below your S3Client initialization)
const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});


// Health Check Route
app.get('/', (req, res) => {
  res.send('CIG Media Platform API is running! 🚀');
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-cig-key-2026";

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "Email already in use" });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: role || "VIEWER" }
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ==========================================
// THE S3 PRESIGNED URL PIPELINE
// ==========================================
app.post('/api/media/get-upload-url', async (req, res) => {
  try {
    const { filename, fileType } = req.body;
    
    // Create a unique key to prevent file overwrites
    const uniqueKey = `uploads/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: uniqueKey,
      ContentType: fileType,
    });

    // Generate a URL that expires in 60 seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    res.json({
      uploadUrl,
      s3Key: uniqueKey,
      s3Url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueKey}`
    });
  } catch (error) {
    console.error('Error generating S3 url:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});


// ==========================================
// EVENTS & MEDIA DB CONFIRMATION
// ==========================================

// Create an Event (and auto-create a default Album)
app.post('/api/events', async (req, res) => {
  try {
    const { name, date, category, creatorId, clubName } = req.body;
    
    const event = await prisma.event.create({
      data: {
        name,
        date: new Date(date),
        category,
        creatorId,
        clubName,
        // Prisma Magic: Auto-create a default album for this event
        albums: {
          create: [{ name: "General Media" }]
        }
      },
      include: { albums: true } // Return the created album so we get its ID
    });
    
    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create event" });
  }
});


const COLLECTION_ID = "cig-faces-collection";


// Save Media + Generate AI Tags + Match Registered Faces
app.post('/api/media/confirm', async (req, res) => {
  try {
    const { s3Url, s3Key, type, size, albumId, uploaderId } = req.body;
    
    let generatedTags: string[] = [];
    let detectedUserIds: string[] = []; // Store IDs of users found in the photo

    if (type === "PHOTO") {
      console.log(`\n--- Analyzing New Upload: ${s3Key} ---`);
      
      // ENGINE 1: SMART TAGGING
      try {
        const labelCommand = new DetectLabelsCommand({
          Image: { S3Object: { Bucket: process.env.AWS_BUCKET_NAME!, Name: s3Key } },
          MaxLabels: 6, MinConfidence: 75,
        });
        const labelResponse = await rekognitionClient.send(labelCommand);
        if (labelResponse.Labels) {
          generatedTags = labelResponse.Labels.map(l => l.Name as string);
          console.log("✅ AI Tags:", generatedTags);
        }
      } catch (e) { console.error("Tagging error:", e); }

      // ENGINE 2: FACIAL RECOGNITION MATCHING
      try {
        const faceCommand = new SearchFacesByImageCommand({
          CollectionId: COLLECTION_ID,
          Image: { S3Object: { Bucket: process.env.AWS_BUCKET_NAME!, Name: s3Key } },
          FaceMatchThreshold: 85, // Must be 85% sure it's the same person
          MaxFaces: 5 
        });
        const faceResponse = await rekognitionClient.send(faceCommand);
        
        if (faceResponse.FaceMatches && faceResponse.FaceMatches.length > 0) {
          // 1. Extract AWS FaceIds from the match
          const matchedFaceIds = faceResponse.FaceMatches.map(match => match.Face?.FaceId).filter(Boolean) as string[];
          console.log("✅ AWS Matched Face IDs:", matchedFaceIds);
          
          // 2. Look up those FaceIds in our PostgreSQL Database to find the real Users
          const matchedUsers = await prisma.user.findMany({
            where: { awsFaceId: { in: matchedFaceIds } },
            select: { id: true }
          });
          
          detectedUserIds = matchedUsers.map(u => u.id);
          console.log("✅ Tagged Postgres User IDs:", detectedUserIds);
        } else {
          console.log("ℹ️ No registered faces matched in this photo.");
        }
      } catch (e: any) {
        // If there are literally no faces in the photo (like a picture of a laptop), AWS throws an error. We just catch it and move on.
        if (e.name === 'InvalidParameterException') {
          console.log("ℹ️ No human faces detected to search.");
        } else {
          console.error("Face search error:", e.message);
        }
      }
    }

    // Save EVERYTHING to the Database
    const media = await prisma.media.create({
      data: { 
        s3Url, s3Key, type, size, albumId, uploaderId,
        tags: generatedTags,
        facesInPhoto: detectedUserIds // <--- Boom. Users are now tagged!
      }
    });
    
    console.log("--- Pipeline Complete! Saved to DB ---\n");
    res.json(media);
  } catch (error) {
    console.error("Confirmation Error:", error);
    res.status(500).json({ error: "Failed to save media to database" });
  }
});



// ==========================================
// DYNAMIC WATERMARKING & DOWNLOAD PIPELINE
// ==========================================
app.get('/api/media/download/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { userId } = req.query; // Who is downloading it?

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: "User ID is required to determine role." });
    }

    // 1. Fetch Media, Album, Event, and User from Database
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { album: { include: { event: true } } }
    });
    
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!media || !user) return res.status(404).json({ error: "Media or User not found." });

    // 2. Fetch the raw image buffer directly from AWS S3
    const s3Command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: media.s3Key,
    });
    const s3Response = await s3Client.send(s3Command);
    
    // Convert S3 stream to a Node.js Buffer
    const streamToBuffer = async (stream: any) => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    };
    const originalImageBuffer = await streamToBuffer(s3Response.Body);

    // 3. Create the Dynamic Watermark SVG
    const watermarkText = `${media.album.event.clubName} - ${media.album.event.name} - ${user.role}`;
    
    // We create a semi-transparent black background with white text
    const svgImage = `
      <svg width="800" height="100">
        <style>
          .title { fill: #ffffff; font-size: 32px; font-family: Arial, sans-serif; font-weight: bold; }
          .bg { fill: rgba(0, 0, 0, 0.6); }
        </style>
        <rect width="100%" height="100%" class="bg" rx="10" ry="10" />
        <text x="50%" y="60%" text-anchor="middle" class="title">${watermarkText}</text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgImage);

    // 4. Use 'sharp' to overlay the watermark onto the original image
    console.log(`Applying Watermark: [${watermarkText}]`);
    const watermarkedBuffer = await sharp(originalImageBuffer)
      .composite([{ 
        input: svgBuffer, 
        gravity: 'southeast' // Put it in the bottom-right corner
      }])
      .toBuffer();

    // 5. Send back as an attachment to force the browser to download it
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="CIG_Event_${media.id}.jpg"`);
    res.send(watermarkedBuffer);

  } catch (error) {
    console.error("Watermark/Download Error:", error);
    res.status(500).json({ error: "Failed to process download" });
  }
});


// ==========================================
// SOCIAL FEATURES & GALLERY DISPLAY
// ==========================================

// 1. Fetch all media for the Gallery (Includes tags, likes, and comments!)
app.get('/api/media', async (req, res) => {
  try {
    const media = await prisma.media.findMany({
      orderBy: { createdAt: 'desc' }, // Newest first
      include: {
        uploader: { select: { name: true } },
        interactions: true,
        comments: { include: { user: { select: { name: true } } } }
      }
    });
    res.json(media);
  } catch (error) {
    console.error("Fetch Media Error:", error);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

// 2. Like a Photo
app.post('/api/media/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Check if already liked to prevent duplicates
    const existingLike = await prisma.interaction.findFirst({
      where: { mediaId: id, userId: userId, type: "LIKE" }
    });

    if (existingLike) {
      // If already liked, un-like it (toggle)
      await prisma.interaction.delete({ where: { id: existingLike.id } });
      return res.json({ message: "Unliked photo" });
    }

    // Create the Like
    const like = await prisma.interaction.create({
      data: { mediaId: id, userId, type: "LIKE" }
    });
    
    // NOTE: This is where we would trigger the Real-Time Notification!
    console.log(`User ${userId} liked media ${id}`);
    
    res.json(like);
  } catch (error) {
    console.error("Like Error:", error);
    res.status(500).json({ error: "Failed to like media" });
  }
});

// 3. Comment on a Photo
app.post('/api/media/:id/comment', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, text } = req.body;

    const comment = await prisma.comment.create({
      data: { mediaId: id, userId, text }
    });

    console.log(`User ${userId} commented: "${text}"`);
    res.json(comment);
  } catch (error) {
    console.error("Comment Error:", error);
    res.status(500).json({ error: "Failed to post comment" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});