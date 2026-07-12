'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Credential validation ────────────────────────────────────────────────────
const { WX_API_KEY, WX_DEPLOYMENT_URL, WX_PROJECT_ID, PORT = 3000 } = process.env;

if (!WX_API_KEY || !WX_DEPLOYMENT_URL || !WX_PROJECT_ID) {
  console.error(
    '\n[Nexora] FATAL: Missing environment variables.\n' +
    'Copy .env.example to .env and fill in your credentials:\n' +
    '  WX_API_KEY, WX_DEPLOYMENT_URL, WX_PROJECT_ID\n'
  );
  process.exit(1);
}

// ─── IBM IAM token cache ──────────────────────────────────────────────────────
// We cache the bearer token in memory and refresh it ~2 minutes before expiry.
const tokenCache = {
  value: null,       // raw token string
  expiresAt: 0,      // epoch ms when the token expires
};

const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000; // refresh 2 min early

async function getIAMToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.value;
  }

  console.log('[Nexora] Fetching fresh IAM token…');

  const body = new URLSearchParams({
    grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
    apikey: WX_API_KEY,
  });

  const response = await fetch(IAM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`IAM token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();

  // IBM IAM returns `expires_in` (seconds from now) and `expiration` (epoch seconds).
  // We use `expiration` if present, otherwise derive from `expires_in`.
  const expiresEpochSec = data.expiration ?? Math.floor(now / 1000) + (data.expires_in ?? 3600);

  tokenCache.value = data.access_token;
  tokenCache.expiresAt = expiresEpochSec * 1000;

  console.log(`[Nexora] IAM token cached. Expires at ${new Date(tokenCache.expiresAt).toISOString()}`);
  return tokenCache.value;
}

// ─── /api/chat ────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty "messages" array.' });
  }

  // Validate each message has role + content
  for (const msg of messages) {
    if (typeof msg.role !== 'string' || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Each message must have string "role" and "content" fields.' });
    }
  }

  let token;
  try {
    token = await getIAMToken();
  } catch (err) {
    console.error('[Nexora] IAM token error:', err.message);
    return res.status(502).json({ error: `Authentication error: ${err.message}` });
  }

  // Build watsonx.ai chat payload.
  // The deployment endpoint expects the standard messages array plus project_id.
  const wxPayload = {
    messages,
    project_id: WX_PROJECT_ID,
  };

  let wxResponse;
  try {
    wxResponse = await fetch(WX_DEPLOYMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(wxPayload),
    });
  } catch (err) {
    console.error('[Nexora] Network error calling watsonx.ai:', err.message);
    return res.status(502).json({ error: `Could not reach watsonx.ai: ${err.message}` });
  }

  if (!wxResponse.ok) {
    const errText = await wxResponse.text().catch(() => '');
    console.error(`[Nexora] watsonx.ai error ${wxResponse.status}:`, errText);
    return res.status(502).json({
      error: `watsonx.ai responded with status ${wxResponse.status}.`,
      detail: errText,
    });
  }

  let wxData;
  try {
    wxData = await wxResponse.json();
  } catch (err) {
    return res.status(502).json({ error: 'Failed to parse watsonx.ai response as JSON.' });
  }

  // Extract reply text from the response.
  // watsonx.ai chat endpoints return choices[0].message.content (OpenAI-compatible).
  const reply =
    wxData?.choices?.[0]?.message?.content ??
    wxData?.results?.[0]?.generated_text ??
    null;

  if (reply === null) {
    console.error('[Nexora] Unexpected watsonx.ai response shape:', JSON.stringify(wxData));
    return res.status(502).json({
      error: 'Unexpected response format from watsonx.ai.',
      detail: JSON.stringify(wxData),
    });
  }

  return res.json({ reply });
});

// ─── Catch-all: serve index.html for any non-API route ───────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ Nexora is running → http://localhost:${PORT}\n`);
});
