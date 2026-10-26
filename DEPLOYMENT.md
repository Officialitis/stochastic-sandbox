# Deployment Guide for Stochastic Sandbox

This repository contains a full-stack financial mathematics simulation application:
- **Frontend**: Next.js 16 (React 19, Plotly.js, KaTeX, Lucide) in `/frontend`
- **Backend**: FastAPI (Python 3.11, NumPy, SciPy, SymPy, ReportLab) in `/backend`

---

## 🚀 Option 1: Vercel + Railway (Recommended & Industry Standard)

This is the standard modern deployment setup with generous free tiers for personal projects.

### Step 1: Deploy Backend to Railway

1. Go to **[railway.com](https://railway.com)** (or railway.app) and sign in with your GitHub account.
2. Click **"New Project"** → **"Deploy from GitHub repo"**.
3. Select your repo: **`Officialitis/stochastic-sandbox`**.
4. Click on the created service card to open its settings:
   - Go to **Settings** → **Root Directory** → set to `backend` (or leave blank; Railway auto-detects `backend/Dockerfile` / `backend/railway.json`).
   - Go to **Settings** → **Networking** → Click **"Generate Domain"** to get your public backend URL (e.g., `https://stochastic-sandbox-backend.up.railway.app`).
5. Wait for the build to finish. Test it by opening `https://<YOUR-RAILWAY-URL>/api/health` in your browser. It should return `{"status":"ok","version":"1.0.0"}`.
6. Copy your public Railway URL!

---

### Step 2: Deploy Frontend to Vercel

1. Go to **[vercel.com](https://vercel.com)** and sign in with GitHub.
2. Click **"Add New..."** → **"Project"**.
3. Import **`Officialitis/stochastic-sandbox`**.
4. In the configuration screen:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: Click "Edit" and choose **`frontend`**
   - **Environment Variables**:
     - Key: `NEXT_PUBLIC_API_URL`
     - Value: `https://<YOUR-RAILWAY-URL>` *(paste the Railway URL from Step 1, without trailing slash)*
5. Click **"Deploy"**.
6. Within 1-2 minutes, your website will be live with a free `vercel.app` domain and automatic SSL!

---

## ⚡ Option 2: Render (Free Tier Alternative)

If you prefer Render:

### Deploy Backend:
1. Go to **[render.com](https://render.com)** and sign in with GitHub.
2. Click **"New +"** → **"Web Service"**.
3. Connect `Officialitis/stochastic-sandbox`.
4. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free
5. Click **"Create Web Service"**. Copy the Render URL (e.g. `https://stochastic-api.onrender.com`).

### Deploy Frontend (on Vercel or Render):
- In Vercel (recommended for Next.js): Follow Step 2 above with `NEXT_PUBLIC_API_URL` set to your Render URL.

---

## 🐳 Option 3: Docker / VPS Self-Hosting

To run both services on any Linux VPS (Ubuntu/Debian, DigitalOcean, Hetzner, AWS EC2):

1. Clone the repository:
   ```bash
   git clone https://github.com/Officialitis/stochastic-sandbox.git
   cd stochastic-sandbox
   ```
2. Start both containers:
   ```bash
   docker compose up -d --build
   ```
3. Frontend runs at `http://YOUR_SERVER_IP:3000` and Backend at `http://YOUR_SERVER_IP:8000`.
