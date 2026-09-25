import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
app.disable('x-powered-by');

// --- Network binding: loopback only, so the proxy (and the shared Groq key)
// is never exposed to the LAN. Override with HOST only if you know why.
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';

const serverDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(serverDir, '..');

function looksPlaceholder(value) {
  return !value || /your|here|placeholder|example|changeme/i.test(value);
}

// DPAPI user-scope blob written by scripts/set-key.ps1. Only this Windows
// account can decrypt it — the file is useless on any other machine/account.
// The blob travels via a child-process env var (never the command line,
// never the stdin quirks) and the key lives only in memory.
function loadEncryptedKey() {
  const encPath = resolve(projectRoot, '.groqkey.enc');
  if (!existsSync(encPath)) return '';
  try {
    const blob = readFileSync(encPath, 'utf8').trim();
    if (!blob) return '';
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        '$s = $env:DPAPI_BLOB | ConvertTo-SecureString; (New-Object System.Net.NetworkCredential("", $s)).Password'],
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, DPAPI_BLOB: blob } }
    ).trim();
    return out;
  } catch {
    return '';
  }
}

// Warn if a REAL key still sits in plaintext .env (migrate with set-key.ps1).
function plaintextKeyInEnvFile() {
  try {
    const envPath = resolve(projectRoot, '.env');
    if (!existsSync(envPath)) return false;
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*GROQ_API_KEY\s*=\s*(.+?)\s*$/);
      if (m && !looksPlaceholder(m[1].replace(/^["']|["']$/g, ''))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Key priority: encrypted store > process env (covers external env vars and
// legacy plaintext .env via dotenv). Placeholders never count.
const encryptedKey = loadEncryptedKey();
const envKeyRaw = String(process.env.GROQ_API_KEY || '').trim();
const groqApiKey = encryptedKey
  ? encryptedKey
  : (looksPlaceholder(envKeyRaw) ? '' : envKeyRaw);
const keySource = encryptedKey ? 'encrypted-store' : (groqApiKey ? 'environment' : 'none');
if (!encryptedKey && plaintextKeyInEnvFile()) {
  console.warn('[security] Plaintext GROQ_API_KEY found in .env. Run: powershell -ExecutionPolicy Bypass -File scripts/set-key.ps1');
}
const defaultModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// --- Allow-lists: never forward an arbitrary client-supplied model string
// to Groq on the server's key. NOTE: groq/compound* were retired by Groq
// (404) — only models verified against /v1/models are listed here.
const VALID_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
]);
const VALID_LANGUAGES = new Set(['tr', 'en']);
if (!VALID_MODELS.has(defaultModel)) {
  console.warn(`[security] GROQ_MODEL "${defaultModel}" is not allow-listed; falling back to openai/gpt-oss-120b.`);
}
const effectiveDefault = VALID_MODELS.has(defaultModel) ? defaultModel : 'openai/gpt-oss-120b';

const sharedUsage = new Map();
const modelLimits = {
  'openai/gpt-oss-120b': { requestsPerMinute: 30, requestsPerDay: 5, tokensPerMinute: 8000, tokensPerDay: 200000 },
  'openai/gpt-oss-20b': { requestsPerMinute: 30, requestsPerDay: 10, tokensPerMinute: 8000, tokensPerDay: 200000 },
  'qwen/qwen3.8-27b': { requestsPerMinute: 30, requestsPerDay: 10, tokensPerMinute: 8000, tokensPerDay: 200000 }
};

// --- Minimal security headers (no extra dependency).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
});

// PUBLIC_MODE=true (hosting/VPS): reverse proxy arkasında doğru istemci
// IP'si için trust proxy + sıkı CORS (sadece eklenti kökenleri).
// Lokal geliştirmede kapalı bırakın.
const publicMode = String(process.env.PUBLIC_MODE || '').toLowerCase() === 'true';
if (publicMode) app.set('trust proxy', 1);

const LOOPBACK_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
  origin(origin, callback) {
    if (publicMode) {
      // Herkese açık sunucu: yalnızca yüklü uzantılardan gelen istekler.
      // Origin'siz istekler (curl/bot) reddedilir.
      if (origin && origin.startsWith('chrome-extension://')) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS: Unauthorized origin'));
      return;
    }
    // Lokal mod: Origin yoksa (curl/dev) izin ver; loopback zaten güvenli.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (origin.startsWith('chrome-extension://') || LOOPBACK_ORIGIN_RE.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS: Unauthorized origin'));
  }
}));
// Tight body limit: a compacted selection is a few KB; 256kb is generous.
app.use(express.json({ limit: '256kb' }));

