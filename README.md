# Insight Engine — AI-Powered Second Brain 🧠

> A production-ready RAG (Retrieval-Augmented Generation) application that turns your PDF documents into a searchable, intelligent knowledge base powered by Google Gemini AI.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![AWS Lambda](https://img.shields.io/badge/AWS_Lambda-FF9900?style=for-the-badge&logo=awslambda&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

## 📐 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        INSIGHT ENGINE                            │
│                  AI-Powered Second Brain (RAG)                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌──────────────────────────────────────┐   │
│  │   Frontend   │     │          Backend (AWS Lambda)         │   │
│  │   (Vercel)   │     │         Serverless Framework          │   │
│  │              │     │                                      │   │
│  │  React +     │────▶│  ┌──────────┐   ┌────────────────┐  │   │
│  │  TypeScript  │     │  │ /upload   │   │ /ask           │  │   │
│  │  Tailwind    │◀────│  │ Pre-sign  │   │ RAG Pipeline   │  │   │
│  │  Vercel AI   │     │  │ URL API   │   │                │  │   │
│  └─────────────┘     │  └─────┬────┘   └───────┬────────┘  │   │
│                       │        │                 │            │   │
│                       │        ▼                 ▼            │   │
│                       │  ┌──────────┐   ┌────────────────┐  │   │
│                       │  │   S3     │   │   Gemini 1.5   │  │   │
│                       │  │  Bucket  │   │     Flash      │  │   │
│                       │  └────┬─────┘   └───────┬────────┘  │   │
│                       │       │                  │            │   │
│                       │       ▼                  ▼            │   │
│                       │  ┌──────────┐   ┌────────────────┐  │   │
│                       │  │ Lambda   │   │   Pinecone     │  │   │
│                       │  │ Trigger  │──▶│  Vector DB     │  │   │
│                       │  │ (Ingest) │   │  (Embeddings)  │  │   │
│                       │  └──────────┘   └────────────────┘  │   │
│                       └──────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    CI/CD Pipeline                         │   │
│  │              GitHub Actions → Auto-Deploy                 │   │
│  │         (Push to main → Deploy Backend + Frontend)        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## 🔄 RAG Pipeline Flow

```
PDF Upload → S3 Bucket → Lambda Trigger → pdf-parse (Text Extraction)
    → Chunking (1000 chars, 200 overlap) → Gemini Embedding API
    → Pinecone Vector DB (Upsert)

User Question → Gemini Embedding → Pinecone Query (Top 3 Chunks)
    → Context + Question → Gemini 1.5 Flash → Streamed Answer
```

---

## 🛠️ Tech Stack

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| **Frontend**   | React 18 + TypeScript + Tailwind CSS |
| **Hosting**    | Vercel (Frontend) + AWS (Backend)    |
| **Backend**    | Node.js / TypeScript on AWS Lambda   |
| **IaC**        | Serverless Framework (`serverless.yml`) |
| **AI / LLM**   | Google Gemini 1.5 Flash             |
| **Embeddings** | Google Gemini `text-embedding-004`   |
| **Vector DB**  | Pinecone                             |
| **Storage**    | Amazon S3                            |
| **CI/CD**      | GitHub Actions                       |

---

## 📁 Project Structure

```
insight-engine/
├── backend/
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── ask.ts          # /ask endpoint — RAG query pipeline
│   │   │   ├── documents.ts    # /documents CRUD endpoints
│   │   │   ├── ingest.ts       # S3 trigger — PDF → embeddings → Pinecone
│   │   │   └── upload.ts       # /upload-url — pre-signed S3 URL
│   │   ├── services/
│   │   │   ├── gemini.ts       # Gemini AI SDK (embeddings + chat)
│   │   │   ├── pinecone.ts     # Pinecone vector operations
│   │   │   ├── pdf.ts          # PDF parsing and text chunking
│   │   │   └── s3.ts           # S3 file operations
│   │   ├── utils/
│   │   │   └── response.ts     # API response helpers
│   │   └── config.ts           # Environment configuration
│   ├── serverless.yml          # Infrastructure as Code
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx    # ChatGPT-style chat UI
│   │   │   ├── DocumentList.tsx     # Processed documents panel
│   │   │   └── FileUploader.tsx     # Drag-and-drop PDF uploader
│   │   ├── lib/
│   │   │   └── api.ts               # API client functions
│   │   ├── App.tsx                   # Main application layout
│   │   ├── main.tsx                  # React entry point
│   │   └── index.css                # Tailwind + custom styles
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD auto-deploy pipeline
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- AWS Account with IAM credentials
- Google AI Studio API Key (Gemini)
- Pinecone Account with an index named `insight-engine`
- GitHub Repository

### 1. Clone the Repository

```bash
git clone https://github.com/Abhishek-1310/Insite-Engine.git
cd Insite-Engine
```

### 2. Backend Setup

```bash
cd backend
npm install

# Create a .env file (for local development only)
cat > .env << EOF
GEMINI_API_KEY=your_gemini_api_key
PINECONE_API_KEY=your_pinecone_api_key
UPLOAD_BUCKET=insight-engine-uploads-dev
STAGE=dev
EOF

# Deploy to AWS
npx serverless deploy --stage dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install

# Create a .env file
echo "VITE_API_URL=https://your-api-gateway-url.amazonaws.com" > .env

# Run locally
npm run dev
```

### 4. Configure GitHub Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret                | Value                              |
| --------------------- | ---------------------------------- |
| `AWS_ACCESS_KEY_ID`   | Your AWS IAM Access Key            |
| `AWS_SECRET_ACCESS_KEY` | Your AWS IAM Secret Key          |
| `GEMINI_API_KEY`      | Your Google AI Studio API Key      |
| `PINECONE_API_KEY`    | Your Pinecone API Key              |
| `API_URL`             | Your deployed API Gateway URL      |
| `VERCEL_TOKEN`        | Your Vercel deployment token       |
| `VERCEL_ORG_ID`       | Your Vercel org ID                 |
| `VERCEL_PROJECT_ID`   | Your Vercel project ID             |

### 5. Push & Auto-Deploy

```bash
git add .
git commit -m "🚀 Initial Insight Engine deployment"
git push origin main
```

GitHub Actions will automatically:
1. ✅ Install dependencies
2. ✅ Type-check TypeScript
3. ✅ Deploy backend to AWS Lambda
4. ✅ Build and deploy frontend to Vercel

---

## 📡 API Endpoints

| Method   | Endpoint                | Description                        |
| -------- | ----------------------- | ---------------------------------- |
| `POST`   | `/upload-url`           | Get a pre-signed S3 upload URL     |
| `GET`    | `/documents`            | List all processed documents       |
| `DELETE` | `/documents/{id}`       | Delete a document and its vectors  |
| `POST`   | `/ask`                  | Ask a question (RAG pipeline)      |

### Example: Ask a Question

```bash
curl -X POST https://your-api-url/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What skills are mentioned in the resume?"}'
```

---

## 🔐 Security

- **Environment Variables**: All API keys are stored as GitHub Secrets and injected at deploy time — never committed to code.
- **Pre-signed URLs**: File uploads go directly from browser to S3 via time-limited pre-signed URLs (5-minute expiry).
- **CORS**: API Gateway configured with strict CORS for allowed origins only.
- **IAM Roles**: Lambda functions use least-privilege IAM roles scoped to the specific S3 bucket.
- **Input Validation**: All API endpoints validate and sanitize input parameters.
- **Auto-Cleanup**: S3 lifecycle rules automatically delete files after 90 days.

---

## 🧪 Pinecone Index Setup

Create a Pinecone index with these settings:

- **Name**: `insight-engine`
- **Dimensions**: `768` (matches Gemini `text-embedding-004` output)
- **Metric**: `cosine`
- **Cloud**: AWS / GCP (your preference)

---

## 📝 License

MIT License — Built by [Abhishek](https://github.com/Abhishek-1310)

added supadat api and youtube api key 