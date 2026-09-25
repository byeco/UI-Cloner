# UI Cloner

UI Cloner is a modern Manifest V3 Chrome extension for developers and designers. Select any element on a live webpage, inspect its visual structure, and turn it into clean React JSX, Tailwind CSS, and production-ready component code with AI assistance.

## Official Description

**UI Cloner helps you move from interface inspiration to usable code.** Inspect any web component directly in your browser, understand its layout and visual styles, generate a responsive React/Tailwind implementation, and copy the result into your project in seconds. It is designed for fast prototyping, design exploration, and front-end development while keeping your data and API settings under your control.

## ✨ Features

- **Live Element Inspection:** Hover over any DOM element with real-time dimensions and tag badge (`<button> 120 × 40px`). Press `ESC` at any time to cancel inspection.
- **Computed Style to Tailwind CSS:** Automatically converts background colors, text colors, font sizes, weights, flexbox/grid alignments, padding, radius, and borders into clean Tailwind utility classes.
- **React JSX Generation:** Instant JSX boilerplate ready to copy into your project.
- **AI-Powered UI Review (Groq):**
  - Architecture and visual summary
  - Structured visual notes
  - Accessibility (WCAG / ARIA) recommendations
  - Production-ready React code
  - Actionable next steps
- **Privacy & Security First:**
  - **UI Cloner AI (Default):** Works out of the box on the shared quota — no key, no server, zero setup for users.
  - **Direct Mode:** Alternatively, enter your own free Groq API key in Settings. It stays in your browser's private `chrome.storage.local` sandbox.

---

## 🚀 Quick Start

### 1. Build the Extension

```bash
npm install
npm run build
```

To create an upload-ready ZIP, run:

```bash
npm run package
```

Upload `byeco-ui-cloner.zip` from the project root. The ZIP contains the contents of `dist/` at its root, including `manifest.json`; do not upload the project folder or a ZIP that contains a top-level `UICLONER/` directory.

The packaging command rebuilds `dist/`, removes any previous ZIP, and verifies that `manifest.json` is at the archive root before completing.

### 2. Deploy the AI server once (your key lives here, never in the extension)

Users install only the extension — no terminal, no server, zero setup.
By default the build embeds the shared key (`VITE_SHARED_GROQ_KEY` from
your local `.env`, never committed) and the extension calls Groq directly.
Your Groq key stays on the server as an environment variable only if you
choose the hosted-proxy route below.

1. Push this repo to GitHub, then Render Dashboard > New > Blueprint
   (uses `render.yaml` + `Dockerfile`; free plan is enough to start).
   Alternatives: Railway / Fly.io / any VPS with Docker.
2. Set these environment variables on the host:
   - `GROQ_API_KEY` = your shared key (secret env var — never in code)
   - `GROQ_MODEL=openai/gpt-oss-120b`, `PUBLIC_MODE=true`
   (`HOST=0.0.0.0` and `PORT` are already set in the Dockerfile.)
3. Copy the public URL (e.g. `https://byeco-ai.onrender.com`), set it as
   `DEFAULT_PROXY_URL` in `src/sidepanel/main.jsx`, then rebuild + repackage.
   From that moment every user runs on your quota with no key of their own.
   Anyone who prefers their own key can switch to Direct mode in Settings.

Local development only (key stays on your machine, users never do this):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-key.ps1
npm run server
```

### 3. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the `dist/` directory.
4. Pin UI Cloner and open the Side Panel!

---

## 🤖 Groq AI Setup

Two ways to power the AI features:

### Option A: UI Cloner AI (Default — no key needed in the extension)
1. Put the shared key in your local `.env` as `VITE_SHARED_GROQ_KEY` (never committed).
2. Run `npm run package` — the key is embedded into the built ZIP at build time.
3. In the side panel Settings, choose **UI Cloner AI**. Done!

### Removing the token from the build entirely (recommended once hosted)
Client-side secrets can always be extracted by a determined reader — no
obfuscation changes that. The real fix is a hosted proxy holding the key:
1. Deploy with `render.yaml` (Render Blueprint), set `GROQ_API_KEY` on the host.
2. Set `DEFAULT_PROXY_URL` in `src/sidepanel/main.jsx` to the public URL.
3. Empty `VITE_SHARED_GROQ_KEY` in your local `.env`, then `npm run package`.
4. Run `npm run verify-dist` — it fails the build if any key-like string
   remains in `dist/`. With an empty shared key the app automatically runs
   proxy-first and never carries a token.

### Option B: Direct Mode (your own key, no server)
1. Open Settings (⚙) in the side panel.
2. Choose **Direct Groq API**.
3. Paste your free API key from [Groq Console](https://console.groq.com/keys).
4. Click **Save Settings**. Done!

---

## 🔒 Security & Open-Source Guidelines

- `.env` and `.env.*` files are strictly ignored by `.gitignore`. **Never commit your API keys.**
- The repository is configured with a GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that validates build integrity on every pull request.
- No third-party tracking or telemetry is collected.

---

## 🛠️ Project Structure

```text
UICLONER/
├── config/
│   └── extension-manifest.json # Source manifest emitted into dist/
├── public/
│   └── ICON/
├── src/
│   ├── background.js      # Service worker configuring side panel behavior
│   ├── content/
│   │   └── inspector.js   # In-page element inspector with badge & ESC support
│   ├── popup/
│   │   └── main.jsx       # Quick popup trigger
│   ├── sidepanel/
│   │   └── main.jsx       # Main sidebar interface with settings & AI review
│   ├── styleMapper.js     # Intelligent computed style -> Tailwind CSS mapper
│   └── styles.css         # Extension theme styling
├── vite.config.js         # Vite build configuration
└── package.json
```

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
