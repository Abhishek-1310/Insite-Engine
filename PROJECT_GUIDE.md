# 🧠 INSIGHT ENGINE — Complete Project Guide
# Developer Notes, How to Run, Architecture Explained
# ====================================================

---

## 📌 TABLE OF CONTENTS

1. [How to Run the Project (Step-by-Step)](#-how-to-run-the-project)
2. [Pre-Requisites Checklist](#-pre-requisites-checklist)
3. [How This Project Was Built (Module-by-Module)](#-how-this-project-was-built)
4. [Unique Concepts & Developer Notes](#-unique-concepts--developer-notes)
5. [File-by-File Explanation](#-file-by-file-explanation)
6. [Common Errors & Fixes](#-common-errors--fixes)
7. [Interview Talking Points](#-interview-talking-points)

---

## 🚀 HOW TO RUN THE PROJECT

### OPTION A: Run Frontend Locally (UI Preview)

```bash
# 1. Navigate to the frontend folder
cd frontend

# 2. Install dependencies (already done, but run if needed)
npm install

# 3. Start the dev server
npm run dev
```

➡️ Opens at **http://localhost:5173**
➡️ You will see the full UI — upload area, document list, chat interface.
➡️ API calls will fail until the backend is deployed (see Option B).

---

### OPTION B: Deploy Backend to AWS (Full Working App)

This is the **real deployment**. It creates real AWS resources.

#### Step 1: Setup Your Environment Variables

```bash
cd backend

# Create a .env file from the example
cp .env.example .env

# Edit the .env file with YOUR real keys
nano .env   # or open in VS Code
```

Your `.env` should look like:
```
GEMINI_API_KEY=AIzaSy...your_real_key
PINECONE_API_KEY=pcsk_...your_real_key
UPLOAD_BUCKET=insight-engine-uploads-dev
STAGE=dev
PINECONE_INDEX=insight-engine
```

#### Step 2: Setup Pinecone Index

1. Go to [Pinecone Console](https://app.pinecone.io/)
2. Click **"Create Index"**
3. Settings:
   - **Name**: `insight-engine`
   - **Dimensions**: `768` ← This MUST match Gemini's embedding size
   - **Metric**: `cosine`
   - **Cloud**: Any (AWS us-east-1 recommended for lowest latency)
4. Click Create

> 🔑 **WHY 768?** Google's `text-embedding-004` model outputs 768-dimensional vectors.
> If you set this wrong, Pinecone will reject every upsert with a dimension mismatch error.

#### Step 3: Configure AWS Credentials

```bash
# Option A: AWS CLI (recommended)
aws configure
# Enter your Access Key ID, Secret Key, region: us-east-1

# Option B: Environment variables
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=wJalr...
```

#### Step 4: Deploy Backend

```bash
cd backend

# Install serverless globally (if not installed)
npm install -g serverless

# Deploy to dev stage
npx serverless deploy --stage dev
```

**What happens when you run this:**
```
✔ Service deployed to stack insight-engine-dev

endpoints:
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/upload-url
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/ask
  GET  - https://abc123.execute-api.us-east-1.amazonaws.com/documents
  DELETE - https://abc123.execute-api.us-east-1.amazonaws.com/documents/{documentId}

functions:
  getUploadUrl: insight-engine-dev-getUploadUrl
  onFileUpload: insight-engine-dev-onFileUpload
  ask: insight-engine-dev-ask
  listDocuments: insight-engine-dev-listDocuments
  deleteDocument: insight-engine-dev-deleteDocument
```

> 📋 **COPY** the base URL (`https://abc123.execute-api...amazonaws.com`).
> You need this for the frontend.

#### Step 5: Connect Frontend to Backend

```bash
cd frontend

# Create .env file with your API URL
echo "VITE_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com" > .env

# Restart dev server
npm run dev
```

Now the full app works end-to-end! 🎉

#### Step 6: Test the Full Flow

1. Open **http://localhost:5173**
2. **Drag a PDF** onto the upload zone
3. Wait for "Processing" to complete (10-30 seconds)
4. **Ask a question** in the chat: _"What skills are mentioned?"_
5. Get an AI answer sourced from your PDF!

---

### OPTION C: Auto-Deploy via GitHub (CI/CD)

Once you push to `main`, GitHub Actions handles everything automatically.

```bash
# 1. Initialize git (if not already)
git init

# 2. Add remote
git remote add origin https://github.com/Abhishek-1310/Insite-Engine.git

# 3. Add all files
git add .
git commit -m "🚀 Insight Engine - Complete RAG Application"

# 4. Push to main → Triggers auto-deploy
git push -u origin main
```

**Required GitHub Secrets** (Settings → Secrets → Actions):

| Secret Name             | Where to Get It                         |
|-------------------------|-----------------------------------------|
| `AWS_ACCESS_KEY_ID`     | AWS Console → IAM → Users → Access Keys |
| `AWS_SECRET_ACCESS_KEY` | Same as above (shown only once!)         |
| `GEMINI_API_KEY`        | https://aistudio.google.com/apikey       |
| `PINECONE_API_KEY`      | https://app.pinecone.io/ → API Keys     |
| `API_URL`               | Output from `serverless deploy`          |
| `VERCEL_TOKEN`          | https://vercel.com/account/tokens        |
| `VERCEL_ORG_ID`         | Vercel Dashboard → Settings              |
| `VERCEL_PROJECT_ID`     | Vercel Dashboard → Project → Settings    |

---

## ✅ PRE-REQUISITES CHECKLIST

Before running anything, make sure you have:

- [ ] **Node.js 20+** installed (`node --version`)
- [ ] **npm** installed (`npm --version`)
- [ ] **AWS CLI** configured (`aws sts get-caller-identity`)
- [ ] **Google AI Studio API Key** — [Get it here](https://aistudio.google.com/apikey)
- [ ] **Pinecone Account** with index created — [Sign up](https://app.pinecone.io/)
- [ ] **Pinecone Index** named `insight-engine`, 768 dimensions, cosine metric
- [ ] **GitHub Repo** created at https://github.com/Abhishek-1310/Insite-Engine

---

## 🏗️ HOW THIS PROJECT WAS BUILT

### Module 1: Infrastructure & CI/CD Setup

**Files Created:**
- `serverless.yml` — The single most important file. This is **Infrastructure as Code**.
- `.github/workflows/deploy.yml` — CI/CD pipeline.
- `backend/package.json` + `tsconfig.json` — Project configuration.

**What `serverless.yml` does (in plain English):**
```
"Hey AWS, please create:
  1. An S3 bucket called 'insight-engine-uploads-dev'
  2. An API Gateway with CORS enabled
  3. Five Lambda functions connected to HTTP routes
  4. An S3 trigger that fires when a file is uploaded
  5. IAM permissions so Lambdas can read/write to S3
  
...and do all of this with a single command."
```

**Why Serverless Framework?**
- You DON'T need to click around the AWS Console
- Everything is version-controlled (git tracks your infrastructure)
- One command deploys everything: `serverless deploy`
- One command destroys everything: `serverless remove` (no leftover costs)

---

### Module 2: The Ingestion Engine (PDF → Brain)

**Files Created:**
- `src/handlers/upload.ts` — Generates pre-signed S3 URLs
- `src/handlers/ingest.ts` — The S3 trigger Lambda (the heavy lifter)
- `src/services/pdf.ts` — PDF text extraction + smart chunking
- `src/services/gemini.ts` — Google Gemini AI integration
- `src/services/pinecone.ts` — Vector database operations
- `src/services/s3.ts` — S3 file operations

**The Flow (step by step):**

```
User clicks "Upload PDF"
        │
        ▼
[Frontend] → POST /upload-url → [Lambda: getUploadUrl]
        │                              │
        │                    Generates a pre-signed S3 URL
        │                    (valid for 5 minutes)
        │                              │
        ▼                              ▼
[Frontend] → PUT directly to S3 ← (pre-signed URL)
        │         (file goes DIRECTLY to S3,
        │          never touches our server!)
        │
        ▼
[S3 Bucket] fires s3:ObjectCreated event
        │
        ▼
[Lambda: onFileUpload] is triggered automatically
        │
        ├─ 1. Downloads PDF from S3
        ├─ 2. Extracts text using pdf-parse library
        ├─ 3. Chunks text into ~1000 char pieces (with 200 char overlap)
        ├─ 4. Sends each chunk to Gemini Embedding API → gets 768-dim vectors
        └─ 5. Upserts vectors + metadata into Pinecone
```

---

### Module 3: The Retrieval & Chat API (RAG)

**File Created:**
- `src/handlers/ask.ts` — The brain of the app

**The RAG Flow:**

```
User asks: "What programming languages does this person know?"
        │
        ▼
[Lambda: ask]
        │
        ├─ 1. Convert question → 768-dim vector (Gemini Embedding API)
        │
        ├─ 2. Query Pinecone: "Find the 3 chunks most similar to this vector"
        │      └─ Returns chunks like:
        │           "...proficient in Python, JavaScript, TypeScript..."
        │           "...experience with React, Node.js, AWS..."
        │           "...built microservices using Go and Rust..."
        │
        ├─ 3. Build prompt:
        │      "Here is context from documents: [chunks above]
        │       User's question: What programming languages...?
        │       Answer based ONLY on the context provided."
        │
        └─ 4. Send to Gemini 1.5 Flash → Get answer → Return to user
```

> 🧠 **WHY RAG?** LLMs have a knowledge cutoff and hallucinate. RAG grounds
> the answer in YOUR actual documents. The AI can only answer using what you
> uploaded — no made-up facts.

---

### Module 4: The Frontend (React Dashboard)

**Files Created:**
- `src/App.tsx` — Main layout (3-column grid)
- `src/components/FileUploader.tsx` — Drag-and-drop with progress bar
- `src/components/DocumentList.tsx` — Shows processed PDFs
- `src/components/ChatInterface.tsx` — ChatGPT-style chat
- `src/lib/api.ts` — API client (all HTTP calls)

**Design Decisions:**
- **Glassmorphism UI** — `bg-white/5 backdrop-blur-xl` for the premium look
- **Dark theme** — Professional, easy on the eyes
- **XHR for uploads** (not fetch) — Because `XMLHttpRequest` gives you upload progress events. `fetch()` does NOT support upload progress.
- **react-dropzone** — Industry-standard drag-and-drop library
- **react-markdown** — Renders AI responses with proper formatting (bold, lists, code blocks)
- **lucide-react** — Beautiful, consistent icons

---

### Module 5: Security & Optimization

**Key Security Measures:**

1. **Pre-signed URLs** — Files go Browser → S3 directly. Our Lambda never
   handles file bytes, saving memory and reducing attack surface.

2. **Environment Variables** — API keys are NEVER in code.
   - Locally: `.env` files (git-ignored)
   - Production: GitHub Secrets → injected at deploy time

3. **Input Validation** — Every handler validates:
   - `contentType` must be `application/pdf`
   - `question` must be non-empty and under 2000 chars
   - `documentId` must exist before deletion

4. **CORS Locked Down** — Only `localhost:5173` and `*.vercel.app` can call the API.

5. **S3 Lifecycle** — Files auto-delete after 90 days (no surprise storage bills).

6. **Least-Privilege IAM** — Lambda can ONLY access the specific S3 bucket, nothing else.

---

## 💡 UNIQUE CONCEPTS & DEVELOPER NOTES

### 🔹 Note 1: What is RAG and Why Does It Matter?

**RAG = Retrieval-Augmented Generation**

Without RAG:
```
User: "What's in my resume?"
AI: "I don't know, I'm a general model." (or worse, it hallucinates)
```

With RAG:
```
User: "What's in my resume?"
System: *searches vector DB* → finds relevant chunks → feeds to AI
AI: "Based on your resume, you have 3 years of experience in..."
```

RAG is the #1 pattern used in production AI applications (ChatGPT with browsing,
Notion AI, GitHub Copilot docs search — all use RAG).

---

### 🔹 Note 2: Why Chunking with Overlap?

We split documents into ~1000 character chunks with 200 character overlap.

```
Original text: [AAAAAAA|BBBBBBB|CCCCCCC]

Without overlap:
  Chunk 1: [AAAAAAA]
  Chunk 2: [BBBBBBB]  ← What if a sentence spans the A-B boundary?
  Chunk 3: [CCCCCCC]     That sentence is broken and lost!

With overlap (200 chars):
  Chunk 1: [AAAAAAA|BB]
  Chunk 2: [BB|BBBBBBB|CC]  ← Boundary sentences appear in BOTH chunks
  Chunk 3: [CC|CCCCCCC]        Nothing is lost!
```

The overlap ensures no information falls through the cracks.

---

### 🔹 Note 3: Why Pre-signed URLs (Not Direct Upload)?

**Bad approach:** Browser → Our Server → S3 (Lambda processes the whole file)
```
Problem: Lambda has 6MB payload limit and 15 min timeout.
A 50MB PDF would crash the Lambda.
```

**Our approach:** Browser → S3 directly (via pre-signed URL)
```
1. Browser asks Lambda: "Give me a URL to upload to"
2. Lambda generates a pre-signed URL (just a signed string, no file data)
3. Browser uploads DIRECTLY to S3 using that URL
4. S3 trigger fires a SEPARATE Lambda to process the file
```

Benefits:
- No payload size limits on upload
- Lambda stays lightweight
- Upload progress works (browser ↔ S3 directly)

---

### 🔹 Note 4: Cosine Similarity — How Vector Search Works

When you embed text, it becomes a point in 768-dimensional space.

```
"Python developer" → [0.12, -0.45, 0.89, ... 768 numbers]
"JavaScript coder" → [0.11, -0.42, 0.85, ... 768 numbers]  ← Similar!
"Pizza recipe"     → [0.95, 0.23, -0.67, ... 768 numbers]  ← Very different!
```

Cosine similarity measures the **angle** between vectors:
- Score ~1.0 = Very similar
- Score ~0.5 = Somewhat related
- Score ~0.0 = Unrelated

Pinecone finds the top-3 chunks with the highest cosine similarity to your question.

---

### 🔹 Note 5: Why Serverless Framework (Not Terraform/CDK)?

| Feature              | Serverless Framework | Terraform   | AWS CDK     |
|----------------------|---------------------|-------------|-------------|
| Learning Curve       | ⭐ Easy             | ⭐⭐⭐ Hard  | ⭐⭐ Medium |
| Lines of Config      | ~100 lines          | ~500 lines  | ~300 lines  |
| Lambda-Focused       | ✅ Built for it     | ❌ General  | ⚠️ Verbose  |
| Plugin Ecosystem     | ✅ Rich             | ✅ Rich     | ⚠️ Limited  |
| Deploy Command       | `sls deploy`        | `tf apply`  | `cdk deploy`|

For a Lambda-centric project like this, Serverless Framework is the fastest path.

---

### 🔹 Note 6: The esbuild Plugin — Why It's Critical

```yaml
plugins:
  - serverless-esbuild
```

Without this plugin, you'd need to:
1. Compile TypeScript → JavaScript manually
2. Bundle node_modules into the Lambda package
3. Manage source maps yourself

`serverless-esbuild` does ALL of this automatically:
- Compiles TS → JS in milliseconds (esbuild is 100x faster than webpack)
- Tree-shakes unused code (smaller Lambda packages = faster cold starts)
- Generates source maps for debugging

---

### 🔹 Note 7: The S3 Trigger Pattern

```yaml
onFileUpload:
  handler: src/handlers/ingest.handler
  events:
    - s3:
        bucket: ${self:custom.uploadBucket}
        event: s3:ObjectCreated:*
```

This is an **event-driven architecture**:
- No polling. No cron jobs. No waste.
- The Lambda only runs when a file is ACTUALLY uploaded.
- AWS charges you ONLY for the execution time (~10-30 seconds per PDF).
- If nobody uploads for a month, you pay $0.

---

### 🔹 Note 8: How VITE_API_URL Works

Vite has a special convention: any env variable starting with `VITE_` is
exposed to the frontend JavaScript bundle.

```typescript
// In api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
```

- `VITE_API_URL` → accessible in browser code ✅
- `API_SECRET_KEY` → NOT accessible (no VITE_ prefix) ❌ (this is good for security!)

---

## 📂 FILE-BY-FILE EXPLANATION

### Backend Files

| File | Purpose | Key Concept |
|------|---------|-------------|
| `serverless.yml` | Defines ALL AWS infrastructure | Infrastructure as Code |
| `src/config.ts` | Reads & validates env vars | Fail-fast pattern |
| `src/handlers/upload.ts` | `POST /upload-url` — generates pre-signed S3 URL | Pre-signed URL pattern |
| `src/handlers/ingest.ts` | S3 trigger — PDF → chunks → embeddings → Pinecone | Event-driven ingestion |
| `src/handlers/ask.ts` | `POST /ask` — RAG query pipeline | RAG pattern |
| `src/handlers/documents.ts` | `GET/DELETE /documents` — CRUD | REST API |
| `src/services/gemini.ts` | Gemini AI SDK — embeddings + chat generation | AI integration |
| `src/services/pinecone.ts` | Pinecone SDK — vector upsert, query, delete | Vector DB operations |
| `src/services/pdf.ts` | pdf-parse + smart text chunking | NLP preprocessing |
| `src/services/s3.ts` | AWS S3 SDK — file operations | Cloud storage |
| `src/utils/response.ts` | Standardized API JSON responses | API patterns |

### Frontend Files

| File | Purpose | Key Concept |
|------|---------|-------------|
| `App.tsx` | Main layout — 3-column responsive grid | Component composition |
| `FileUploader.tsx` | Drag-drop PDF upload with progress bar | XHR upload progress |
| `DocumentList.tsx` | List of processed documents with delete | REST integration |
| `ChatInterface.tsx` | ChatGPT-style chat with markdown rendering | Conversational UI |
| `lib/api.ts` | All HTTP calls to the backend | API client layer |
| `index.css` | Tailwind + glassmorphism + animations | Modern CSS |
| `vite.config.ts` | Dev server + API proxy + build config | Build tooling |
| `tailwind.config.js` | Custom colors, animations, theme | Design system |

### Infrastructure Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | Auto-deploy on push to main |
| `.gitignore` | Keeps node_modules, .env, build artifacts out of git |
| `.env.example` (backend) | Template for required env vars |
| `.env.example` (frontend) | Template for frontend env vars |

---

## 🐛 COMMON ERRORS & FIXES

### Error: "Missing required environment variable: GEMINI_API_KEY"
**Fix:** Create `backend/.env` file with your real API keys. See Step 1 above.

### Error: Pinecone "Dimension mismatch"
**Fix:** Your Pinecone index must have exactly `768` dimensions.
Delete and recreate the index with the correct setting.

### Error: "AccessDenied" on S3
**Fix:** Check your AWS IAM user has S3 permissions, or run `aws configure`
with the correct credentials.

### Error: CORS error in browser
**Fix:** Make sure the frontend URL is in the `allowedOrigins` in `serverless.yml`.
For local dev, `http://localhost:5173` is already included.

### Error: "The security token included in the request is expired"
**Fix:** Your AWS credentials expired. Run `aws configure` again or refresh
your temporary credentials.

### Error: Frontend shows but API calls fail
**Fix:** Either:
1. Backend not deployed yet → Run `npx serverless deploy`
2. Wrong API URL → Check `frontend/.env` has the correct `VITE_API_URL`

### Error: `serverless deploy` fails with "bucket already exists"
**Fix:** S3 bucket names are globally unique. Change `uploadBucket` in
`serverless.yml` to something unique like `insight-engine-uploads-yourname-dev`.

---

## 🎯 INTERVIEW TALKING POINTS

When presenting this project, highlight:

1. **"I built a full-stack RAG application from scratch"**
   — RAG is the hottest AI pattern in production right now.

2. **"The entire infrastructure is defined as code"**
   — `serverless.yml` creates S3, API Gateway, Lambda, IAM roles — all in one file.

3. **"Zero-cost architecture"**
   — Lambda, S3, API Gateway are all pay-per-use. No traffic = $0 bill.

4. **"Event-driven ingestion"**
   — S3 upload triggers Lambda automatically. No polling, no wasted compute.

5. **"Pre-signed URL pattern"**
   — Files go directly from browser to S3, bypassing the server entirely.

6. **"CI/CD pipeline"**
   — Push to GitHub → auto-deploys everything. Production-grade workflow.

7. **"I understand vector embeddings and cosine similarity"**
   — You can explain how text becomes vectors and how semantic search works.

8. **"Smart chunking with overlap"**
   — Shows understanding of NLP data preprocessing.

---

## 💰 COST BREAKDOWN (Why This Is Effectively Free)

| Service        | Free Tier                        | Your Usage          |
|----------------|----------------------------------|---------------------|
| AWS Lambda     | 1M requests/month free           | ~100 requests/month |
| API Gateway    | 1M requests/month free           | ~100 requests/month |
| S3             | 5GB free for 12 months           | < 100MB             |
| Gemini API     | 15 RPM free (AI Studio)          | ~50 requests/month  |
| Pinecone       | Free tier: 1 index, 100K vectors | ~1000 vectors       |
| Vercel         | Free for personal projects       | 1 deployment        |
| GitHub Actions | 2000 min/month free              | ~5 min/deploy       |

**Total monthly cost: $0.00** ✅

---

## 🔄 USEFUL COMMANDS REFERENCE

```bash
# ── Backend ──
cd backend
npm install                          # Install dependencies
npx tsc --noEmit                     # Type-check (no output files)
npx serverless deploy --stage dev    # Deploy to AWS (dev)
npx serverless deploy --stage prod   # Deploy to AWS (prod)
npx serverless remove --stage dev    # DESTROY all AWS resources
npx serverless info --stage dev      # Show deployed endpoints
npx serverless logs -f ask -t        # Tail logs for the 'ask' function

# ── Frontend ──
cd frontend
npm install                          # Install dependencies
npm run dev                          # Start dev server (localhost:5173)
npm run build                        # Production build
npm run preview                      # Preview production build

# ── Git ──
git add .
git commit -m "your message"
git push origin main                 # Triggers auto-deploy!

# ── Debugging ──
aws s3 ls s3://insight-engine-uploads-dev/    # List S3 files
aws logs tail /aws/lambda/insight-engine-dev-ask --follow  # Live logs
```

---

*Last updated: February 2026*
*Built by Abhishek — Full-Stack Developer*
