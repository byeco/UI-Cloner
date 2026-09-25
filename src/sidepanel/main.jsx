import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { computedStyleToTailwind, elementToJsx, styleRows, generatePureCss } from '../styleMapper';
import { translations } from '../i18n';
import '../styles.css';

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
// Varsayılan Proxy: kullanıcının anahtarı gerekmez, BYECO paylaşılan
// kotasından çalışır. Kendi anahtarını kullanmak isteyen Ayarlar'dan
// Direct moda geçebilir.
const DEFAULT_API_MODE = 'proxy';
// Hangi yapımla çalışıldığını teşhis için başlıkta gösterilir.
const EXT_VERSION = (() => {
  try {
    return (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '1.1.0';
  } catch { return '1.1.0'; }
})();
// Uzantıya build anında gömülen paylaşılan Groq anahtarı (.env'deki
// VITE_SHARED_GROQ_KEY'den gelir). Kaynak repo temiz kalır; anahtar
// yalnızca derlenen dist/zip içinde olur. Sunucu gerektirmez: UI Cloner AI
// modu önce (ileride deploy edilirse) proxy'yi dener, ulaşamazsa bu
// anahtarla Groq'a direkt bağlanır. Kendi anahtarını kullanmak isteyen
// Direct moda geçer.
const SHARED_GROQ_KEY = import.meta.env.VITE_SHARED_GROQ_KEY || '';
// Anahtar build'e gömülmediyse paylaşılan yol tamamen yokmuş gibi davranır:
// bu yapıyı inceleyen kimse token bulamaz (kota istenirse proxy/kişisel
// anahtar kullanılır). Bkz: `npm run verify-dist`.
// (İsteğe bağlı) ileride deploy edilecek UI Cloner AI sunucusunun adresi.
// Deploy edilene kadar localhost'ta kalır; uzantı ona ulaşamazsa
// otomatik olarak gömülü paylaşılan anahtara düşer, kullanıcı
// hiçbir şey yapmaz.
const DEFAULT_PROXY_URL = 'http://localhost:8787';
// Chrome Web Store sayfası (puan/yorum istekleri buraya gider).
const STORE_REVIEWS_URL = 'https://chromewebstore.google.com/detail/byeco-ui-cloner/cjoleiibiemifjpccfiiokmelmlmhcjb/reviews?hl=tr';
const VALID_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
];

