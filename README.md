# ✦ Nexora — Adaptive AI Learning Mentor

A clean, warm-designed chat application powered by **IBM watsonx.ai** with three intelligent learning modes: Mentor, AI Assistant, and Cheat Code.

---

## Screenshots

> After cloning and running locally you'll see a warm, paper-toned chat interface with a sticky mode selector in the header.

---

## Features

- **Three learning modes** with distinct accent colours and behavior:
  - 🎓 **Mentor Mode** (deep indigo) — step-by-step guided learning
  - ⚡ **AI Assistant Mode** (teal) — fast, direct answers
  - 📋 **Cheat Code Mode** (amber) — two-section output: Short Notes + Exam-Ready Cheat Sheet with copy-to-clipboard
- **Mode directive injected on every turn** — the selected mode is explicitly re-stated in every request so the agent never drifts
- **Visual mode-switch markers** in the chat transcript so you always know when the mode changed
- IBM IAM bearer token **cached and auto-refreshed** server-side (~1 hr TTL)
- Smooth message animations, typing indicator, and graceful error states
- Responsive for mobile and desktop

---

## Prerequisites

- **Node.js ≥ 18** — [nodejs.org](https://nodejs.org)
- An **IBM Cloud account** with watsonx.ai access

---

## Getting Your IBM watsonx.ai Credentials

You need three values. Here's how to get each one:

### 1. `WX_API_KEY` — IBM Cloud API Key

1. Log in to [cloud.ibm.com](https://cloud.ibm.com)
2. Click your avatar (top-right) → **Manage → Access (IAM)**
3. Left sidebar → **API keys** → **Create an IBM Cloud API key**
4. Name it (e.g. `nexora-key`), copy the value — **you won't see it again**

### 2. `WX_PROJECT_ID` — watsonx.ai Project ID

1. Go to [dataplatform.cloud.ibm.com](https://dataplatform.cloud.ibm.com) (IBM watsonx)
2. Open or create a **project**
3. In the project, go to **Manage → General** — copy the **Project ID** (UUID)

### 3. `WX_DEPLOYMENT_URL` — Deployed Agent Endpoint

1. In your watsonx.ai project, open **Deployments** (or go to the Deployment Spaces section)
2. Find your deployed agent/model and open it
3. Copy the **Endpoint URL** — it looks like:
   ```
   https://us-south.ml.cloud.ibm.com/ml/v1/deployments/YOUR_DEPLOYMENT_ID/text/generation
   ```
   > For a chat model, the URL may end with `/text/chat` instead of `/text/generation`. Use whichever your deployment shows.

---

## Running Locally

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/nexora.git
cd nexora

# 2. Install dependencies
npm install

# 3. Set up credentials
cp .env.example .env
# Edit .env and fill in your three values

# 4. Start the server
npm start
# → http://localhost:3000
```

For development with auto-restart on file changes (Node 18+):

```bash
npm run dev
```

---

## Project Structure

```
nexora/
├── server.js           ← Express server: IAM token cache + /api/chat proxy
├── package.json
├── .env.example        ← Credential template (commit this)
├── .env                ← Your real credentials (never commit — in .gitignore)
├── .gitignore
├── README.md
└── public/
    ├── index.html      ← App shell
    ├── style.css       ← Warm academic design, 3 mode accents
    └── app.js          ← Chat UI logic
```

---

## Pushing to GitHub

```bash
# Initialise git (if not done already)
git init
git add .
git commit -m "Initial commit — Nexora"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/nexora.git
git branch -M main
git push -u origin main
```

> **Never push your `.env` file.** It is listed in `.gitignore`. Double-check with `git status` before pushing.

---

## Deploying to Render (Free Tier)

1. Go to [render.com](https://render.com) and sign in
2. Click **New → Web Service** → connect your GitHub repo
3. Configure:
   | Setting | Value |
   |---|---|
   | **Environment** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
4. Under **Environment Variables**, add:
   - `WX_API_KEY`
   - `WX_DEPLOYMENT_URL`
   - `WX_PROJECT_ID`
5. Click **Deploy** — Render will give you a `https://nexora-xxxx.onrender.com` URL

---

## Deploying to Railway (Free Tier)

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project → Deploy from GitHub repo** → select `nexora`
3. Railway auto-detects Node.js and runs `npm start`
4. Under **Variables**, add the same three credentials
5. Under **Settings → Domains**, generate a public URL

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `WX_API_KEY` | IBM Cloud API key used to fetch IAM bearer tokens |
| `WX_DEPLOYMENT_URL` | Full HTTPS URL of your watsonx.ai deployed agent endpoint |
| `WX_PROJECT_ID` | Your watsonx.ai project ID (UUID) |
| `PORT` | _(optional)_ Server port — defaults to `3000` |

---

## How It Works

```
Browser                     server.js                  IBM Cloud
  │                              │                          │
  │  POST /api/chat              │                          │
  │  { messages: [...] }  ──────►│                          │
  │                              │  POST /identity/token    │
  │                              │  (if token expired) ────►│ IAM
  │                              │◄── bearer token ─────────│
  │                              │                          │
  │                              │  POST WX_DEPLOYMENT_URL  │
  │                              │  Authorization: Bearer   │
  │                              │  { messages: [...] } ───►│ watsonx.ai
  │                              │◄── { reply: "..." } ─────│
  │◄── { reply: "..." } ─────────│                          │
```

Every user message has the **mode directive prepended** before it is sent, so the AI always re-reads which mode is active regardless of how long the conversation has been running.

---

## License

MIT