// --- Per-IP rate limit: 60 requests / minute (abuse guard on top of the
// per-model shared quota below). In-memory; resets on restart.
const ipHits = new Map();
const IP_WINDOW_MS = 60 * 1000;
const IP_MAX_HITS = 60;
app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX_HITS) {
    res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    return;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  next();
});

app.get('/health', (_req, res) => {
  // Never expose the key itself — only whether one is configured.
  res.json({ ok: true, configured: Boolean(groqApiKey), model: effectiveDefault });
});

// Failure diagnostics: only failed Groq responses are logged (head/tail
// snippets, never the API key) so recurring 502s can be root-caused.
function logFailure(entry) {
  try {
    const dir = resolve(projectRoot, 'logs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      resolve(dir, 'groq-failures.log'),
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
    );
  } catch { /* diagnostics must never break the request */ }
}

// Redact anything that looks like a Groq key before it can reach a client.
function redactSecrets(text) {
  return String(text || '').replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]');
}

const MAX_SELECTION_CHARS = 60000;
const RESPONSE_FIELD_CAPS = {
  summary: 800,
  reactCode: 30000,
  pureCss: 15000,
  tailwindClasses: 2000
};

// Tolerant JSON extraction: fences, trailing prose, trailing commas.
function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const withoutFences = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const candidate = withoutFences.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch { /* try light repair below */ }
  try {
    return JSON.parse(candidate.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

function fieldLengths(value) {
  const out = {};
  for (const field of Object.keys(RESPONSE_FIELD_CAPS)) {
    const raw = value?.[field];
    out[field] = typeof raw === 'string' ? raw.trim().length : typeof raw;
  }
  return out;
}

function sanitizeAnalysis(value, activeLanguage = 'tr') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  // reactCode olmadan çıktı işe yaramaz; diğer alanlar boşsa varsayılan doldur.
  const code = value.reactCode;
  if (typeof code !== 'string' || code.trim().length === 0) return null;
  const fallbackSummary = activeLanguage === 'tr' ? 'Bileşen klonlandı.' : 'Component cloned.';
  const out = {};
  for (const [field, cap] of Object.entries(RESPONSE_FIELD_CAPS)) {
    const raw = value[field];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      out[field] = raw.slice(0, cap);
    } else if (field === 'summary') {
      out[field] = fallbackSummary;
    } else {
      out[field] = '';
    }
  }
  return out;
}

