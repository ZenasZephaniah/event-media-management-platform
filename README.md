# CIG Event and Media Management Platform

cig-media-platform is a secure, full-stack campus media management platform that serves as a unified repository for campus group events. The platform features secure server-side S3 upload pipelines, dynamic image transcoding, AWS Rekognition-powered facial indexing/labeling, and role-based access control.

---

## Key Features

### Core Media & Event Studio
* **Hierarchical Organization**: Structure media by **Events ➔ Albums ➔ Photos** cleanly inside a dedicated studio.
* **Smart Sorting**: Sort campus events dynamically by Event Date or Creation Date.
* **Cascading Relational Deletion**: Safe, recursive backend database cleanups. Deleting an event or album automatically removes all associated S3 storage objects and database records to prevent orphaned data.

### Secure Ingest Pipeline (JPEG & PNG Enforced)
* **Server-Side S3 Uploads**: Bypasses browser-to-S3 CORS limitations by streaming uploads through Node.js using secure server credentials.
* **Image Optimization (Sharp)**: Automatically transcodes incoming images into optimized JPEG buffers, standardizing storage footprints and maximizing compatibility.
* **Instant Queue Previews**: Previews render instantly using local Base64 streams without hanging on browser memory links.

### AWS Rekognition AI Integration
* **Auto-Tagging**: Detects labels (e.g., `#landscape`, `#people`) automatically during upload to enable metadata search.
* **Selfie Reference Registration**: Users can register a reference facial selfie on their profile.
* **AI Match Feed**: Filters the main gallery to display only photos matching your registered face index with a optimized confidence threshold.

### Access Control & Guest Mode
* **Inclusive Access**: Launches in Guest Mode (Viewer), allowing unauthenticated users to view public media.
* **Role-Based Access Control (RBAC)**: Supports roles (`ADMIN`, `PHOTOGRAPHER`, `CLUB_MEMBER`, `VIEWER`) to restrict creation, upload, and deletion capabilities.

### Social Sandbox & Notifications
* **Social Sandbox Switcher**: Allows quick profile-switching during local tests to simulate interactions between friends.
* **Real-Time Notification Registry**: Triggers updates when users like your photo, comment, or tag you.
* **Secure S3 Streaming Proxy**: Protects direct S3 asset paths and enforces watermark overlays dynamically based on user role during download.

---

## Tech Stack

* **Frontend**: Next.js (React), Tailwind CSS, Lucide Icons, React Dropzone
* **Backend**: Node.js, Express.js, Sharp (Image Processing)
* **Database & ORM**: PostgreSQL, Prisma ORM
* **Cloud & AI/ML**: AWS S3 (Simple Storage Service), AWS Rekognition (Face Indexing & Labeling)

---

## Local Setup & Installation

### Prerequisites
* Node.js (v18+)
* PostgreSQL Database
* AWS Account with S3 Bucket and Rekognition access

### 1. Database Migrations
Configure your database connection inside `prisma/.env` or your root environment variables:
```bash
DATABASE_URL="postgresql://username:password@localhost:5432/cig_emmp"
```
Generate your database client and push the schema:
```bash
npx prisma generate
npx prisma db push
```

### 2. Backend Configuration
Create a `.env` file in your `backend/` directory:
```env
PORT=5001
DATABASE_URL="your-postgresql-url"
AWS_REGION="your-aws-region"
AWS_ACCESS_KEY_ID="your-access-key-id"
AWS_SECRET_ACCESS_KEY="your-secret-access-key"
AWS_BUCKET_NAME="your-s3-bucket-name"
JWT_SECRET="your-jwt-signing-secret"
REKOGNITION_COLLECTION_ID="cig-faces-collection"
```
Start your backend server:
```bash
cd backend
npm run dev
```

### 3. Frontend Configuration
Create a `.env` file in your `frontend/` directory:
```env
NEXT_PUBLIC_API_URL="http://localhost:5001"
```
Start your frontend development server:
```bash
cd frontend
npm run dev
```
Open **`http://localhost:3000`** in your browser.