function getModelLimitSummary(modelName, lang = 'tr') {
  const limit = MODEL_ACCESS[modelName] || MODEL_ACCESS['openai/gpt-oss-120b'];

  if (limit.requestsPerDay === null) {
    return lang === 'tr'
      ? '30 istek/dakika • sınırsız günlük hak • 70K token/dakika • günlük token limiti yok'
      : '30 req/min • unlimited daily requests • 70K tokens/min • no daily token cap';
  }

  return lang === 'tr'
    ? `30 istek/dakika • ${limit.requestsPerDay}/gün • 8K token/dakika • 200K token/gün`
    : `30 req/min • ${limit.requestsPerDay}/day • 8K tokens/min • 200K tokens/day`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MODEL_ACCESS = {
  'openai/gpt-oss-120b': {
    tier: 'paid',
    label: 'Günlük hak',
    shortLabel: '5/gün',
    requestsPerMinute: 30,
    requestsPerDay: 5,
    tokensPerMinute: 8000,
    tokensPerDay: 200000
  },
  'openai/gpt-oss-20b': {
    tier: 'paid',
    label: 'Günlük hak',
    shortLabel: '10/gün',
    requestsPerMinute: 30,
    requestsPerDay: 10,
    tokensPerMinute: 8000,
    tokensPerDay: 200000
  },
  'qwen/qwen3.8-27b': {
    tier: 'paid',
    label: 'Günlük hak',
    shortLabel: '10/gün',
    requestsPerMinute: 30,
    requestsPerDay: 10,
    tokensPerMinute: 8000,
    tokensPerDay: 200000
  }
};

function estimateRequestTokens(text = '') {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function compactSelection(selection) {
  if (!selection) return selection;

  const compactNode = (node, depth = 0) => {
    if (!node || depth > 2) return null;
    return {
      tagName: node.tagName,
      text: typeof node.text === 'string' ? node.text.slice(0, 80) : '',
      attributes: node.attributes || {},
      dimensions: node.dimensions,
      style: node.style,
      children: Array.isArray(node.children)
        ? node.children.slice(0, 8).map((child) => compactNode(child, depth + 1)).filter(Boolean)
        : []
    };
  };

  return {
    tagName: selection.tagName,
    text: typeof selection.text === 'string' ? selection.text.slice(0, 120) : '',
    selector: typeof selection.selector === 'string' ? selection.selector.slice(0, 240) : '',
    attributes: selection.attributes || {},
    dimensions: selection.dimensions,
    style: selection.style,
    children: Array.isArray(selection.children)
      ? selection.children.slice(0, 10).map((child) => compactNode(child)).filter(Boolean)
      : [],
    totalChildren: selection.totalChildren || 0
  };
}

function getModelErrorMessage(payload, lang, status = 0) {
  const message = payload?.error?.message || payload?.error || '';
  if (status === 401 || /invalid.*key|incorrect api key|unauthorized/i.test(String(message))) {
    return lang === 'tr'
      ? `Groq anahtarı geçersiz (401). Ayarlar'daki anahtarı kontrol edin: "gsk_" ile başlamalı, boşluksuz olmalı.`
      : `Groq key is invalid (401). Check the key in Settings: it must start with "gsk_" and have no spaces.`;
  }
  if (status === 404 || /model.*not found|does not exist/i.test(String(message))) {
    return lang === 'tr'
      ? `Model bulunamadı (404). Ayarlar'dan başka bir model seçin (örn. OpenAI GPT-OSS 20B).`
      : `Model not found (404). Pick another model in Settings (e.g. OpenAI GPT-OSS 20B).`;
  }
  const retryMatch = String(message).match(/try again in ([\d.]+)s/i);
  if (retryMatch) {
    return lang === 'tr'
      ? `Model şu anda yoğun. Yaklaşık ${Math.ceil(Number(retryMatch[1]))} saniye bekleyip tekrar deneyin.`
      : `The model is busy. Please wait about ${Math.ceil(Number(retryMatch[1]))} seconds and try again.`;
  }
  if (/tokens per minute|request too large|too large/i.test(String(message))) {
    return lang === 'tr'
      ? 'Bu istek modelin dakika başı token limitini aşıyor. Daha küçük bir öğe seçin veya başka bir model deneyin.'
      : 'This request exceeds the model token limit. Select a smaller element or try another model.';
  }
  const detail = String(message).slice(0, 220);
  if (status) {
    return lang === 'tr'
      ? `Yapay zeka isteği başarısız (HTTP ${status})${detail ? `: ${detail}` : '. Tekrar deneyin.'}`
      : `AI request failed (HTTP ${status})${detail ? `: ${detail}` : '. Please try again.'}`;
  }
  return detail || (lang === 'tr' ? 'Yapay zeka isteği başarısız oldu.' : 'AI request failed.');
}

function parseModelJson(content, lang) {
  const raw = String(content || '').trim();
  const withoutFences = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(lang === 'tr' ? 'Model geçerli JSON üretmedi. Daha küçük bir öğe seçip tekrar deneyin.' : 'The model did not return valid JSON. Select a smaller element and try again.');
  }

  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    try {
      return JSON.parse(withoutFences.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1'));
    } catch {
      throw new Error(lang === 'tr' ? 'Model cevabı eksik veya bozuk JSON içeriyor. Tekrar deneyin.' : 'The model returned incomplete or invalid JSON. Please try again.');
    }
  }
}

function getModelUsageRecords(historyByModel, modelName) {
  if (!historyByModel || !modelName) return [];
  const items = historyByModel[modelName];
  if (!Array.isArray(items)) return [];
  return items.filter((entry) => entry && typeof entry === 'object' && typeof entry.timestamp === 'number');
}

function getUsageSnapshot(modelName, historyByModel) {
  const limit = MODEL_ACCESS[modelName] || MODEL_ACCESS['openai/gpt-oss-120b'];
  const records = getModelUsageRecords(historyByModel, modelName);
  const now = Date.now();
  const minuteWindowMs = 60 * 1000;
  const dayWindowMs = DAY_MS;

  const minuteRecords = records.filter((entry) => now - entry.timestamp < minuteWindowMs);
  const dayRecords = records.filter((entry) => now - entry.timestamp < dayWindowMs);

  return {
    minuteCount: minuteRecords.length,
    dayCount: dayRecords.length,
    minuteTokens: minuteRecords.reduce((sum, entry) => sum + Number(entry.tokens || 0), 0),
    dayTokens: dayRecords.reduce((sum, entry) => sum + Number(entry.tokens || 0), 0),
    limit,
    remainingMinuteRequests: Math.max(0, limit.requestsPerMinute - minuteRecords.length),
    remainingDayRequests: limit.requestsPerDay === null ? null : Math.max(0, limit.requestsPerDay - dayRecords.length),
    remainingMinuteTokens: limit.tokensPerMinute === null ? null : Math.max(0, limit.tokensPerMinute - minuteRecords.reduce((sum, entry) => sum + Number(entry.tokens || 0), 0)),
    remainingDayTokens: limit.tokensPerDay === null ? null : Math.max(0, limit.tokensPerDay - dayRecords.reduce((sum, entry) => sum + Number(entry.tokens || 0), 0))
  };
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// --- Yeni özellik yardımcıları: palet, önizleme, dışa aktar, iyileştirme ---
function rgbToHex(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const s = colorStr.trim().toLowerCase();
  if (s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return null;
  if (/^#[0-9a-f]{3,8}$/.test(s)) {
    if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
    return s.slice(0, 7).toUpperCase();
  }
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  const toHex = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`.toUpperCase();
}

function extractPalette(selection) {
  const colors = new Map(); // hex -> { hex, count, roles:Set }
  const fonts = new Map();
  const push = (hex, role) => {
    if (!hex) return;
    if (!colors.has(hex)) colors.set(hex, { hex, count: 0, roles: new Set() });
    const e = colors.get(hex);
    e.count += 1;
    if (role) e.roles.add(role);
  };
  const walk = (node, isRoot) => {
    if (!node) return;
    const st = node.style || (isRoot ? selection?.style : null) || {};
    push(rgbToHex(st.backgroundColor), 'bg');
    push(rgbToHex(st.color), 'text');
    const b = String(st.border || '');
    const bm = b.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/);
    if (bm) push(rgbToHex(bm[0]), 'border');
    if (st.fontFamily || st.fontSize) {
      const key = `${(st.fontFamily || 'sistem').split(',')[0].replace(/["']/g, '').trim()} • ${st.fontSize || ''} • ${st.fontWeight || ''}`;
      fonts.set(key, (fonts.get(key) || 0) + 1);
    }
    (node.children || []).forEach((c) => walk(c, false));
  };
  if (selection) {
    walk({ style: selection.style, children: selection.children }, true);
    // kökün kendi stilleri walk içinde bir kez sayılsın
  }
  return {
    colors: [...colors.values()].sort((a, b) => b.count - a.count).slice(0, 12)
      .map((c) => ({ hex: c.hex, count: c.count, roles: [...c.roles] })),
    fonts: [...fonts.entries()].map(([label, count]) => ({ label, count })).slice(0, 6)
  };
}

function downloadFile(filename, content, mime = 'text/plain') {
  try {
    const blob = new Blob([content ?? ''], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

function buildPreviewDoc(htmlSnippet, cssCode, pageUrl) {
  const safeHtml = String(htmlSnippet || '<div style="padding:24px;font-family:sans-serif">Seçim boş</div>');
  const safeCss = String(cssCode || '');
  const base = pageUrl ? `<base href="${String(pageUrl).replace(/"/g, '&quot;')}">` : '';
  // Köprü kural: seçili öğenin sınıfı yoksa üretilen CSS'teki kök seçici
  // (örn. `.button-component`) snippet'te hiçbir şeyle eşleşmez ve önizleme
  // stylesiz kalır. İlk kuralın bildirimlerini sarmalayıcının ilk
  // çocuğuna da uygula — sınıflı durumda her iki kural da çalışır.
  let bridge = '';
  const firstBlock = safeCss.match(/^[^{]+\{[^}]*\}/);
  if (firstBlock) {
    bridge = `.byeco-live-root > :first-child {${firstBlock[0].slice(firstBlock[0].indexOf('{') + 1)}}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${base}<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:20px;background:#f1f5f9;font-family:system-ui,sans-serif}img{max-width:100%}* {box-sizing:border-box} ${safeCss} ${bridge}</style></head><body><div class="byeco-live-root">${safeHtml}</div></body></html>`;
}

function getA11yChecks(selection) {
  const out = [];
  if (!selection) return out;
  const attrs = selection.attributes || {};
  const text = (selection.text || '').trim();
  const tag = (selection.tagName || '').toLowerCase();
  if (tag === 'img' && !attrs.alt) out.push({ level: 'warn', text: 'img etiketinde alt metni yok — ekran okuyucular için alt ekleyin.' });
  else out.push({ level: 'ok', text: 'Metin/img temelleri mevcut görünüyor.' });
  if (!attrs['aria-label'] && !attrs.role && ['div', 'span'].includes(tag) && (selection.totalChildren || 0) > 3)
    out.push({ level: 'warn', text: 'Etkileşimli görünüyorsa role / aria-label ekleyin (div yığını).' });
  if (!text && (selection.children || []).length === 0)
    out.push({ level: 'warn', text: 'Metin içeriği yok — buton ise aria-label şart.' });
  const fs = parseFloat(selection.style?.fontSize || '');
  if (fs && fs < 12) out.push({ level: 'warn', text: `Yazı boyutu küçük (${selection.style.fontSize}) — en az 12px önerilir.` });
  else out.push({ level: 'ok', text: 'Yazı boyutu okunabilir aralıkta.' });
  out.push({ level: 'ok', text: 'Odak görünürlüğü için :focus-visible stili ekleyin.' });
  return out;
}

function buildDarkVariant(reactCode) {
  if (!reactCode) return '';
  return reactCode
    .replaceAll('bg-white', 'bg-slate-950 dark:bg-slate-950')
    .replaceAll('bg-gray-50', 'bg-slate-900')
    .replaceAll('text-gray-900', 'text-slate-100')
    .replaceAll('text-gray-800', 'text-slate-200')
    .replaceAll('text-black', 'text-white')
    .replaceAll('border-gray-200', 'border-slate-800');
}

function buildResponsiveNote() {
  return `// Responsive: köke "w-full max-w-xl mx-auto px-4 sm:px-6" ekleyin;\n// eylem satırına "flex flex-col sm:flex-row gap-3" verin;\n// görsele "w-full h-auto object-cover" uygulayın.`;
}

async function getStorageItem(key) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get([key]);
    return data[key];
  }
  return localStorage.getItem(key);
}

async function setStorageItem(key, value) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, value);
  }
}

async function captureCroppedScreenshot(rect) {
  try {
    if (typeof chrome === 'undefined' || !chrome.tabs?.captureVisibleTab) return null;
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    if (!dataUrl) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = rect.dpr || 1;
        const cropX = Math.max(0, rect.left * dpr);
        const cropY = Math.max(0, rect.top * dpr);
        const cropW = Math.min(img.width - cropX, rect.width * dpr);
        const cropH = Math.min(img.height - cropY, rect.height * dpr);

        if (cropW <= 2 || cropH <= 2) {
          resolve(null);
          return;
        }

        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const scale = Math.min(1, maxW / cropW);
        canvas.width = Math.round(cropW * scale);
        canvas.height = Math.round(cropH * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch (err) {
    console.warn('Screenshot capture warning:', err);
    return null;
  }
}

function SidePanel() {
  const [lang, setLang] = useState('tr');
  const t = translations[lang] || translations.tr;

  const [selection, setSelection] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiReadyToast, setShowAiReadyToast] = useState(false);
  // AI hazır bildirimi sağ üstte belirip 4 sn sonra kendiliğinden kapanır.
  useEffect(() => {
    if (!showAiReadyToast) return;
    const id = setTimeout(() => setShowAiReadyToast(false), 4000);
    return () => clearTimeout(id);
  }, [showAiReadyToast]);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'raw' | 'settings'
  const [subTab, setSubTab] = useState('split'); // 'split' | 'jsx' | 'css' | 'tailwind'
  const [cache, setCache] = useState({});

  // Yeni özellik state'leri
  const [history, setHistory] = useState([]);
  const [showHistoryPage, setShowHistoryPage] = useState(false);
  const [variant, setVariant] = useState('dark'); // 'dark' | 'responsive' | 'a11y'
  const [variantOutput, setVariantOutput] = useState('');
  // Araç sayfası (0: önizleme, 1: palet, 2: iyileştirme, 3: dışa aktar)
  const [toolIndex, setToolIndex] = useState(0);
  const [toolDir, setToolDir] = useState(1);
  const [showReviewNudge, setShowReviewNudge] = useState(false);
  const goTool = (delta) => {
    setToolDir(delta >= 0 ? 1 : -1);
    setToolIndex((i) => (i + delta + 4) % 4);
  };
  const dismissReviewNudge = async () => {
    setShowReviewNudge(false);
    await setStorageItem('byecoReviewNudgeDismissed', true);
  };
  const openStoreReview = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        await chrome.tabs.create({ url: STORE_REVIEWS_URL });
      } else {
        window.open(STORE_REVIEWS_URL, '_blank', 'noopener');
      }
    } catch {
      window.open(STORE_REVIEWS_URL, '_blank', 'noopener');
    }
    await dismissReviewNudge();
  };

  // AI Quota State: per-model usage history { [model]: [{timestamp, tokens}] }
  const [usageHistory, setUsageHistory] = useState({});
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const ticker = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiMode, setApiMode] = useState(DEFAULT_API_MODE);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [savedSettingsNotice, setSavedSettingsNotice] = useState(false);
  const [proxyOnline, setProxyOnline] = useState(null); // null | true | false
  // Dağıtımda kodda yazılı adresten gelir; geliştirici isterse Ayarlar >
  // Gelişmiş bölümünden geçersiz kılabilir (byecoProxyUrl).
  const [proxyUrl, setProxyUrl] = useState(DEFAULT_PROXY_URL);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (showHistoryPage) { setShowHistoryPage(false); return; }
      if (activeTab === 'settings' && selection) setActiveTab('ai');
      else if (isSettingsOpen) setIsSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isSettingsOpen, selection, showHistoryPage]);

  useEffect(() => {
    const loadSettings = async () => {
      const storedLang = await getStorageItem('appLanguage');
      const storedKey = await getStorageItem('groqApiKey');
      const storedMode = await getStorageItem('groqApiMode');
      const storedModel = await getStorageItem('groqModel');
      const storedProxyUrl = await getStorageItem('byecoProxyUrl');
      const storedHistory = await getStorageItem('aiUsageHistory');
      const storedPanelHistory = await getStorageItem('byecoHistory');

      if (storedLang) setLang(storedLang);
      if (storedKey) setApiKey(storedKey);
      if (typeof storedProxyUrl === 'string' && /^https?:\/\//.test(storedProxyUrl.trim())) {
        setProxyUrl(storedProxyUrl.trim().replace(/\/+$/, ''));
      }
      let initialMode = storedMode === 'direct' || storedMode === 'proxy'
        ? storedMode
        : DEFAULT_API_MODE;
      // Proxy anahtar gerektirmez: kayıtlı mod yoksa proxy'ye geç.
      // Direct'te takılı kalıp anahtarı olmayan eski kurulumları da
      // paylaşılan kotaya al (kullanıcı isterse Direct'e dönebilir).
      if (!storedMode) {
        initialMode = DEFAULT_API_MODE;
      } else if (initialMode === 'direct' && !String(storedKey || '').trim()) {
        initialMode = 'proxy';
        await setStorageItem('groqApiMode', initialMode);
      }
      setApiMode(initialMode);
      if (!storedMode) await setStorageItem('groqApiMode', initialMode);
      if (storedHistory && typeof storedHistory === 'object' && !Array.isArray(storedHistory)) {
        setUsageHistory(storedHistory);
      } else if (Array.isArray(storedHistory)) {
        setUsageHistory({ [DEFAULT_MODEL]: storedHistory });
      }
      if (Array.isArray(storedPanelHistory)) setHistory(storedPanelHistory.slice(0, 20));
      if (storedModel && VALID_MODELS.includes(storedModel)) {
        setModel(storedModel);
      } else {
        setModel(DEFAULT_MODEL);
        await setStorageItem('groqModel', DEFAULT_MODEL);
      }
    };
    loadSettings();

    const listener = (message) => {
      if (message.type === 'ELEMENT_SELECTED') {
        const payload = message.payload;
        setSelection(payload);
        setScreenshot(null);
        setIsInspecting(false);
        setAnalysis(null);
        setError('');
        setShowAiReadyToast(false);
        setActiveTab('ai');
        setVariantOutput('');

        const entry = {
          id: `${Date.now()}`,
          ts: Date.now(),
          tagName: payload.tagName,
          selector: payload.selector,
          text: (payload.text || '').slice(0, 80),
          dimensions: payload.dimensions,
          selection: payload
        };
        setHistory((prev) => [entry, ...(prev || [])].slice(0, 20));

        if (payload.rect) {
          captureCroppedScreenshot(payload.rect).then((imgUrl) => {
            if (imgUrl) setScreenshot(imgUrl);
          });
        }
      }
      if (message.type === 'INSPECTION_CANCELLED') {
        setIsInspecting(false);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Geçmişi kalıcı sakla (updater içinde side-effect yapmadan)
  useEffect(() => {
    setStorageItem('byecoHistory', history).catch(() => {});
  }, [history]);

  // API anahtarını yazdıkça otomatik sakla: Kaydet'e basılmadan
  // panel kapanırsa anahtar kaybolmasın (key=yok teşhisinin kök sebebi).
  useEffect(() => {
    const id = setTimeout(() => {
      setStorageItem('groqApiKey', apiKey.trim()).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [apiKey]);

  // Proxy sağlık kontrolü: çevrimdışıysa buton altında net uyarı göster.
  // Uzantı sunucuyu kendisi başlatamaz; adres dağıtımda hazır gelir,
  // kullanıcı ekstra bir işlem yapmaz.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (apiMode !== 'proxy') { setProxyOnline(null); return; }
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${proxyUrl}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!cancelled) setProxyOnline(res.ok);
      } catch {
        if (!cancelled) setProxyOnline(false);
      }
    };
    check();
    const id = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [apiMode, proxyUrl]);

  const changeLanguage = async (newLang) => {
    setLang(newLang);
    await setStorageItem('appLanguage', newLang);
  };

  // Ayarlar artık sekme/sayfa: seçim varken settings sekmesi, yoksa sayfa görünümü.
  const openSettings = () => {
    if (selection) {
      setIsSettingsOpen(false);
      setActiveTab('settings');
      setTimeout(() => document.getElementById('setting-key')?.focus(), 120);
    } else {
      setIsSettingsOpen(true);
    }
  };
  const closeSettings = () => {
    setIsSettingsOpen(false);
    if (selection) setActiveTab('ai');
  };

  const saveSettings = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const normalizedProxy = String(proxyUrl || '').trim().replace(/\/+$/, '') || DEFAULT_PROXY_URL;
    setProxyUrl(normalizedProxy);
    await setStorageItem('byecoProxyUrl', normalizedProxy);
    await setStorageItem('appLanguage', lang);
    await setStorageItem('groqApiKey', apiKey.trim());
    await setStorageItem('groqApiMode', apiMode);
    await setStorageItem('groqModel', model);
    setSavedSettingsNotice(true);
    setTimeout(() => setSavedSettingsNotice(false), 2000);
  };

  const clearUserData = async () => {
    const confirmed = window.confirm(
      lang === 'tr'
        ? 'API anahtarını, kullanım geçmişini ve bu oturumdaki sonuçları silmek istediğinize emin misiniz?'
        : 'Are you sure you want to delete the API key, usage history, and results from this session?'
    );
    if (!confirmed) return;

    await setStorageItem('groqApiKey', '');
    await setStorageItem('aiUsageHistory', {});
    await setStorageItem('byecoHistory', []);
    setApiKey('');
    setUsageHistory({});
    setHistory([]);
    setCache({});
    setAnalysis(null);
    setScreenshot(null);
    setSavedSettingsNotice(true);
    setTimeout(() => setSavedSettingsNotice(false), 2000);
  };

  const toggleInspection = async () => {
    setError('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) {
        setError(t.errNoTab);
        return;
      }

      if (isInspecting) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'STOP_INSPECTION' });
        } catch {}
        setIsInspecting(false);
        return;
      }

      const url = tab.url || '';
      if (
        !url ||
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('extensions://') ||
        url.startsWith('edge://') ||
        url.startsWith('view-source:') ||
        url.startsWith('about:')
      ) {
        setError(t.errRestrictedPage);
        return;
      }

      let isReady = false;
      try {
        const pingResponse = await Promise.race([
          chrome.tabs.sendMessage(tab.id, { type: 'PING' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150))
        ]);
        if (pingResponse?.pong) isReady = true;
      } catch {
        isReady = false;
      }

      if (!isReady) {
        const manifest = chrome.runtime.getManifest();
        const scriptFile = manifest.content_scripts?.[0]?.js?.[0] || 'assets/content.js';
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [scriptFile]
        });
        await new Promise((resolve) => setTimeout(resolve, 60));
      }

      await chrome.tabs.sendMessage(tab.id, { type: 'START_INSPECTION' });
      setIsInspecting(true);
    } catch (err) {
      console.error('Inspection toggle error:', err);
      setIsInspecting(false);
      setError(t.errInspect);
    }
  };

  const style = selection?.style;
  const tailwind = style ? computedStyleToTailwind(style) : '';
  const jsx = style ? elementToJsx(selection, style) : '';
  const pureCss = selection ? generatePureCss(selection) : '';
  const cssCode = analysis?.pureCss || pureCss;
  const palette = selection ? extractPalette(selection) : { colors: [], fonts: [] };
  const a11yChecks = selection ? getA11yChecks(selection) : [];
  const previewDoc = selection ? buildPreviewDoc(selection.htmlSnippet, cssCode, selection.pageUrl) : '';

  const slugify = (s) => String(s || 'bilesen').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'bilesen';
  const exportBase = selection ? `${slugify(selection.tagName)}-${selection.dimensions?.width || 0}x${selection.dimensions?.height || 0}` : 'bilesen';
  const handleExport = (kind) => {
    if (!selection) return;
    if (kind === 'jsx') downloadFile(`${exportBase}.jsx`, analysis?.reactCode || jsx, 'text/jsx');
    else if (kind === 'css') downloadFile(`${exportBase}.css`, cssCode, 'text/css');
    else if (kind === 'json') downloadFile(`${exportBase}.json`, JSON.stringify({ selector: selection.selector, dimensions: selection.dimensions, tailwind, jsx, css: cssCode, analysis }, null, 2), 'application/json');
    else if (kind === 'all') {
      copyOutput('all', `${analysis?.reactCode || jsx}\n\n/* ===== ${exportBase}.css ===== */\n${cssCode}`);
    }
    setCopied(kind === 'all' ? 'all' : copied);
  };
  const applyVariant = (kind) => {
    setVariant(kind);
    if (kind === 'dark') setVariantOutput(buildDarkVariant(analysis?.reactCode || jsx) || (lang === 'tr' ? 'Önce kod üretin.' : 'Generate code first.'));
    else if (kind === 'responsive') setVariantOutput(buildResponsiveNote());
    else setVariantOutput('');
  };
  const restoreFromHistory = (item) => {
    if (!item?.selection) return;
    setSelection(item.selection);
    setScreenshot(null);
    setAnalysis(item.reactCode ? { summary: item.summary, reactCode: item.reactCode, pureCss: item.pureCss, model } : null);
    setError('');
    setActiveTab('ai');
    setShowHistoryPage(false);
    setVariantOutput('');
    if (item.selection.rect) {
      captureCroppedScreenshot(item.selection.rect).then((imgUrl) => { if (imgUrl) setScreenshot(imgUrl); });
    }
  };
  const removeHistoryItem = async (id) => {
    const next = (history || []).filter((h) => h.id !== id);
    setHistory(next);
    await setStorageItem('byecoHistory', next);
  };
  const clearHistory = async () => {
    setHistory([]);
    await setStorageItem('byecoHistory', []);
  };

  const isSharedProxy = apiMode === 'proxy';
  const quotaSnapshot = getUsageSnapshot(model, usageHistory);
  const activeModelQuota = isSharedProxy
    ? quotaSnapshot.limit
    : { requestsPerDay: null, tokensPerDay: null, tokensPerMinute: null, requestsPerMinute: null };
  const remainingQuota = isSharedProxy ? quotaSnapshot.remainingDayRequests : null;
  const remainingMinuteQuota = isSharedProxy ? quotaSnapshot.remainingMinuteRequests : null;
  const isQuotaReached = isSharedProxy && (remainingQuota === 0 || remainingMinuteQuota === 0 || quotaSnapshot.remainingDayTokens === 0 || quotaSnapshot.remainingMinuteTokens === 0);
  const modelRecords = getModelUsageRecords(usageHistory, model);
  const earliestDay = quotaSnapshot.dayCount > 0 ? Math.min(...modelRecords.map((entry) => entry.timestamp)) : null;
  const earliestMinute = quotaSnapshot.minuteCount > 0
    ? Math.min(...modelRecords.filter((entry) => nowTick - entry.timestamp < 60 * 1000).map((entry) => entry.timestamp))
    : null;
  const timeUntilReset = !isSharedProxy
    ? 0
    : (remainingQuota === 0 && earliestDay !== null)
      ? Math.max(0, (earliestDay + DAY_MS) - nowTick)
      : (remainingMinuteQuota === 0 && earliestMinute !== null)
        ? Math.max(0, (earliestMinute + 60 * 1000) - nowTick)
        : 0;

  const copyOutput = async (label, value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for contexts where the async clipboard API is unavailable
      // (avoids needing the clipboardWrite permission in the manifest).
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1600);
  };

  // Doğrudan Groq çağrısı (direct mod + proxy erişilemezken otomatik yedek).
  // Sunucuyla aynı dayanıklılık: bozuk JSON'da onarım telkiniyle 2. deneme,
  // vision yükü başarısızsa amiral gemisi modele düşüş.
  const callGroqDirect = async (key, targetModel, contentFor) => {
    let activeTargetModel = targetModel;
    const wantsVision = activeTargetModel === 'qwen/qwen3.8-27b' && Boolean(screenshot);

    const postChat = async (m, getContent) => {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: m,
          temperature: 0.2,
          max_tokens: 4000,
          messages: [
            { role: 'system', content: 'You produce clean React functional components with Tailwind CSS in JSON format.' },
            { role: 'user', content: getContent(m) }
          ]
        })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        throw Object.assign(new Error(getModelErrorMessage(null, lang, response.status)), { status: response.status });
      }
      if (!response.ok) {
        throw Object.assign(new Error(getModelErrorMessage(payload, lang, response.status)), { status: response.status });
      }
      return payload.choices?.[0]?.message?.content;
    };

    const repairNudge = (m) => {
      const base = contentFor(m);
      const baseText = typeof base === 'string' ? base : base?.[0]?.text || '';
      return `${baseText}\n\nPrevious attempt returned invalid JSON. Return ONLY a compact valid JSON object with exactly the four fields (summary, reactCode, pureCss, tailwindClasses). No markdown, no truncation; shorten the code if needed but keep it valid.`;
    };

    try {
      const content = await postChat(activeTargetModel, contentFor);
      try {
        return { ...parseModelJson(content, lang), model: activeTargetModel };
      } catch {
        const retryContent = await postChat(activeTargetModel, repairNudge);
        return { ...parseModelJson(retryContent, lang), model: activeTargetModel };
      }
    } catch (err) {
      // Vision yükü başarısızsa (anahtar hatası değilse) amiral gemisine düş
      if (wantsVision && activeTargetModel !== 'openai/gpt-oss-120b' && err.status !== 401) {
        console.warn('Vision call failed, falling back to openai/gpt-oss-120b flagship model...');
        activeTargetModel = 'openai/gpt-oss-120b';
        const content = await postChat(activeTargetModel, contentFor);
        return { ...parseModelJson(content, lang), model: activeTargetModel };
      }
      throw err;
    }
  };

  const analyzeSelection = async () => {
    if (!selection) return;
    setError('');
    setActiveTab('ai');

    const cacheKey = `${selection.selector}-${selection.dimensions?.width}x${selection.dimensions?.height}-${lang}-${model}`;
    if (cache[cacheKey]) {
      setAnalysis(cache[cacheKey]);
      setShowAiReadyToast(true);
      setError(lang === 'tr'
        ? 'Bu bileşen daha önce bu modelle üretildi. Kayıtlı sonuç gösterildi; hak kullanılmadı.'
        : 'This component was already generated with this model. The cached result was shown; no credit was used.');
      return;
    }

    if (isSharedProxy) {
      const selectedModelQuota = MODEL_ACCESS[model] || MODEL_ACCESS['openai/gpt-oss-120b'];
      const usageSnapshot = getUsageSnapshot(model, usageHistory);
      const estimatedTokens = estimateRequestTokens(JSON.stringify(selection)) + 800;
      const minuteTokenLimitReached = selectedModelQuota.tokensPerMinute !== null && usageSnapshot.minuteTokens + estimatedTokens > selectedModelQuota.tokensPerMinute;
      const dayTokenLimitReached = selectedModelQuota.tokensPerDay !== null && usageSnapshot.dayTokens + estimatedTokens > selectedModelQuota.tokensPerDay;
      const minuteRequestLimitReached = usageSnapshot.minuteCount >= selectedModelQuota.requestsPerMinute;
      const dayRequestLimitReached = selectedModelQuota.requestsPerDay !== null
        && usageSnapshot.dayCount >= selectedModelQuota.requestsPerDay;

      if (minuteRequestLimitReached || dayRequestLimitReached || minuteTokenLimitReached || dayTokenLimitReached) {
        const quotaMessage = lang === 'tr'
          ? `${selectedModelQuota.label} doldu. Bu model için gün/ dakika limiti aşıldı.`
          : `The request or token quota for this model has been reached for the current window.`;
        setError(quotaMessage);
        return;
      }
    }

    setIsAnalyzing(true);
    setShowAiReadyToast(false);

    try {
      let resultAnalysis;
      const promptSelection = compactSelection(selection);
      const promptSelectionJson = JSON.stringify(promptSelection);

      const langInstruction = lang === 'tr'
        ? '"summary" alanını tek cümlelik kısa ve profesyonel Türkçe olarak yaz.'
        : 'Provide "summary" as a single concise English sentence.';

      const promptText = `Sen uzman bir React + Tailwind CSS kıdemli frontend mühendisisin.
${langInstruction}

GÖREV:
Verilen arayüz tasarımını React ve Tailwind CSS kullanarak eksiksiz, üretime hazır (production-ready) bir fonksiyonel bileşen olarak klonla. Önceki üretimlerde yapılan hataları tekrarlamamak için aşağıdaki KESİN KURALLARA harfiyen uy:

1. PLACEHOLDER (YER TUTUCU) KULLANIMINI KESİNLİKLE YASAKLA:
- İkonlar için asla <span className="bg-gray-300 rounded-full" /> veya gri kutular gibi geçici geometrik şekiller üretme!
- Tasarımda görülen HER BİR İKON (Beğen, Yorum, Paylaş, Profil, Kaydet, Ses/Müzik/Pivot, Menü vb.) için uygun, ölçeklenebilir, estetik ve gerçek SVG kodlarını (<svg viewBox="0 0 24 24" fill="currentColor" className="...">...<path .../></svg>) eksiksiz olarak koda dahil et.

2. SABİT PİKSEL DEĞERLERİNDEN (HARDCODING) KAÇIN:
- Kapsayıcı (container) elemanlarda h-[610px], w-[400px] gibi sabit ve ekranı bozan piksel değerleri KESİNLİKLE KULLANMA.
- Bunun yerine eylem çubuğunu ve bileşenleri ekranın veya kapsayıcı videonun/kartın uygun yerine hizalamak için modern flexbox/grid mantığını (h-full, w-full, justify-end, items-center, absolute bottom-0 right-0, p-4 vb.) kullan. Tasarım tam anlamıyla responsive (duyarlı) ve akıcı olmalıdır.

3. EKSEN VE DÜZEN (LAYOUT) MANTIĞINI DÜZELT:
- Reels, Shorts ve benzeri modern UI yapılarında sağdaki eylem butonları (beğeni, yorum, paylaş) ve en alttaki "ses/pivot/müzik" butonu genellikle tek bir dikey sütunda (flex flex-col items-center gap-4) hizalanır. Pivot/ses butonunu sağa sola rastgele fırlatma (w-18, ml-2 gibi hatalı sınıflar kullanma).
- Arayüzü analiz ederken ana ekseni doğru belirle ve elemanları orijinal tasarımdaki gibi aynı dikey veya yatay hizada tutarlı tut.

4. ETKİLEŞİM GERİ BİLDİRİMLERİ (HOVER/ACTIVE) EKLE:
- Tasarım statik bir görsel olsa bile, klonlanan kodun yaşamasını ve interaktif hissettirmesini sağla.
- Tüm <button> ve <a> etiketlerine hover:opacity-80, hover:scale-105, active:scale-95, transition-all, duration-150 gibi standart Tailwind mikro etkileşim sınıflarını mutlaka ekle.

Do NOT output essays or text chatter. Return valid JSON with exactly these keys:
- "summary": A brief 1-sentence summary of the component in ${lang === 'tr' ? 'Turkish' : 'English'}.
- "reactCode": The complete React functional component code including all nested elements, real SVGs, responsive flex/grid, and Tailwind classes.
- "pureCss": Clean, complete standard CSS stylesheet rules for this component (without Tailwind classes).
- "tailwindClasses": The primary Tailwind classes for the root element.
Return one compact JSON object only. Do not wrap it in Markdown code fences. Keep the component concise enough to fit the response limit and escape quotes/newlines inside string values.

COMPONENT DATA:
${promptSelectionJson}`;
  const compactPromptText = `Create a concise responsive React + Tailwind component from the selected UI.
${langInstruction}
Return only a JSON object with exactly four string fields: summary, reactCode, pureCss, tailwindClasses.
No Markdown fences, explanations, or extra fields. Escape all quotes and newlines correctly. Use real SVG icons and responsive flex/grid classes.
Selected UI: ${promptSelectionJson}`;
      const userContent = activeTargetModel => activeTargetModel === 'qwen/qwen3.8-27b' && Boolean(screenshot)
        ? [
            { type: 'text', text: compactPromptText },
            { type: 'image_url', image_url: { url: screenshot } }
          ]
        : promptText;

      if (apiMode === 'direct') {
        if (!apiKey.trim()) {
          openSettings();
          setTimeout(() => document.getElementById('setting-key')?.focus(), 150);
          throw new Error(lang === 'tr'
            ? 'Groq anahtarı girilmedi. console.groq.com → API Keys’ten ücretsiz anahtar (gsk_…) alıp aşağıya yapıştır, Kaydet’e bas.'
            : 'No Groq key yet. Get a free key (gsk_…) from console.groq.com → API Keys, paste it below and save.');
        }

        const activeTargetModel = VALID_MODELS.includes(model) ? model : DEFAULT_MODEL;
        resultAnalysis = await callGroqDirect(apiKey.trim(), activeTargetModel, userContent);
      } else {
        const activeTargetModel = VALID_MODELS.includes(model) ? model : DEFAULT_MODEL;
        let response;
        let proxyUnreachable = false;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          response = await fetch(`${proxyUrl}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selection: promptSelection, model: activeTargetModel, language: lang }),
            signal: ctrl.signal
          });
          clearTimeout(timer);
        } catch {
          proxyUnreachable = true;
        }
        if (proxyUnreachable) {
          // UI Cloner AI modu tam otomatik: proxy (deploy edildiyse) >
          // gömülü paylaşılan anahtar > kullanıcının kendi anahtarı.
          // Hiçbiri yoksa anahtar istemek için mod değiştirmeden
          // Direct ayarına yönlendir.
          setProxyOnline(false);
          if (SHARED_GROQ_KEY) {
            resultAnalysis = await callGroqDirect(SHARED_GROQ_KEY, activeTargetModel, userContent);
          } else if (apiKey.trim()) {
            resultAnalysis = await callGroqDirect(apiKey.trim(), activeTargetModel, userContent);
          } else {
            openSettings();
            setTimeout(() => document.getElementById('setting-key')?.focus(), 150);
            throw new Error(lang === 'tr'
              ? 'Paylaşılan kota bu yapımda yok. Ayarlar’dan kendi ücretsiz Groq anahtarını (gsk_…) girip Direct moda geç.'
              : 'No shared quota in this build. Add your own free Groq key (gsk_…) in Settings and switch to Direct.');
          }
        } else {
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            throw new Error(getModelErrorMessage(null, lang, response.status));
          }
          if (!response.ok) throw new Error(getModelErrorMessage(payload, lang, response.status) || t.errServer);
          resultAnalysis = { ...payload.analysis, model: activeTargetModel };
        }
      }

      setAnalysis(resultAnalysis);
      setCache((prev) => ({ ...prev, [cacheKey]: resultAnalysis }));
      setShowAiReadyToast(true);
      // 2. başarılı üretimden sonra nazik yorum hatırlatıcısı (tek seferlik).
      try {
        const prior = Number(await getStorageItem('byecoSuccessCount') || 0);
        const total = prior + 1;
        await setStorageItem('byecoSuccessCount', total);
        const dismissed = await getStorageItem('byecoReviewNudgeDismissed');
        if (total >= 2 && !dismissed) setShowReviewNudge(true);
      } catch { /* sayaç kritik değil */ }
      setProxyOnline((prev) => (apiMode === 'proxy' ? true : prev));
      setHistory((prev) => {
        if (!prev || prev.length === 0) return prev;
        return prev.map((h, i) => i === 0
          ? { ...h, summary: resultAnalysis.summary, reactCode: resultAnalysis.reactCode, pureCss: resultAnalysis.pureCss }
          : h);
      });

      if (isSharedProxy) {
        const approximateTokens = estimateRequestTokens(promptSelectionJson) + 1400;
        const currentModelHistory = Array.isArray(usageHistory?.[model]) ? usageHistory[model] : [];
        const updatedHistory = {
          ...(usageHistory || {}),
          [model]: [
            ...currentModelHistory,
            { timestamp: Date.now(), tokens: approximateTokens }
          ]
        };
        setUsageHistory(updatedHistory);
        await setStorageItem('aiUsageHistory', updatedHistory);
      }
    } catch (requestError) {
      setError(requestError.message || t.errAiFailed);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Geçmiş sayfası: başlık butonuna basınca açılan ayrı görünüm.
  const renderHistoryPage = () => (
    <section className="settings-page">
      <div className="settings-page-head">
        <div className="settings-page-title-group">
          <strong>{lang === 'tr' ? '🕘 Geçmiş' : '🕘 History'}</strong>
          <span className="drawer-count">{history.length}/20</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {history.length > 0 && (
            <button type="button" className="mini-btn danger" onClick={clearHistory}>
              {lang === 'tr' ? 'Temizle' : 'Clear'}
            </button>
          )}
          <button type="button" className="mini-btn" onClick={() => setShowHistoryPage(false)}>
            ← {lang === 'tr' ? 'Geri' : 'Back'}
          </button>
        </div>
      </div>
      {(history || []).length === 0 ? (
        <p style={{ margin: '12px 2px', fontSize: 12, color: '#8fa6bf' }}>
          {lang === 'tr' ? 'Henüz geçmiş yok. Bir öğe seçince burada listelenir.' : 'No history yet. Select an element and it will show up here.'}
        </p>
      ) : (
        <div className="history-list history-page-list">
          {history.map((h) => (
            <div key={h.id} className="history-item">
              <div className="history-item-main" onClick={() => restoreFromHistory(h)} title={lang === 'tr' ? 'Geri yüklemek için tıkla' : 'Click to restore'}>
                <strong>&lt;{h.tagName}&gt; {h.dimensions?.width}×{h.dimensions?.height} {h.summary ? `• ${h.summary.slice(0, 60)}` : ''}</strong>
                <small>{new Date(h.ts).toLocaleString()} • {(h.selector || '').slice(0, 60)}</small>
              </div>
              <div className="history-item-actions">
                <button type="button" className="mini-btn" onClick={() => restoreFromHistory(h)}>↩</button>
                <button type="button" className="mini-btn danger" onClick={() => removeHistoryItem(h.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  // Ayarlar sayfası: sekmeli görünümde ve seçim öncesi ekranda ortak kullanılır.
  const renderSettingsPage = () => (
    <section className="settings-page">
      <div className="settings-page-head">
        <div className="settings-page-title-group">
          <div className="settings-modal-icon-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div>
            <h2 className="settings-modal-title">{lang === 'tr' ? 'Ayarlar' : 'Settings'}</h2>
            <p className="settings-modal-sub">
              {lang === 'tr' ? 'Model ve bağlantı' : 'Model & connection'}
            </p>
          </div>
        </div>
        <button type="button" className="mini-btn" onClick={closeSettings}>
          ← {lang === 'tr' ? 'Geri' : 'Back'}
        </button>
      </div>

      <form onSubmit={saveSettings} className="settings-modal-body">
        <div className="modal-field-group">
          <div className="modal-label-row">
            <label htmlFor="setting-model">{t.modelLabel}</label>
            <span className="model-chip">{model.split('/')[1] || model}</span>
          </div>
          <select
            id="setting-model"
            value={model}
            onChange={async (e) => {
              const newModel = e.target.value;
              setModel(newModel);
              await setStorageItem('groqModel', newModel);
            }}
            className="modal-select"
          >
            <option value="openai/gpt-oss-120b">OpenAI GPT-OSS 120B — 5/gün</option>
            <option value="openai/gpt-oss-20b">OpenAI GPT-OSS 20B — 10/gün</option>
            <option value="qwen/qwen3.8-27b">Qwen 3.8 27B — 10/gün</option>
          </select>
          <span className="modal-field-hint">
            {MODEL_ACCESS[model]?.tier === 'free'
              ? (lang === 'tr' ? 'Ücretsiz • 30 istek/dk • 70K token/dk' : 'Free • 30 req/min • 70K tokens/min')
              : (lang === 'tr' ? `${getModelLimitSummary(model, 'tr')}` : `${getModelLimitSummary(model, 'en')}`)}
          </span>
        </div>

        <div className="modal-field-group">
          <div className="modal-label-row">
            <label htmlFor="setting-mode">{t.connectionMode}</label>
            <span className={`status-pill ${apiMode === 'direct' ? 'direct' : 'proxy'}`}>
              {apiMode === 'direct' ? 'BYOK Direct' : 'UI Cloner AI'}
            </span>
          </div>
          <select
            id="setting-mode"
            value={apiMode}
            onChange={async (e) => {
              const newMode = e.target.value;
              setApiMode(newMode);
              await setStorageItem('groqApiMode', newMode);
            }}
            className="modal-select"
          >
            <option value="proxy">{t.proxyMode}</option>
            <option value="direct">{t.directMode}</option>
          </select>
          <span className="modal-field-hint">
            {apiMode === 'direct' ? t.directModeHelp : t.proxyModeHelp}
          </span>
        </div>

        {apiMode === 'proxy' && (
          <details className="modal-field-group">
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#8fa6bf' }}>
              {lang === 'tr' ? 'Gelişmiş: sunucu adresi' : 'Advanced: server address'}
            </summary>
            <input
              id="setting-proxy-url"
              type="url"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="https://byeco-ai.onrender.com"
              className="modal-input"
              autoComplete="off"
              spellCheck="false"
              style={{ marginTop: 8 }}
            />
            <span className="modal-field-hint">
              {lang === 'tr'
                ? 'Normalde dokunmayın; dağıtımda hazır gelir.'
                : 'Usually untouched; preconfigured at build time.'}
            </span>
          </details>
        )}

        {apiMode === 'direct' && (
          <div className="modal-field-group">
            <label htmlFor="setting-key">{t.apiKeyLabel}</label>
            <input
              id="setting-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gsk_..."
              className="modal-input"
              autoComplete="off"
              spellCheck="false"
            />
            <span className="modal-field-hint">{t.apiKeyHelp}</span>
          </div>
        )}

        <section className="data-privacy-panel" aria-labelledby="data-privacy-title">
          <div className="data-privacy-heading">
            <div className="data-privacy-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 5 6v5c0 4.6 2.9 8.5 7 10 4.1-1.5 7-5.4 7-10V6l-7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <strong id="data-privacy-title">
                {lang === 'tr' ? 'Verileriniz' : 'Your data'}
              </strong>
              <p>
                {lang === 'tr' ? 'Her şey bu tarayıcıda tutulur.' : 'Everything stays in this browser.'}
              </p>
            </div>
          </div>
          <ul className="data-privacy-list">
            <li>{lang === 'tr' ? 'Anahtar yalnızca yerel depolamada saklanır.' : 'Key is stored only locally.'}</li>
            <li>{lang === 'tr' ? 'Seçim ve kod kalıcı kaydedilmez.' : 'Selections and code are not stored.'}</li>
          </ul>
          <button type="button" className="data-clear-btn" onClick={clearUserData}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2M19 6l-1 15H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            {lang === 'tr' ? 'Yerel verileri temizle' : 'Clear local data'}
          </button>
          <a
            className="privacy-policy-link"
            href="privacy.html"
            target="_blank"
            rel="noreferrer"
          >
            {lang === 'tr' ? 'Gizlilik politikası ve sözleşmeler' : 'Privacy policy and agreements'}
            <span aria-hidden="true">↗</span>
          </a>
        </section>

        <div className="settings-modal-footer">
          <div className="modal-footer-status">
            {savedSettingsNotice && (
              <span className="save-toast-tag">✓ {t.savedSuccess}</span>
            )}
          </div>
          <div className="modal-footer-buttons">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={closeSettings}
            >
              {lang === 'tr' ? 'Geri' : 'Back'}
            </button>
            <button type="submit" className="modal-save-btn">
              💾 {t.saveSettings}
            </button>
          </div>
        </div>
      </form>
    </section>
  );

  return (
    <main className="panel-shell">
      {/* Floating Notifications in Top-Right Corner (timed, auto-dismiss) */}
      {(savedSettingsNotice || showAiReadyToast) && (
        <aside className="floating-toast-container" role="status" aria-live="polite">
          {showAiReadyToast && (
            <div className="floating-toast-card">
              <div className="toast-icon-circle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="toast-content">
                <strong className="toast-title">{t.aiReadyNotice}</strong>
                <p className="toast-desc">{analysis?.model || model}</p>
              </div>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => setShowAiReadyToast(false)}
                aria-label={lang === 'tr' ? 'Bildirimi Kapat' : 'Dismiss'}
              >
                ✕
              </button>
            </div>
          )}
          {savedSettingsNotice && (
          <div className="floating-toast-card">
            <div className="toast-icon-circle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="toast-content">
              <strong className="toast-title">{lang === 'tr' ? 'Ayarlar Kaydedildi' : 'Settings Saved'}</strong>
              <p className="toast-desc">{lang === 'tr' ? 'Yapılandırma başarıyla güncellendi.' : 'Configuration successfully updated.'}</p>
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => setSavedSettingsNotice(false)}
              aria-label={lang === 'tr' ? 'Bildirimi Kapat' : 'Dismiss'}
            >
              ✕
            </button>
          </div>
          )}
        </aside>
      )}

      <div className="panel-container">
        {/* Sleek Top Header Bar */}
      <header className="panel-header-bar">
        <div className="header-left">
          <div className="brand-group">
            <span className="brand-dot" />
            <span className="brand-name">{t.brand}</span>
            <span className="mono-tag" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, color: '#67e8f9', background: '#0b2a3a', border: '1px solid #155e75', borderRadius: 4, padding: '1px 5px' }}>v{EXT_VERSION}</span>
          </div>

          {isInspecting && (
            <div
              className="inspecting-live-pill"
              onClick={toggleInspection}
              title={lang === 'tr' ? 'Seçimi durdur (ESC)' : 'Stop selection (ESC)'}
              style={{ cursor: 'pointer' }}
            >
              <span className="live-ping-dot" />
              <span>{lang === 'tr' ? 'Hedef öğeye tıklayın...' : 'Click target element...'}</span>
              <kbd className="kbd-shortcut">ESC</kbd>
            </div>
          )}
        </div>

        <div className="header-right">
          <button
            type="button"
            className="lang-pill-btn lang-toggle"
            onClick={() => changeLanguage(lang === 'tr' ? 'en' : 'tr')}
            title="Dili Değiştir / Switch Language"
          >
            <span className={lang === 'tr' ? 'on' : ''}>TR</span>
            <span className="lang-sep">|</span>
            <span className={lang === 'en' ? 'on' : ''}>EN</span>
          </button>

          <button
            type="button"
            className={`settings-icon-btn ${(activeTab === 'settings' || isSettingsOpen) ? 'active' : ''}`}
            onClick={openSettings}
            title={lang === 'tr' ? 'Ayarlar' : 'Settings'}
            aria-label="Ayarlar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {false && null}

      {error && (
        <div className="notice" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, flex: 1 }}>{error}</p>
          <button
            type="button"
            className="mini-btn"
            style={{ flexShrink: 0 }}
            onClick={() => copyOutput('errdiag', `UI Cloner diag v${EXT_VERSION} | mode=${apiMode} | model=${model} | key=${apiKey.trim() ? 'var' : 'yok'} | proxy=${String(proxyOnline)} | err=${error}`)}
            title={lang === 'tr' ? 'Teşhisi kopyala' : 'Copy diagnostics'}
          >
            {copied === 'errdiag' ? '✓' : (lang === 'tr' ? '⧉ Kopyala' : '⧉ Copy')}
          </button>
        </div>
      )}

      {/* Empty State / Settings / History */}
      {showHistoryPage ? renderHistoryPage() : (!selection ? (
        isSettingsOpen ? renderSettingsPage() : (
        <section className="empty-state">
          <div className="empty-state-card">
            <div className="empty-target-ring">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
            </div>
            <strong className="empty-title">{t.emptyTitle}</strong>
            <p className="empty-desc">{t.emptyDesc}</p>
            <button
              className={`empty-cta-button ${isInspecting ? 'inspecting' : ''}`}
              onClick={toggleInspection}
            >
              {isInspecting ? (
                <>
                  <span className="live-ping-dot" />
                  <span>{lang === 'tr' ? 'Seçim Aktif (ESC ile İptal)' : 'Inspecting (ESC to cancel)'}</span>
                </>
              ) : (
                <>
                  <span>🎯</span>
                  <span>{t.selectElement}</span>
                </>
              )}
            </button>
            {history.length > 0 && (
              <button
                type="button"
                className="mini-btn"
                style={{ marginTop: 10 }}
                onClick={() => setShowHistoryPage(true)}
              >
                🕘 {lang === 'tr' ? `Geçmiş (${history.length})` : `History (${history.length})`}
              </button>
            )}
            <div className="quick-start-guide" aria-label={lang === 'tr' ? 'Hızlı kullanım rehberi' : 'Quick start guide'}>
              <div className="quick-start-head">
                <span className="quick-start-heading">
                  {lang === 'tr' ? 'Nasıl çalışır?' : 'How it works'}
                </span>
                <span className="quick-start-badge">3 {lang === 'tr' ? 'adım' : 'steps'}</span>
              </div>
              <div className="quick-start-steps">
                <div className="quick-start-step">
                  <span className="quick-start-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="2.5" />
                      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" />
                    </svg>
                  </span>
                  <span className="quick-start-text">
                    <strong><span className="quick-start-number">01</span>{lang === 'tr' ? 'Öğe seç' : 'Inspect'}</strong>
                    <small>{lang === 'tr' ? 'Sayfadan bileşeni işaretle' : 'Pick any element'}</small>
                  </span>
                </div>
                <div className="quick-start-step">
                  <span className="quick-start-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5Z" />
                    </svg>
                  </span>
                  <span className="quick-start-text">
                    <strong><span className="quick-start-number">02</span>{lang === 'tr' ? 'AI ile üret' : 'Generate'}</strong>
                    <small>{lang === 'tr' ? 'React + Tailwind kodu al' : 'Get React + Tailwind'}</small>
                  </span>
                </div>
                <div className="quick-start-step">
                  <span className="quick-start-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="12" height="12" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                  </span>
                  <span className="quick-start-text">
                    <strong><span className="quick-start-number">03</span>{lang === 'tr' ? 'Kopyala' : 'Copy'}</strong>
                    <small>{lang === 'tr' ? 'Tek tıkla projene taşı' : 'Ship to your project'}</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        )
      ) : (
        <section className="workspace-container">
          {/* Primary Tabs + Reselect Action */}
          <div className="tabs-bar">
            <div className="tabs-group-left">
              <button
                className={`tab-btn ${activeTab === 'ai' ? 'active-ai' : ''}`}
                onClick={() => setActiveTab('ai')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <span>{t.tabAi}</span>
                <span className={`quota-tab-chip ${isQuotaReached ? 'depleted' : ''}`} title={t.quotaLeft}>
                  {activeModelQuota.requestsPerDay === null ? '∞' : `${remainingQuota ?? 0}/${activeModelQuota.requestsPerDay}`}
                </span>
                {isAnalyzing && <span className="tab-badge pulse">…</span>}
                {analysis && !isAnalyzing && <span className="tab-badge ready">✓</span>}
              </button>
              <button
                className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
                onClick={() => setActiveTab('raw')}
                title={lang === 'tr' ? 'İskelet & Tasarım kodları' : 'Skeleton & Design codes'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>
                <span>{t.tabRaw}</span>
              </button>
              <button
                className={`tab-btn ${isInspecting ? 'tab-reselect-inspecting' : 'tab-reselect'}`}
                onClick={toggleInspection}
                title={isInspecting ? (lang === 'tr' ? 'Seçimi durdur (ESC)' : 'Cancel selection (ESC)') : (lang === 'tr' ? 'Başka bir bileşen seç' : 'Select another component')}
              >
                {isInspecting ? (
                  <>
                    <span className="live-ping-dot" />
                    <span>{lang === 'tr' ? 'İptal' : 'Cancel'}</span>
                    <kbd className="kbd-shortcut">ESC</kbd>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="3"/>
                      <line x1="12" y1="2" x2="12" y2="5"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                      <line x1="2" y1="12" x2="5" y2="12"/>
                      <line x1="19" y1="12" x2="22" y2="12"/>
                    </svg>
                    <span>{lang === 'tr' ? 'Yeni Seç' : 'Select'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Geçmiş: butona basınca ayrı sayfa açılır */}
          <div className="history-head">
            <button
              type="button"
              className="history-head-btn"
              onClick={() => setShowHistoryPage(true)}
            >
              <span className="history-chevron" aria-hidden="true">▸</span>
              <strong>{lang === 'tr' ? '🕘 Geçmiş' : '🕘 History'}</strong>
              <span className="drawer-count">{history.length}/20</span>
            </button>
          </div>

          {/* Secondary Sub-Tabs — only when Raw tab is active */}
          {activeTab === 'raw' && (
            <div className="sub-tabs-bar">
              <button
                className={`sub-tab-btn ${subTab === 'split' ? 'active' : ''}`}
                onClick={() => setSubTab('split')}
              >{t.subSplit}</button>
              <button
                className={`sub-tab-btn ${subTab === 'jsx' ? 'active' : ''}`}
                onClick={() => setSubTab('jsx')}
              >{t.subJsx}</button>
              <button
                className={`sub-tab-btn ${subTab === 'css' ? 'active' : ''}`}
                onClick={() => setSubTab('css')}
              >{t.subCss}</button>
              <button
                className={`sub-tab-btn ${subTab === 'tailwind' ? 'active' : ''}`}
                onClick={() => setSubTab('tailwind')}
              >{t.subTailwind}</button>
            </div>
          )}

          {/* TAB 1: AI React Code (Pure Code Only) */}
          {activeTab === 'ai' && (
            <div className="tab-pane">
              {/* Area Screenshot Preview Thumbnail */}
              {screenshot && (
                <div className="screenshot-preview-bar">
                  <div className="screenshot-preview-left">
                    <img
                      src={screenshot}
                      alt="Captured Area"
                      className="screenshot-thumb"
                      title={lang === 'tr' ? 'Seçilen Alanın Fotoğrafı' : 'Captured Area Photo'}
                    />
                    <div className="screenshot-info">
                      <span>📸 {lang === 'tr' ? 'Yakalanan Tasarım Fotoğrafı' : 'Captured Design Photo'}</span>
                      <small>{selection.dimensions.width} × {selection.dimensions.height}px</small>
                    </div>
                  </div>
                  <span className="model-pill">{model}</span>
                </div>
              )}

              {isAnalyzing && (
                <div className="ai-loading-box">
                  <div className="ai-loading-spinner" />
                  <p>{t.aiAnalyzingStatus}</p>
                  <div className="ai-skeleton-bar" />
                  <div className="ai-skeleton-bar" style={{ width: '60%' }} />
                </div>
              )}

              {!isAnalyzing && !analysis && (
                <div className="ai-cta-card">
                  <div className="ai-cta-inner">
                    {/* Quota Indicator Banner */}
                    <div className="quota-indicator-box">
                      <div className="quota-dots-row">
                        {activeModelQuota.requestsPerDay === null
                          ? [1].map(() => (
                              <span key="free" className="quota-pip active" title={lang === 'tr' ? 'Ücretsiz kullanım' : 'Free access'} />
                            ))
                          : [...Array(Math.min(activeModelQuota.requestsPerDay, 10))].map((_, i) => (
                              <span
                                key={i}
                                className={`quota-pip ${i < (remainingQuota ?? 0) / Math.max(1, Math.ceil((activeModelQuota.requestsPerDay || 1) / 10)) ? 'active' : 'used'}`}
                                title={i < (remainingQuota ?? 0) / Math.max(1, Math.ceil((activeModelQuota.requestsPerDay || 1) / 10)) ? (lang === 'tr' ? 'Kullanılabilir hak' : 'Available credit') : (lang === 'tr' ? 'Kullanıldı' : 'Used')}
                              />
                            ))}
                      </div>
                      <span className="quota-counter-text">
                        {activeModelQuota.requestsPerDay === null
                          ? (lang === 'tr' ? '⚡ Ücretsiz model. Günlük limit uygulanmaz.' : '⚡ Free model. No daily cap is enforced.')
                          : isQuotaReached
                            ? (lang === 'tr'
                                ? `⏳ Günlük istek limiti doldu. Yenilenme: ${formatCountdown(timeUntilReset)}`
                                : `⏳ Daily request limit reached. Resets in: ${formatCountdown(timeUntilReset)}`)
                            : (lang === 'tr'
                                ? `⚡ ${remainingQuota}/${activeModelQuota.requestsPerDay} günlük istek hakkı kaldı`
                                : `⚡ ${remainingQuota}/${activeModelQuota.requestsPerDay} daily requests left`)}
                      </span>
                    </div>

                    <button
                      className={`ai-cta-generate-btn ${isQuotaReached ? 'quota-disabled' : ''}`}
                      onClick={analyzeSelection}
                      disabled={isAnalyzing || isQuotaReached}
                      title={isQuotaReached ? t.quotaExceeded : ''}
                    >
                      {!isQuotaReached ? (
                        <>
                          <span>⚡</span>
                          <span>{t.analyzeAi}</span>
                          <span className="ai-cta-model-tag">{model.includes('120b') ? '120B Flagship' : (model.includes('20b') ? '20B Hızlı' : (model.includes('27b') ? 'Vision 27B' : 'Fast'))}</span>
                        </>
                      ) : (
                        <>
                          <span>⏳</span>
                          <span>{lang === 'tr' ? `Süre bekleniyor (${formatCountdown(timeUntilReset)})` : `Wait (${formatCountdown(timeUntilReset)})`}</span>
                        </>
                      )}
                    </button>
                    {apiMode === 'proxy' && proxyOnline === false && !SHARED_GROQ_KEY && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: 440 }}>
                        <small style={{ color: '#8fa6bf', fontSize: 11 }}>
                          {lang === 'tr' ? 'Sunucuya ulaşılamıyor — kendi anahtarınla devam edebilirsin:' : 'Server is unreachable — you can continue with your own key:'}
                        </small>
                        <button
                          type="button"
                          className="tool-btn solid"
                          onClick={async () => {
                            setApiMode('direct');
                            await setStorageItem('groqApiMode', 'direct');
                            setActiveTab('settings');
                          }}
                        >
                          {lang === 'tr' ? '🔑 Direct moda geç' : '🔑 Switch to Direct'}
                        </button>
                        <button
                          type="button"
                          className="tool-btn"
                          onClick={async () => {
                            try {
                              const res = await fetch(`${proxyUrl}/health`);
                              setProxyOnline(res.ok);
                            } catch { setProxyOnline(false); }
                          }}
                        >
                          {lang === 'tr' ? '↻ Tekrar dene' : '↻ Retry'}
                        </button>
                      </div>
                    )}
                    {apiMode === 'proxy' && proxyOnline === true && (
                      <small style={{ color: '#6ee7b7', fontSize: 10.5 }}>
                        {lang === 'tr' ? '● Sunucu çevrimiçi' : '● Server online'}
                      </small>
                    )}
                  </div>
                </div>
              )}

              {!isAnalyzing && analysis && (
                <article className="capture-card capture-card-wide" style={{ overflow: 'hidden' }}>
                  <div className="code-card-header">
                    <div className="code-card-title">
                      <span className="model-pill">{analysis.model || model}</span>
                      {analysis.summary && <span className="summary-line">{analysis.summary}</span>}
                    </div>
                    <div className="code-card-actions">
                      <button
                        className={`regenerate-code-btn ${isQuotaReached ? 'quota-disabled' : ''}`}
                        onClick={analyzeSelection}
                        disabled={isAnalyzing || isQuotaReached}
                        title={isQuotaReached ? t.quotaExceeded : t.reAnalyzeAi}
                      >
                        {activeModelQuota.requestsPerDay === null
                          ? '🔄 Yeniden Üret'
                          : !isQuotaReached
                            ? `🔄 ${lang === 'tr' ? `Yeniden Üret (${remainingQuota}/${activeModelQuota.requestsPerDay})` : `Regenerate (${remainingQuota}/${activeModelQuota.requestsPerDay})`}`
                            : `⏳ ${formatCountdown(timeUntilReset)}`}
                      </button>
                      <button
                        className={`copy-code-btn ${copied === 'ai' ? 'copied' : ''}`}
                        onClick={() => copyOutput('ai', analysis.reactCode)}
                      >
                        {copied === 'ai' ? t.copied : t.copyAiCode}
                      </button>
                    </div>
                  </div>
                  <pre className="code-output">{analysis.reactCode}</pre>
                </article>
              )}

              {showReviewNudge && !isAnalyzing && analysis && (
                <div className="review-nudge" role="status">
                  <span className="review-nudge-star" aria-hidden="true">★</span>
                  <p>{lang === 'tr' ? 'Memnun kaldınız mı? Bir yorum bırakırsanız seviniriz.' : 'Enjoying it? We would love your review.'}</p>
                  <div className="review-nudge-btns">
                    <button type="button" className="tool-btn solid" onClick={openStoreReview}>
                      {lang === 'tr' ? 'Puan Ver ↗' : 'Rate ↗'}
                    </button>
                    <button type="button" className="tool-btn" onClick={dismissReviewNudge}>✕</button>
                  </div>
                </div>
              )}

              {/* Araçlar: tek kart + alt köşede ileri/geri butonları,
                  sağa-sola kayma animasyonuyla geçiş */}
              {!isAnalyzing && (
                <div className="tool-pager">
                  <div key={`${toolIndex}-${toolDir}`} className={`tool-slide-wrap slide-${toolDir > 0 ? 'left' : 'right'}`}>
                  {toolIndex === 0 && (
                  <section className="feature-card">
                    <div className="feature-card-head">
                      <span>{lang === 'tr' ? '◉ Canlı Önizleme' : '◉ Live Preview'}</span>
                      <span className="mono-tag">html + css</span>
                    </div>
                    <div className="feature-card-body">
                      {previewDoc ? (
                        <iframe title="preview" className="preview-frame" sandbox="" srcDoc={previewDoc} />
                      ) : (
                        <p style={{ margin: 0, fontSize: 11, color: '#8fa6bf' }}>{lang === 'tr' ? 'Önizleme için önce öğe seçin.' : 'Select an element for preview.'}</p>
                      )}
                      <small style={{ color: '#647a93', fontSize: 10.5 }}>
                        {lang === 'tr' ? 'Seçili HTML + üretilen CSS ile birebir önizleme. Beyaz zemin bilinçli: gerçek sayfa zemini.' : 'Renders selected HTML with generated CSS on a neutral canvas.'}
                      </small>
                    </div>
                  </section>
                  )}

                  {toolIndex === 1 && (
                  <section className="feature-card">
                    <div className="feature-card-head">
                      <span>{lang === 'tr' ? '● Renk & Yazı Paleti' : '● Color & Type'}</span>
                      <span className="mono-tag">{palette.colors.length} renk</span>
                    </div>
                    <div className="feature-card-body">
                      {palette.colors.length === 0 && <p style={{ margin: 0, fontSize: 11, color: '#8fa6bf' }}>{lang === 'tr' ? 'Renk bulunamadı.' : 'No colors found.'}</p>}
                      <div className="palette-row">
                        {palette.colors.map((c) => (
                          <button key={c.hex} type="button" className="palette-swatch" onClick={() => copyOutput(`pal-${c.hex}`, c.hex)} title={lang === 'tr' ? 'Kopyalamak için tıkla' : 'Click to copy'}>
                            <span className="palette-dot" style={{ background: c.hex }} />
                            <span className="palette-meta">
                              <strong>{copied === `pal-${c.hex}` ? '✓' : c.hex}</strong>
                              <small>{c.roles.join(' • ') || `${c.count}×`}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                      {palette.fonts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {palette.fonts.map((f) => (
                            <small key={f.label} style={{ fontSize: 10.5, color: '#8fa6bf', fontFamily: 'ui-monospace, monospace' }}>✎ {f.label}</small>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                  )}

                  {toolIndex === 2 && (
                  <section className="feature-card">
                    <div className="feature-card-head">
                      <span>{lang === 'tr' ? '✦ Kod İyileştirme' : '✦ Enhance'}</span>
                      <span className="mono-tag">dark • responsive • a11y</span>
                    </div>
                    <div className="feature-card-body">
                      <div className="enhance-toolbar">
                        <button type="button" className={`tool-btn ${variant === 'dark' ? 'solid' : ''}`} onClick={() => applyVariant('dark')}>🌙 Dark</button>
                        <button type="button" className={`tool-btn ${variant === 'responsive' ? 'solid' : ''}`} onClick={() => applyVariant('responsive')}>📐 Responsive</button>
                        <button type="button" className={`tool-btn ${variant === 'a11y' ? 'solid' : ''}`} onClick={() => applyVariant('a11y')}>♿ A11y</button>
                        {variantOutput && <button type="button" className="tool-btn" onClick={() => copyOutput('variant', variantOutput)}>{copied === 'variant' ? t.copied : t.copyCode}</button>}
                      </div>
                      {variant === 'a11y' ? (
                        <ul className="a11y-list">
                          {a11yChecks.map((c, i) => <li key={i} className={c.level}>{c.level === 'ok' ? '✓ ' : '⚠ '}{c.text}</li>)}
                        </ul>
                      ) : (
                        variantOutput ? <pre className="variant-output">{variantOutput}</pre>
                        : <small style={{ color: '#647a93', fontSize: 10.5 }}>{lang === 'tr' ? 'Bir varyant seçin; sonuç burada belirir.' : 'Pick a variant to preview the tweak.'}</small>
                      )}
                    </div>
                  </section>
                  )}

                  {toolIndex === 3 && (
                  <section className="feature-card">
                    <div className="feature-card-head">
                      <span>{lang === 'tr' ? '⤓ Dışa Aktar' : '⤓ Export'}</span>
                      <span className="mono-tag">{exportBase}</span>
                    </div>
                    <div className="feature-card-body">
                      <div className="export-toolbar">
                        <button type="button" className="tool-btn solid" onClick={() => handleExport('jsx')}>⬇ .jsx</button>
                        <button type="button" className="tool-btn" onClick={() => handleExport('css')}>⬇ .css</button>
                        <button type="button" className="tool-btn" onClick={() => handleExport('json')}>⬇ .json</button>
                        <button type="button" className="tool-btn" onClick={() => handleExport('all')}>{copied === 'all' ? t.copied : (lang === 'tr' ? '⧉ Tümünü kopyala' : '⧉ Copy all')}</button>
                      </div>
                      <small style={{ color: '#647a93', fontSize: 10.5 }}>
                        {lang === 'tr' ? 'Dosya adı öğe + boyuttan üretilir, projenize yapıştırmaya hazır.' : 'Filenames derive from tag + size, ready to drop in.'}
                      </small>
                    </div>
                  </section>
                  )}
                  </div>
                  <div className="tool-pager-bar">
                    <span className="tool-pager-title">
                      {[
                        lang === 'tr' ? 'Önizleme' : 'Preview',
                        lang === 'tr' ? 'Palet' : 'Palette',
                        lang === 'tr' ? 'İyileştirme' : 'Enhance',
                        lang === 'tr' ? 'Dışa Aktar' : 'Export'
                      ][toolIndex]}
                    </span>
                    <div className="tool-pager-btns">
                      <button type="button" className="pager-btn" onClick={() => goTool(-1)} aria-label={lang === 'tr' ? 'Önceki araç' : 'Previous tool'}>‹</button>
                      <span className="pager-count">{toolIndex + 1}/4</span>
                      <button type="button" className="pager-btn" onClick={() => goTool(1)} aria-label={lang === 'tr' ? 'Sonraki araç' : 'Next tool'}>›</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2 / Sub: Yan Yana İskelet & Tasarım (Side-by-Side Split View) */}
          {activeTab === 'raw' && subTab === 'split' && (
            <div className="tab-pane">
              <div className="split-code-grid">
                {/* Sol Kolon: İskelet (React JSX) */}
                <article className="capture-card" style={{ overflow: 'hidden' }}>
                  <div className="code-card-header">
                    <div className="code-card-title">
                      <span>{t.skeletonTitle}</span>
                      {selection.totalChildren > 0 && (
                        <span className="model-pill">{selection.totalChildren} children</span>
                      )}
                    </div>
                    <button
                      className={`copy-code-btn ${copied === 'jsx' ? 'copied' : ''}`}
                      onClick={() => copyOutput('jsx', jsx)}
                    >
                      {copied === 'jsx' ? t.copied : t.copyJsx}
                    </button>
                  </div>
                  <pre className="code-output">{jsx}</pre>
                </article>

                {/* Sağ Kolon: Tasarım (Saf CSS) */}
                <article className="capture-card" style={{ overflow: 'hidden' }}>
                  <div className="code-card-header">
                    <div className="code-card-title">
                      <span>{t.designTitle}</span>
                      <span className="model-pill">Pure CSS</span>
                    </div>
                    <button
                      className={`copy-code-btn ${copied === 'css' ? 'copied' : ''}`}
                      onClick={() => copyOutput('css', cssCode)}
                    >
                      {copied === 'css' ? t.copied : t.copyCss}
                    </button>
                  </div>
                  <pre className="code-output">{cssCode}</pre>
                </article>
              </div>
            </div>
          )}

          {/* Sub: Saf CSS (Pure CSS Stylesheet) */}
          {activeTab === 'raw' && subTab === 'css' && (
            <div className="tab-pane">
              <article className="capture-card capture-card-wide" style={{ overflow: 'hidden' }}>
                <div className="code-card-header">
                  <div className="code-card-title">
                    <span>{t.designTitle}</span>
                    <span className="model-pill">Pure CSS Stylesheet</span>
                  </div>
                  <button
                    className={`copy-code-btn ${copied === 'css' ? 'copied' : ''}`}
                    onClick={() => copyOutput('css', cssCode)}
                  >
                    {copied === 'css' ? t.copied : t.copyCss}
                  </button>
                </div>
                <pre className="code-output">{cssCode}</pre>
              </article>
            </div>
          )}

          {/* Sub: Quick Local JSX */}
          {activeTab === 'raw' && subTab === 'jsx' && (
            <div className="tab-pane">
              <article className="capture-card capture-card-wide" style={{ overflow: 'hidden' }}>
                <div className="code-card-header">
                  <div className="code-card-title">
                    <span>React JSX</span>
                    {selection.totalChildren > 0 && <span className="model-pill">{selection.totalChildren} children</span>}
                  </div>
                  <button
                    className={`copy-code-btn ${copied === 'jsx' ? 'copied' : ''}`}
                    onClick={() => copyOutput('jsx', jsx)}
                  >
                    {copied === 'jsx' ? t.copied : t.copyJsx}
                  </button>
                </div>
                <pre className="code-output">{jsx}</pre>
              </article>
            </div>
          )}

          {/* Sub: Tailwind Classes */}
          {activeTab === 'raw' && subTab === 'tailwind' && (
            <div className="tab-pane">
              <article className="capture-card capture-card-wide" style={{ overflow: 'hidden' }}>
                <div className="code-card-header">
                  <div className="code-card-title">
                    <span>Tailwind CSS</span>
                  </div>
                  <button
                    className={`copy-code-btn ${copied === 'tailwind' ? 'copied' : ''}`}
                    onClick={() => copyOutput('tailwind', tailwind)}
                  >
                    {copied === 'tailwind' ? t.copied : t.copyClasses}
                  </button>
                </div>
                <pre className="code-output">{tailwind || 'No mapped styles'}</pre>
                </article>
            </div>
          )}

          {/* Ayarlar sayfası */}
          {activeTab === 'settings' && (
            <div className="tab-pane">
              {renderSettingsPage()}
            </div>
          )}

        </section>
      ))}
        <footer className="panel-footer">
          <span className="panel-footer-dot" />
          <span>UI Cloner</span>
          <span className="mono-tag" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9 }}>v{EXT_VERSION}</span>
        </footer>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<SidePanel />);
