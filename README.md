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
