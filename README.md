# Campus Event Media Management Platform

A secure, decoupled full-stack Event Media Management Platform designed for campus organizations to organize event galleries, automate image processing, and streamline photo delivery. Using a stateless Next.js frontend and an Express.js API gateway, the platform integrates AWS Rekognition to automatically index faces, tag images, and serve personalized "Photos of Me" feeds to registered users.

---

## Key Features

* **Decoupled 4-Tier Stack**: Clean separation of concerns between a Next.js (Vercel) presentational layer, an Express.js (Render) API gateway, a PostgreSQL (Neon) database managed via Prisma ORM, and AWS cloud resources.
* **Strict Media Ingest & Transcoding**: Restricts uploads strictly to standard `JPEG` and `PNG` formats. Images are streamed as Base64 payloads directly to the server to bypass browser S3 CORS limitations, where they are dynamically transcoded and compressed to standardized JPEGs using **Sharp** before storage.
* **AI-Powered Face Matching & Auto-Tagging**: Leverages **AWS Rekognition** to automatically detect labels (tags) and search faces against an indexed collection using a custom 70% confidence threshold, instantly tagging recognized users in new uploads.
* **Interactive Event & Album Studio**: A hierarchical event creator supporting event sorting (by event date or date created), metadata previews, and in-card nested album creation.
* **Friends & Connections Lounge**: An interactive simulated social network. Users can send friend requests using validated institutional emails (`name@iitr.ac.in`), accept/ignore pending requests, and switch profiles instantly locally to test notification triggers.
* **Database-Backed Notification Engine**: Automatically writes pending notification rows to your PostgreSQL database when users receive friend requests, manual tags, photo comments, or likes.
* **Secure S3 Proxy Streaming & Dynamic Watermarking**: Prevents direct public access to your S3 bucket. Media is served securely via a backend proxy (`/api/media/stream`), dynamically compositing custom SVG watermarks (detailing club name, event metadata, and user role) onto the image buffer on download.

---

## Technical Architecture & Schema

### System Architecture Flow (Decoupled Model)

```
[ Next.js Client Layer (Vercel) ]
             │
             ▼ (Base64 Binary Payload)
[ Express.js API Gateway (Render) ] ──── Auth check ────► [ Bcrypt / JWT Middleware ]
             │
             ├──── Optimize Buffer ────► [ Sharp Image Processor ]
             │                                   │
             ├──── Direct PUT Stream             ▼ (Standardized JPEG)
             ├──────────────────────────► [ Amazon S3 Object Storage ]
             │
             ├──── Trigger Face Scan ───► [ AWS Rekognition AI Engine ]
             │                                   │
             ▼ (ORM Transaction Queries)         ▼ (Auto-Tags & Face IDs)
[ Prisma ORM Client ] ───────────────────────────┘
             │
             ▼
[ Neon PostgreSQL Relational Database ]
```

---

## Local Setup & Installation

### Prerequisites
* **Node.js** (v18 or higher)
* **PostgreSQL** Database Instance (Local or Hosted, e.g., Neon / Supabase)
* **AWS Account** with an active S3 Bucket and Rekognition access

### 1. Database Configuration & Migrations
Configure your connection string inside `backend/prisma/.env` (or your system environment variables):
```bash
DATABASE_URL="postgresql://username:password@localhost:5432/cig_emmp?schema=public"
```

Inside your `backend` directory, generate your database client and push the schema:
```bash
cd backend
npx prisma generate
npx prisma db push
```

### 2. Backend Configuration
Create a `.env` file inside your `backend/` directory:
```env
PORT=5001
DATABASE_URL="your-postgresql-connection-string"
AWS_REGION="your-aws-region"
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
AWS_BUCKET_NAME="your-s3-bucket-name"
JWT_SECRET="your-custom-jwt-signing-secret"
REKOGNITION_COLLECTION_ID="cig-faces-collection"
```

Start your backend development server:
```bash
npm run dev
```
*The server will boot by default on `http://localhost:5001`.*

### 3. Frontend Configuration
Create a `.env` file inside your `frontend/` directory:
```env
NEXT_PUBLIC_API_URL="http://localhost:5001"
```

Start your Next.js development server:
```bash
cd ../frontend
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## Production Deployment

### Backend (Hosted on Render)
To deploy the backend to Render, connect your GitHub repository and set the following parameters:

1. **Root Directory**: `backend` (or leave blank if it is a standalone repository).
2. **Build Command**: `npm install`
3. **Start Command (Memory-Optimized)**: 
   ```bash
   npx ts-node --transpile-only index.ts
   ```
   Note: Using the `--transpile-only` flag is critical on free-tier hosting (e.g., 512MB RAM) to bypass heavy TypeScript compiler checks on runtime, preventing Out-Of-Memory (OOM) process crashes.
4. **Environment Variables**: Add all variables defined in your local `backend/.env` file directly into Render's **Environment** tab.

### Frontend (Hosted on Vercel)
Deploy your frontend folder to Vercel and apply the following environment variable:

1. **NEXT_PUBLIC_API_URL**: Set this to your live production backend URL provided by Render (e.g., `https://cig-backend.onrender.com`). *Do not include a trailing slash.*
2. **Cache-Busting Design**: The frontend's `fetch` system uses strict dynamic parameters (`?t=${Date.now()}`) and `{ cache: "no-store" }` to prevent Vercel's edge network from caching `GET` requests, guaranteeing instant updates to your Gallery Feed upon uploads.