app.post('/api/analyze', async (req, res) => {
  if (!groqApiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY .env dosyasinda tanimli degil.' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { selection, language = 'tr' } = body;
  // Strict allow-listing: unknown models/languages fall back to safe defaults.
  const activeModel = VALID_MODELS.has(body.model) ? body.model : effectiveDefault;
  const activeLanguage = VALID_LANGUAGES.has(language) ? language : 'tr';

  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    res.status(400).json({ error: 'Selection data is required.' });
    return;
  }
  const selectionChars = JSON.stringify(selection).length;
  if (selectionChars > MAX_SELECTION_CHARS) {
    res.status(413).json({ error: 'Selection is too large. Select a smaller element.' });
    return;
  }

  const limit = modelLimits[activeModel] || modelLimits[effectiveDefault];
  const now = Date.now();
  const records = (sharedUsage.get(activeModel) || []).filter((entry) => now - entry.timestamp < 24 * 60 * 60 * 1000);
  const minuteRecords = records.filter((entry) => now - entry.timestamp < 60 * 1000);
  const dayTokens = records.reduce((sum, entry) => sum + entry.tokens, 0);
  const minuteTokens = minuteRecords.reduce((sum, entry) => sum + entry.tokens, 0);
  const estimatedTokens = Math.max(1, Math.ceil(selectionChars / 4) + 1400);
  if (
    minuteRecords.length >= limit.requestsPerMinute ||
    (limit.requestsPerDay !== null && records.length >= limit.requestsPerDay) ||
    (limit.tokensPerMinute !== null && minuteTokens + estimatedTokens > limit.tokensPerMinute) ||
    (limit.tokensPerDay !== null && dayTokens + estimatedTokens > limit.tokensPerDay)
  ) {
    res.status(429).json({ error: 'BYECO ortak kullanım kotası doldu. Lütfen daha sonra tekrar deneyin.' });
    return;
  }

  const languageInstruction = activeLanguage === 'tr'
    ? 'Özeti Türkçe yaz. Kod ve CSS isimleri İngilizce olabilir.'
    : 'Write the summary in English.';
  const basePrompt = `Create a concise responsive React + Tailwind component from the selected UI.
${languageInstruction}
Return only a valid JSON object with exactly four string fields: summary, reactCode, pureCss, tailwindClasses.
No Markdown fences, explanations, or extra fields. Use real SVG icons and responsive flex/grid classes.
Keep the whole JSON compact so it fits: short class strings, no comments, no blank lines inside string values.
Selected UI: ${JSON.stringify(selection).slice(0, 24000)}`;

  // Big components used to get cut off at 1700 tokens -> "valid JSON" 502s.
  // 4000 output tokens + light repair + up to 3 attempts fixes that class.
  // Empty reactCode is also treated as a failed attempt so we retry instead
  // of returning a useless result (or a 502) on the first try.
  const OUT_TOKENS = 4000;
  const COMPACT_PROMPT = `Return ONLY a compact valid JSON object with exactly four string fields: summary, reactCode, pureCss, tailwindClasses. No markdown, no extra fields, no truncation. reactCode must be a complete React functional component (never empty); shorten it if needed but keep it valid. Selected UI: ${JSON.stringify(selection).slice(0, 12000)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    let parsed = null;
    const attempts = [];
    for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
      const prompt = attempt === 0
        ? basePrompt
        : attempt === 1
          ? `${basePrompt}\n\nPrevious attempt returned invalid JSON. Return ONLY a compact JSON object with the four fields, no markdown, no truncation. Every field must be a non-empty string (use "" only if truly nothing applies, never null). Shorten the code if needed but keep it valid.`
          : COMPACT_PROMPT;
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: activeModel,
          temperature: 0.2,
          max_tokens: OUT_TOKENS,
          messages: [
            { role: 'system', content: 'You produce clean React functional components with Tailwind CSS in JSON format.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        const upstream = redactSecrets(payload.error?.message || payload.error || 'Groq request failed.');
        res.status(response.status).json({ error: upstream });
        return;
      }
      const choice = payload.choices?.[0] || {};
      const content = String(choice.message?.content || '').trim();
      attempts.push({
        finishReason: choice.finish_reason || null,
        contentLength: content.length,
        head: redactSecrets(content.slice(0, 300)),
        tail: redactSecrets(content.slice(-300))
      });
      parsed = extractJsonObject(content);
      // Boş reactCode ile devam etme: işe yaramaz sonuç yerine retry'e bırak.
      if (parsed && (typeof parsed.reactCode !== 'string' || parsed.reactCode.trim().length === 0)) {
        parsed = null;
      }
    }
    if (!parsed) {
      logFailure({ model: activeModel, stage: 'parse', attempts });
      res.status(502).json({ error: 'Groq geçerli kod üretemedi. Daha küçük bir öğe seçip veya başka bir modelle tekrar deneyin.' });
      return;
    }
    const analysis = sanitizeAnalysis(parsed, activeLanguage);
    if (!analysis) {
      logFailure({
        model: activeModel,
        stage: 'sanitize',
        fieldLengths: fieldLengths(parsed),
        attempts: attempts.map((a) => ({ finishReason: a.finishReason, contentLength: a.contentLength }))
      });
      res.status(502).json({ error: 'Groq geçerli kod üretemedi. Daha küçük bir öğe seçip veya başka bir modelle tekrar deneyin.' });
      return;
    }

    sharedUsage.set(activeModel, [...records, { timestamp: now, tokens: estimatedTokens }]);
    res.json({ analysis });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'AI request timed out. Please try again.'
      : redactSecrets(error.message || 'AI request failed.');
    // Never log or return the API key; redact just in case.
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(port, host, () => {
  console.log(`BYECO AI proxy listening on http://${host}:${port} (key: ${keySource})`);
  if (!groqApiKey) {
    console.warn('[security] GROQ_API_KEY is not set. Run scripts/set-key.ps1 once, then restart.');
  }
});
