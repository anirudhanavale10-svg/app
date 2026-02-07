import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { io } from "socket.io-client";
import { Mic, Monitor, Smartphone, Power, MessageSquare, Send, Hand, ArrowLeft, LogIn, LogOut, BarChart3, Users, Copy, Check, X, Volume2, VolumeX, Play, Square, TrendingUp, Wifi, WifiOff, AlertCircle, Globe, UserMinus, ChevronDown } from "lucide-react";

const API = window.location.origin;

// ─── Socket singleton ────────────────────────────────────────────────────────
let _socket = null;
function getSocket() {
  if (!_socket) {
    _socket = io(API, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    _socket.on("connect", () => console.log("✅ Connected:", _socket.id));
    _socket.on("connect_error", (e) => console.error("❌ Socket error:", e.message));
  }
  return _socket;
}

// ─── WebRTC ──────────────────────────────────────────────────────────────────
// Default config with STUN only (TURN added dynamically)
let ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// Fetch fresh TURN credentials from Cloudflare (free, temporary creds)
async function refreshTurnCredentials() {
  try {
    const r = await fetch("https://speed.cloudflare.com/turn-creds");
    if (r.ok) {
      const creds = await r.json();
      ICE = {
        ...ICE,
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: creds.urls.filter(u => u.startsWith("turn:") || u.startsWith("turns:")), username: creds.username, credential: creds.credential },
        ],
      };
      console.log("✅ TURN credentials refreshed");
    }
  } catch (e) {
    console.warn("⚠️ Could not fetch TURN creds, using STUN only:", e.message);
  }
}
// Fetch on load
refreshTurnCredentials();
// Refresh every 20 minutes (creds may expire)
setInterval(refreshTurnCredentials, 20 * 60 * 1000);

// ─── Translation languages (European focus) ─────────────────────────────────
const LANGUAGES = [
  { code: "en", label: "🇬🇧 English" },
  { code: "fr", label: "🇫🇷 Français" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "es", label: "🇪🇸 Español" },
  { code: "it", label: "🇮🇹 Italiano" },
  { code: "pt", label: "🇵🇹 Português" },
  { code: "nl", label: "🇳🇱 Nederlands" },
  { code: "pl", label: "🇵🇱 Polski" },
  { code: "ro", label: "🇷🇴 Română" },
  { code: "sv", label: "🇸🇪 Svenska" },
  { code: "da", label: "🇩🇰 Dansk" },
  { code: "fi", label: "🇫🇮 Suomi" },
  { code: "no", label: "🇳🇴 Norsk" },
  { code: "el", label: "🇬🇷 Ελληνικά" },
  { code: "cs", label: "🇨🇿 Čeština" },
  { code: "hu", label: "🇭🇺 Magyar" },
  { code: "bg", label: "🇧🇬 Български" },
  { code: "hr", label: "🇭🇷 Hrvatski" },
  { code: "sk", label: "🇸🇰 Slovenčina" },
  { code: "sl", label: "🇸🇮 Slovenščina" },
  { code: "et", label: "🇪🇪 Eesti" },
  { code: "lv", label: "🇱🇻 Latviešu" },
  { code: "lt", label: "🇱🇹 Lietuvių" },
  { code: "lb", label: "🇱🇺 Lëtzebuergesch" },
  { code: "ru", label: "🇷🇺 Русский" },
  { code: "uk", label: "🇺🇦 Українська" },
  { code: "tr", label: "🇹🇷 Türkçe" },
];

// Translation queue to avoid rate limiting
let translateQueue = Promise.resolve();

async function translateText(text, targetLang) {
  if (!text || targetLang === "en") return text;

  const result = await new Promise((resolve) => {
    translateQueue = translateQueue.then(async () => {
      await new Promise((r) => setTimeout(r, 100));
      try {
        // Use server-side proxy to avoid CORS issues
        const r = await fetch(`${API}/api/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, target: targetLang }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d.translated && d.translated.toLowerCase() !== text.toLowerCase()) {
            resolve(d.translated);
            return;
          }
        }
      } catch {}
      // Fallback: MyMemory direct (CORS-friendly)
      try {
        const tl = targetLang === "no" ? "nb" : targetLang === "lb" ? "de" : targetLang;
        const r = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|${tl}&de=speakapp@conference.io`
        );
        if (r.ok) {
          const d = await r.json();
          const result = d.responseData?.translatedText;
          if (result && !result.includes("MYMEMORY WARNING") && result.toLowerCase() !== text.toLowerCase()) {
            resolve(result);
            return;
          }
        }
      } catch {}
      resolve(text);
    });
  });
  return result;
}

// Translate original text then apply profanity filter to the translation
async function translateAndFilter(originalText, targetLang) {
  if (!originalText || targetLang === "en") return { translated: originalText, beeped: false };

  const result = await new Promise((resolve) => {
    translateQueue = translateQueue.then(async () => {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const r = await fetch(`${API}/api/translate-filter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: originalText, target: targetLang }),
        });
        if (r.ok) {
          const d = await r.json();
          resolve({ translated: d.translated || originalText, beeped: d.beeped || false });
          return;
        }
      } catch {}
      // Fallback: regular translate (won't filter but at least translates)
      try {
        const tl = targetLang === "no" ? "nb" : targetLang === "lb" ? "de" : targetLang;
        const r = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText.slice(0, 500))}&langpair=en|${tl}&de=speakapp@conference.io`
        );
        if (r.ok) {
          const d = await r.json();
          const result = d.responseData?.translatedText;
          if (result && !result.includes("MYMEMORY WARNING")) {
            resolve({ translated: result, beeped: false });
            return;
          }
        }
      } catch {}
      resolve({ translated: originalText, beeped: false });
    });
  });
  return result;
}

// ─── Auth Context ────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem("sa_token"); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return void setLoading(false);
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => { try { localStorage.removeItem("sa_token"); } catch {} setToken(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, pw) => {
    const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    try { localStorage.setItem("sa_token", d.token); } catch {}
    setToken(d.token); setUser(d.user);
  };

  const register = async (name, email, pw) => {
    const r = await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: pw }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    try { localStorage.setItem("sa_token", d.token); } catch {}
    setToken(d.token); setUser(d.user);
  };

  const logout = () => { try { localStorage.removeItem("sa_token"); } catch {} setToken(null); setUser(null); };

  return <AuthCtx.Provider value={{ user, token, loading, login, register, logout }}>{children}</AuthCtx.Provider>;
}

const useAuth = () => useContext(AuthCtx);

// ─── UI primitives ───────────────────────────────────────────────────────────
const Logo = ({ sm }) => (
  <div className={`flex items-center gap-2.5 select-none ${sm ? "" : ""}`}>
    <div className={`${sm ? "w-8 h-8 text-sm" : "w-9 h-9 text-base"} bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md shadow-blue-600/20`}>S</div>
    <span className={`${sm ? "text-lg" : "text-xl"} font-bold tracking-tight`}>
      Speak<span className="text-blue-600">App</span>
    </span>
  </div>
);

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ${className}`}>{children}</div>
);

const Btn = ({ children, v = "primary", sz = "md", disabled, onClick, className = "", type = "button" }) => {
  const base = "font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer";
  const vs = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 active:scale-[0.98]",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-[0.98]",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 active:scale-[0.98]",
    ghost: "hover:bg-slate-100 text-slate-500 hover:text-slate-700",
    success: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 active:scale-[0.98]",
    outline: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm active:scale-[0.98]",
  };
  const ss = { xs: "px-2.5 py-1.5 text-xs", sm: "px-3 py-2 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3 text-base" };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${vs[v] || vs.primary} ${ss[sz] || ss.md} ${className}`}>{children}</button>;
};

const Field = ({ label, ...p }) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>}
    <input className="w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-xl text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition placeholder:text-slate-400 text-sm" {...p} />
  </div>
);

const QR = ({ value, size = 200 }) => (
  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=FFFFFF&color=0f172a&margin=8`} alt="QR" className="rounded-xl" style={{ width: size, height: size }} />
);

const Status = ({ ok }) => (
  <div className={`fixed top-4 right-4 z-50 px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 shadow-sm ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"}`}>
    {ok ? <Wifi size={13} /> : <WifiOff size={13} />}{ok ? "Connected" : "Connecting..."}
  </div>
);

const CopyBtn = ({ text }) => {
  const [ok, setOk] = useState(false);
  return <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition">{ok ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-slate-400" />}</button>;
};

// ─── LinkedIn Icon (inline SVG to avoid extra dependency) ────────────────────
const LinkedInIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

// ─── Language Selector ───────────────────────────────────────────────────────
function LangSelect({ value, onChange }) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border border-slate-200 text-slate-700 text-xs font-medium rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 appearance-none pr-7 cursor-pointer min-w-[130px]"
        style={{ colorScheme: 'light' }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ─── Beep sound for profanity ────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 1000; // classic TV beep tone
    gain.gain.value = 0.3;
    osc.start();
    // Quick fade out
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 500);
  } catch {}
}

// ─── Text-to-Speech helper ───────────────────────────────────────────────────
const TTS_LANG_MAP = {
  en: "en-US", fr: "fr-FR", de: "de-DE", es: "es-ES", it: "it-IT",
  pt: "pt-PT", nl: "nl-NL", pl: "pl-PL", ro: "ro-RO", sv: "sv-SE",
  da: "da-DK", fi: "fi-FI", no: "nb-NO", el: "el-GR", cs: "cs-CZ",
  hu: "hu-HU", bg: "bg-BG", hr: "hr-HR", sk: "sk-SK", sl: "sl-SI",
  et: "et-EE", lv: "lv-LV", lt: "lt-LT", lb: "de-DE", ru: "ru-RU",
  uk: "uk-UA", tr: "tr-TR",
};

// Queue TTS so sentences don't overlap
let ttsQueue = [];
let ttsSpeaking = false;

function speakText(text, langCode, shouldBeep = false) {
  if (!text && !shouldBeep) return;
  
  if (shouldBeep) {
    // Queue a beep sound instead of speech
    ttsQueue.push({ type: "beep" });
  }
  
  if (text && window.speechSynthesis) {
    // Remove asterisks from text for TTS — strip censored words like f*****, с***, μ*****
    const cleanForTTS = text.replace(/\S\*{2,}\S?/g, "").replace(/\s{2,}/g, " ").trim();
    if (!cleanForTTS) {
      // Entire text was profanity, just queue beep
      if (!shouldBeep) ttsQueue.push({ type: "beep" });
      processNextTTS();
      return;
    }
    
    const utter = new SpeechSynthesisUtterance(cleanForTTS);
    utter.lang = TTS_LANG_MAP[langCode] || langCode;
    utter.rate = 0.9;
    utter.pitch = 1.0;
    utter.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const langPrefix = (TTS_LANG_MAP[langCode] || langCode).split("-")[0];
    const voice = voices.find((v) => v.lang.startsWith(langPrefix) && v.name.toLowerCase().includes("google")) ||
                  voices.find((v) => v.lang.startsWith(langPrefix) && v.name.toLowerCase().includes("microsoft")) ||
                  voices.find((v) => v.lang.startsWith(langPrefix));
    if (voice) utter.voice = voice;

    ttsQueue.push({ type: "speech", utter });
  }
  
  processNextTTS();
}

function processNextTTS() {
  if (ttsSpeaking || ttsQueue.length === 0) return;
  ttsSpeaking = true;
  
  const item = ttsQueue.shift();
  
  if (item.type === "beep") {
    // Play beep via AudioContext
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 1000;
      gain.gain.value = 0.5;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => { ctx.close(); ttsSpeaking = false; processNextTTS(); }, 550);
    } catch {
      ttsSpeaking = false;
      processNextTTS();
    }
  } else if (item.type === "speech" && item.utter) {
    item.utter.onend = () => { ttsSpeaking = false; processNextTTS(); };
    item.utter.onerror = () => { ttsSpeaking = false; processNextTTS(); };
    if (window.speechSynthesis) window.speechSynthesis.speak(item.utter);
    else { ttsSpeaking = false; processNextTTS(); }
  } else {
    ttsSpeaking = false;
    processNextTTS();
  }
}

function stopAllTTS() {
  ttsQueue = [];
  ttsSpeaking = false;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ─── Transcript Panel (shared between Host & Attendee) ───────────────────────
function TranscriptPanel({ transcript, compact = false }) {
  const [lang, setLang] = useState("en");
  const [translated, setTranslated] = useState({});
  const [audioOn, setAudioOn] = useState(false);
  const spokenIds = useRef(new Set());
  const scrollRef = useRef(null);

  // Preload voices
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, translated]);

  // Play beep when profanity is detected
  const lastBeepId = useRef(null);
  useEffect(() => {
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (last.beeped && last.id !== lastBeepId.current) {
      lastBeepId.current = last.id;
      playBeep();
    }
  }, [transcript.length]);

  // Reset when language changes
  useEffect(() => {
    setTranslated({});
    spokenIds.current.clear();
    stopAllTTS();
    setAudioOn(false);
  }, [lang]);

  // Translate new entries when they arrive
  useEffect(() => {
    if (lang === "en") return;

    transcript.forEach((entry) => {
      const key = `${entry.id}-${lang}`;
      if (translated[key] !== undefined) return; // already translated or in progress

      // Mark as in-progress
      setTranslated((prev) => ({ ...prev, [key]: null }));

      if (entry.beeped && entry.originalText) {
        // For beeped entries: translate the ORIGINAL text, then filter the translation
        translateAndFilter(entry.originalText, lang).then(({ translated: result, beeped: translationBeeped }) => {
          setTranslated((prev) => ({ ...prev, [key]: result }));
          
          // Speak if audio is on
          if (audioOn && !spokenIds.current.has(key)) {
            spokenIds.current.add(key);
            // Play beep THEN speak the filtered translation (with stars stripped)
            speakText(result, lang, true); // true = play beep before speaking
          }
        });
      } else {
        // Normal entry: translate normally
        translateText(entry.text, lang).then((result) => {
          setTranslated((prev) => ({ ...prev, [key]: result }));
          
          if (audioOn && !spokenIds.current.has(key)) {
            spokenIds.current.add(key);
            speakText(result, lang, false);
          }
        });
      }
    });
  }, [transcript.length, lang, audioOn]);

  // When audio is toggled on, speak any untranslated entries
  useEffect(() => {
    if (!audioOn) { stopAllTTS(); spokenIds.current.clear(); return; }
    if (lang === "en") return;

    // Speak the most recent entry that hasn't been spoken
    const last = transcript[transcript.length - 1];
    if (last) {
      const key = `${last.id}-${lang}`;
      const t = translated[key];
      if (t && !spokenIds.current.has(key)) {
        spokenIds.current.add(key);
        speakText(t, lang, last.beeped || false);
      }
    }
  }, [audioOn]);

  return (
    <div className={`flex flex-col ${compact ? "" : "p-4"} h-full`}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="font-semibold flex items-center gap-2 text-sm text-slate-700">
          <MessageSquare size={14} className="text-blue-500" />
          Transcript
          {transcript.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-600">LIVE</span>
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {lang !== "en" && (
            <button
              onClick={() => {
                if (!audioOn) {
                  if (window.speechSynthesis) {
                    const u = new SpeechSynthesisUtterance("");
                    u.volume = 0;
                    window.speechSynthesis.speak(u);
                  }
                }
                setAudioOn(!audioOn);
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                audioOn
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-700"
              }`}
            >
              {audioOn ? <Volume2 size={12} /> : <VolumeX size={12} />}
              {audioOn ? "Audio ON" : "Listen"}
            </button>
          )}
          <LangSelect value={lang} onChange={setLang} />
        </div>
      </div>
      {lang !== "en" && (
        <div className="mb-2 text-xs flex items-center gap-1.5 shrink-0 text-blue-500">
          <Globe size={11} /> {LANGUAGES.find((l) => l.code === lang)?.label || lang}
          {audioOn && <span className="ml-1 text-emerald-600">• Audio on</span>}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {!transcript.length ? (
          <p className="text-sm text-slate-400 italic">Transcript appears here when someone speaks...</p>
        ) : transcript.map((e, i) => {
          const key = `${e.id}-${lang}`;
          const t = lang === "en" ? e.text : translated[key];
          return (
            <div key={e.id || i} className={`rounded-xl p-3 ${
              e.beeped
                ? "bg-red-50 border border-red-200"
                : "bg-slate-50 border border-slate-100"
            }`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-blue-600">{e.speaker}</span>
                {e.beeped && <span className="text-[10px] font-medium text-red-500">• filtered</span>}
              </div>
              {t === null || t === undefined ? (
                <p className="mt-1 text-sm text-slate-400 italic animate-pulse">Translating...</p>
              ) : (
                <p className="mt-1 text-sm text-slate-700">{t}</p>
              )}
              {lang !== "en" && t && t !== e.text && (
                <p className="mt-1 text-xs text-slate-400 italic">{e.text}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LinkedIn QR Badge ───────────────────────────────────────────────────────
function LinkedInBadge({ url, size = 50 }) {
  if (!url) return null;
  const fullUrl = url.startsWith("http") ? url : `https://linkedin.com/in/${url}`;
  return (
    <div className="flex items-center gap-2 mt-2">
      <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs">
        <LinkedInIcon size={12} /> Profile
      </a>
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(fullUrl)}&bgcolor=FFFFFF&color=0A66C2&margin=4`}
        alt="LinkedIn QR"
        className="rounded"
        style={{ width: size, height: size }}
      />
    </div>
  );
}

// ─── Host Dashboard ──────────────────────────────────────────────────────────
function HostDash({ room, onEnd }) {
  const [followUp, setFollowUp] = useState(null);
  const [rxns, setRxns] = useState([]);
  const [audioOn, setAudioOn] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [transcribing, setTranscribing] = useState(false);
  const audio = useRef(null);
  const pc = useRef(null);
  const recognition = useRef(null);
  const s = useRef(getSocket());

  const enableAudio = () => {
    if (audio.current) {
      audio.current.muted = false;
      audio.current.play().then(() => {
        setAudioBlocked(false);
        setAudioOn(true);
      }).catch(() => {});
    }
  };

  // ── Host-side Speech Recognition ──
  const startTranscription = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn("SpeechRecognition not supported"); return; }
    if (recognition.current) return; // already running

    const recog = new SR();
    recog.continuous = true;
    recog.interimResults = false; // only send final results to avoid noise
    recog.lang = "en-US";
    recog.maxAlternatives = 1;

    recog.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) {
            s.current.emit("transcript_send", {
              roomId: room.id,
              speaker: room.currentSpeaker?.name || "Speaker",
              text,
            });
            console.log("📝 Transcript:", text);
          }
        }
      }
    };

    recog.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
      if (e.error === "no-speech" || e.error === "audio-capture" || e.error === "network") {
        setTimeout(() => { try { if (recognition.current) recog.start(); } catch {} }, 500);
      }
      if (e.error === "not-allowed") {
        setTranscribing(false);
        alert("Microphone permission needed for live transcription. Please allow mic access and try again.");
      }
    };

    recog.onend = () => {
      // Auto-restart if still supposed to be transcribing
      if (recognition.current === recog) {
        try { recog.start(); } catch {}
      }
    };

    try {
      recog.start();
      recognition.current = recog;
      setTranscribing(true);
      console.log("🎙️ Host transcription started");
    } catch (err) {
      console.error("Failed to start transcription:", err);
    }
  }, [room.id, room.currentSpeaker?.name]);

  const stopTranscription = useCallback(() => {
    if (recognition.current) {
      const recog = recognition.current;
      recognition.current = null;
      try { recog.stop(); } catch {}
      setTranscribing(false);
      console.log("🎙️ Host transcription stopped");
    }
  }, []);

  // Auto-start transcription only AFTER user has clicked the button once (permission granted)
  const hasPermission = useRef(false);
  useEffect(() => {
    if (room.currentSpeaker && hasPermission.current && !recognition.current) {
      startTranscription();
    }
    if (!room.currentSpeaker && recognition.current) {
      stopTranscription();
    }
  }, [room.currentSpeaker?.id]);

  useEffect(() => {
    const sk = s.current;
    sk.on("followup_signal", ({ speakerName }) => setFollowUp(speakerName));
    sk.on("reaction_received", (emoji) => {
      const id = Date.now() + Math.random();
      setRxns((p) => [...p, { id, emoji, left: Math.random() * 80 + 10 }]);
      setTimeout(() => setRxns((p) => p.filter((r) => r.id !== id)), 3500);
    });
    sk.on("transcript_update", (e) => setTranscript((p) => [...p.slice(-49), e]));

    sk.on("webrtc_offer", async ({ from, offer }) => {
      try {
        if (pc.current) { pc.current.close(); pc.current = null; }
        const c = new RTCPeerConnection(ICE);
        pc.current = c;

        // Handle incoming audio track
        c.ontrack = (e) => {
          console.log("🎧 Got audio track from speaker");
          if (audio.current && e.streams[0]) {
            audio.current.srcObject = e.streams[0];
            audio.current.play().then(() => {
              console.log("✅ Audio playing");
              setAudioBlocked(false);
            }).catch((err) => {
              console.warn("Autoplay blocked:", err);
              setAudioBlocked(true);
            });
          }
        };

        c.onicecandidate = (e) => {
          if (e.candidate) sk.emit("webrtc_ice", { roomId: room.id, candidate: e.candidate, to: from });
        };

        c.oniceconnectionstatechange = () => {
          console.log("ICE state:", c.iceConnectionState);
        };

        await c.setRemoteDescription(new RTCSessionDescription(offer));
        const ans = await c.createAnswer();
        await c.setLocalDescription(ans);
        sk.emit("webrtc_answer", { roomId: room.id, answer: ans, to: from });
        console.log("✅ WebRTC answer sent to", from);
      } catch (err) { console.error("WebRTC error:", err); }
    });

    sk.on("webrtc_ice", async ({ candidate }) => {
      try { if (pc.current && candidate) await pc.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    });

    return () => {
      ["followup_signal", "reaction_received", "transcript_update", "webrtc_offer", "webrtc_ice"].forEach((e) => sk.off(e));
      if (pc.current) { pc.current.close(); pc.current = null; }
      if (recognition.current) { const r = recognition.current; recognition.current = null; try { r.stop(); } catch {} }
    };
  }, [room?.id]);

  useEffect(() => {
    if (audio.current) {
      audio.current.muted = !audioOn;
      if (audioOn && audio.current.srcObject) audio.current.play().catch(() => {});
    }
  }, [audioOn]);

  const joinUrl = `${window.location.origin}?room=${room.id}`;

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Floating reactions */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
        {rxns.map((r) => (
          <div key={r.id} className="absolute bottom-0 text-5xl" style={{ left: `${r.left}%`, animation: "floatUp 3.5s ease-out forwards" }}>{r.emoji}</div>
        ))}
      </div>

      {/* Follow-up modal */}
      {followUp && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-sm w-full text-center animate-slide-up shadow-xl">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Hand size={24} className="text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Follow-up Request</h2>
            <p className="text-slate-500 text-sm mb-5"><span className="text-blue-600 font-semibold">{followUp}</span> wants to continue</p>
            <div className="flex gap-3">
              <Btn v="danger" onClick={() => { s.current.emit("followup_response", { roomId: room.id, approved: false }); setFollowUp(null); }} className="flex-1"><X size={16} /> Decline</Btn>
              <Btn onClick={() => { s.current.emit("followup_response", { roomId: room.id, approved: true }); setFollowUp(null); }} className="flex-1"><Check size={16} /> Allow</Btn>
            </div>
          </Card>
        </div>
      )}

      <audio ref={audio} autoPlay playsInline />

      {/* Audio blocked banner */}
      {audioBlocked && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2.5 flex items-center justify-center gap-4 shrink-0">
          <span className="font-medium text-sm">🔇 Browser blocked audio playback</span>
          <button onClick={enableAudio} className="bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-amber-700 transition">Enable Audio</button>
        </div>
      )}

      {/* Transcription prompt - shows when speaker is live but transcription is off */}
      {room.currentSpeaker && !transcribing && (
        <div className="bg-blue-50 border-b border-blue-200 text-blue-800 px-4 py-2.5 flex items-center justify-center gap-4 shrink-0">
          <span className="font-medium text-sm">🎙️ Live transcription is off</span>
          <button onClick={() => { hasPermission.current = true; startTranscription(); }} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-blue-700 transition">Enable Transcript</button>
        </div>
      )}

      {/* Header — light white */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <Logo sm />
          <div className="h-5 w-px bg-slate-200" />
          <span className="bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg font-mono text-blue-600 text-xs font-semibold tracking-wider">{room.id}</span>
          <span className="text-slate-400 text-xs hidden md:inline">{room.attendeeCount || 0} joined</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Btn v={audioOn ? "primary" : "outline"} sz="xs" onClick={() => {
            if (!audioOn) { enableAudio(); } else { setAudioOn(false); if (audio.current) audio.current.muted = true; }
          }}>
            {audioOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </Btn>
          <Btn v={transcribing ? "success" : "outline"} sz="xs" onClick={() => {
            if (transcribing) { stopTranscription(); } else { hasPermission.current = true; startTranscription(); }
          }}>
            <MessageSquare size={14} />
            {transcribing ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> <span className="hidden sm:inline">Live</span></> : <span className="hidden sm:inline">Transcript</span>}
          </Btn>
          {room.currentSpeaker && (
            <>
              <Btn v="outline" sz="xs" onClick={() => s.current.emit("end_speech", room.id)}>
                <Square size={14} /> End Turn
              </Btn>
              <Btn v="danger" sz="xs" onClick={() => s.current.emit("remove_speaker", room.id)}>
                <UserMinus size={14} />
              </Btn>
            </>
          )}
          <Btn v="danger" sz="xs" onClick={() => { if (confirm("End event for everyone?")) { s.current.emit("end_event", room.id); onEnd(); } }}>
            <Power size={14} />
          </Btn>
        </div>
      </header>

      {/* Body — 3 columns, fills viewport, NO page scroll */}
      <div className="flex-1 flex gap-3 p-3 min-h-0">

        {/* LEFT: Queue */}
        <div className="w-72 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden hidden lg:flex">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
            <Users size={15} className="text-blue-600" />
            <h2 className="font-semibold text-sm text-slate-800">Queue</h2>
            <span className="ml-auto bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">{room.queue?.length || 0}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
            {(!room.queue?.length) ? (
              <p className="text-slate-400 text-center py-8 text-sm">No one in queue</p>
            ) : room.queue.map((p, i) => (
              <div key={p.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">{i + 1}</div>
                    <div className="min-w-0">
                      <span className="font-semibold text-sm block truncate text-slate-800">{p.name}</span>
                      {p.linkedin && <LinkedInBadge url={p.linkedin} size={32} />}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Btn sz="xs" disabled={!!room.currentSpeaker} onClick={() => s.current.emit("grant_floor", { roomId: room.id, userId: p.id })}>
                      <Play size={11} />
                    </Btn>
                    <Btn v="danger" sz="xs" onClick={() => s.current.emit("remove_from_queue", { roomId: room.id, userId: p.id })}>
                      <X size={11} />
                    </Btn>
                  </div>
                </div>
                {p.question && (
                  <div className="mt-2 bg-white p-2 rounded-lg text-xs text-slate-600 border-l-2 border-blue-500">"{p.question}"</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: Stage (speaker + QR) */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-6 min-w-0">
          {room.currentSpeaker ? (
            <div className="text-center w-full">
              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3 live-ring shadow-lg shadow-emerald-500/20">
                <Mic size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{room.currentSpeaker.name}</h2>
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-emerald-600 font-semibold text-sm">LIVE</p>
              </div>
              {room.currentSpeaker.linkedin && (
                <div className="flex justify-center mb-3"><LinkedInBadge url={room.currentSpeaker.linkedin} size={40} /></div>
              )}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-3">
                <div className="border border-slate-200 p-1.5 rounded-lg shadow-sm"><QR value={joinUrl} size={56} /></div>
                <div className="text-left">
                  <p className="text-slate-400 text-xs mb-0.5">Scan to join</p>
                  <div className="flex items-center gap-1">
                    <code className="text-blue-600 font-mono text-base font-bold">{room.id}</code>
                    <CopyBtn text={joinUrl} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="border border-slate-200 p-3 rounded-2xl mb-4 inline-block shadow-sm"><QR value={joinUrl} size={160} /></div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Scan to Join</h2>
              <div className="flex items-center justify-center gap-2 mb-2">
                <code className="text-blue-600 font-mono text-2xl font-bold">{room.id}</code>
                <CopyBtn text={room.id} />
              </div>
              <p className="text-slate-400 text-xs">or share link:</p>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <code className="text-slate-400 text-xs break-all max-w-[220px]">{joinUrl}</code>
                <CopyBtn text={joinUrl} />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Transcript — scrolls internally, never pushes page */}
        <div className="w-[420px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden hidden lg:flex">
          <TranscriptPanel transcript={transcript} compact />
        </div>
      </div>

      {/* Mobile fallback: stacked layout for small screens */}
      <div className="lg:hidden flex-1 overflow-auto p-3 space-y-3">
        <Card>
          {room.currentSpeaker ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2 live-ring">
                <Mic size={28} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{room.currentSpeaker.name}</h2>
              <div className="flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-emerald-600 text-xs font-semibold">LIVE</span></div>
            </div>
          ) : (
            <div className="text-center">
              <div className="border border-slate-200 p-2 rounded-xl mb-3 inline-block"><QR value={joinUrl} size={100} /></div>
              <p className="text-sm font-semibold text-slate-800">Room: <code className="text-blue-600">{room.id}</code> <CopyBtn text={joinUrl} /></p>
            </div>
          )}
        </Card>
        <TranscriptPanel transcript={transcript} compact />
      </div>

      <style>{`@keyframes floatUp{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-400px) scale(.5)}}`}</style>
    </div>
  );
}

// ─── Attendee View ───────────────────────────────────────────────────────────
function Attendee({ room, user, onExit }) {
  const [q, setQ] = useState("");
  const [fuStatus, setFuStatus] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [canRejoin, setCanRejoin] = useState(false);
  const pc = useRef(null);
  const stream = useRef(null);
  const s = useRef(getSocket());

  const myId = s.current?.id;
  const inQueue = room.queue?.some((x) => x.id === myId);
  const qPos = (room.queue?.findIndex((x) => x.id === myId) ?? -1) + 1;
  const speaking = room.currentSpeaker?.id === myId;

  const startRTC = useCallback(async () => {
    try {
      console.log("🎤 Requesting microphone...");
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: 48000,
          channelCount: 1,
          latency: { ideal: 0 },
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googEchoCancellation2: true,
          googDAEchoCancellation: true,
        }
      });
      console.log("✅ Microphone granted");
      stream.current = ms;

      // ── Audio processing chain to eliminate echo ──
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      window._speakAppAudioCtx = audioCtx;
      const source = audioCtx.createMediaStreamSource(ms);

      // 1. High-pass filter - cuts low-frequency room rumble & speaker bleed
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 150; // Cut below 150Hz (speaker echo is bassy)
      highpass.Q.value = 0.7;

      // 2. Noise gate via dynamics compressor
      //    Aggressive threshold = only lets through loud/close speech
      //    Echo from speakers is quieter than direct speech into phone mic
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -35;  // Only pass audio above this level
      compressor.knee.value = 5;         // Hard knee = sharp cutoff
      compressor.ratio.value = 20;       // Heavy compression below threshold
      compressor.attack.value = 0.003;   // Fast attack
      compressor.release.value = 0.1;    // Quick release so speech sounds natural

      // 3. Gain boost to compensate for compression
      const makeupGain = audioCtx.createGain();
      makeupGain.gain.value = 1.5;

      // 4. Second high-pass to clean up any remaining artifacts
      const highpass2 = audioCtx.createBiquadFilter();
      highpass2.type = "highpass";
      highpass2.frequency.value = 80;

      // Connect chain: mic -> highpass -> compressor -> gain -> highpass2 -> output
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(compressor);
      compressor.connect(makeupGain);
      makeupGain.connect(highpass2);
      highpass2.connect(dest);

      const processedStream = dest.stream;

      const c = new RTCPeerConnection(ICE);
      pc.current = c;
      processedStream.getTracks().forEach((t) => c.addTrack(t, processedStream));

      c.onicecandidate = (e) => {
        if (e.candidate) s.current.emit("webrtc_ice", { roomId: room.id, candidate: e.candidate });
      };

      c.oniceconnectionstatechange = () => {
        console.log("ICE state:", c.iceConnectionState);
        if (c.iceConnectionState === "connected") console.log("✅ WebRTC connected - audio streaming");
        if (c.iceConnectionState === "failed") console.error("❌ WebRTC connection failed");
      };

      const offer = await c.createOffer();
      await c.setLocalDescription(offer);
      s.current.emit("webrtc_offer", { roomId: room.id, offer });
      console.log("📡 WebRTC offer sent");
    } catch (err) {
      console.error("Microphone error:", err);
      alert("Microphone access required. Please allow microphone permission and try again.");
    }
  }, [room.id]);

  const stopRTC = useCallback(() => {
    if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; }
    if (pc.current) { pc.current.close(); pc.current = null; }
    // Close any AudioContext created during startRTC
    try { if (window._speakAppAudioCtx) { window._speakAppAudioCtx.close(); window._speakAppAudioCtx = null; } } catch {}
  }, []);

  useEffect(() => {
    const sk = s.current;
    let isSpeaking = false;

    sk.on("floor_granted", () => {
      isSpeaking = true;
      setCanRejoin(false);
      startRTC();
    });
    sk.on("followup_approved", () => setFuStatus("approved"));
    sk.on("followup_declined", () => {
      isSpeaking = false;
      setFuStatus("declined");
      stopRTC();
      // Don't clear fuStatus immediately - let room_data update show queue position
      // The server already puts the speaker back in queue, so room_data will show inQueue=true
      setTimeout(() => setFuStatus(null), 3000);
    });
    sk.on("speech_ended", () => {
      setFuStatus(null);
      if (!isSpeaking) {
        stopRTC();
      }
    });
    sk.on("speech_done_can_rejoin", () => {
      isSpeaking = false;
      setCanRejoin(true);
      stopRTC();
    });
    sk.on("removed_from_speaking", () => {
      isSpeaking = false;
      setFuStatus(null);
      setCanRejoin(false);
      stopRTC();
    });
    sk.on("removed_from_queue", () => {});
    sk.on("transcript_update", (e) => setTranscript((p) => [...p.slice(-29), e]));
    sk.on("webrtc_answer", async ({ answer }) => {
      try {
        if (pc.current) {
          await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
          console.log("✅ WebRTC answer received, connection establishing...");
        }
      } catch (err) { console.error("WebRTC answer error:", err); }
    });
    sk.on("webrtc_ice", async ({ candidate }) => {
      try { if (pc.current && candidate) await pc.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    });
    return () => {
      ["floor_granted", "followup_approved", "followup_declined", "speech_ended", "speech_done_can_rejoin", "removed_from_speaking", "removed_from_queue", "transcript_update", "webrtc_answer", "webrtc_ice"].forEach((e) => sk.off(e));
      stopRTC();
    };
  }, [startRTC, stopRTC]);

  // ── Speaking screen ──
  if (speaking) {
    return (
      <div className="min-h-screen bg-emerald-600 text-white flex flex-col items-center justify-center p-6">
        <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center mb-6 live-ring shadow-xl">
          <Mic size={52} className="text-emerald-600" />
        </div>
        <h2 className="text-3xl font-extrabold mb-2 text-center">You're Live</h2>
        <p className="text-emerald-100 mb-8 text-center">Your voice is streaming to the room</p>
        {fuStatus === "pending" && <div className="bg-white/15 border border-white/20 rounded-xl p-4 mb-4"><p className="text-emerald-100 text-sm">Waiting for host approval...</p></div>}
        {fuStatus === "approved" && <div className="bg-white/20 border border-white/25 rounded-xl p-4 mb-4"><p className="text-white text-sm font-semibold">✓ You may continue</p></div>}
        {fuStatus === "declined" && <div className="bg-red-500/25 border border-red-400/30 rounded-xl p-4 mb-4"><p className="text-red-100 text-sm">Follow-up declined</p></div>}
        <div className="space-y-3 w-full max-w-xs">
          {fuStatus !== "pending" && (
            <Btn v="secondary" sz="lg" onClick={() => { s.current.emit("signal_followup", room.id); setFuStatus("pending"); }} className="w-full !bg-white/20 hover:!bg-white/30 !text-white border-0">
              <Hand size={20} /> Follow-up
            </Btn>
          )}
          <Btn v="secondary" sz="lg" onClick={() => { s.current.emit("end_speech", room.id); stopRTC(); }} className="w-full !bg-white !text-emerald-700 hover:!bg-emerald-50">
            <Square size={20} /> Done Speaking
          </Btn>
        </div>
      </div>
    );
  }

  // ── Post-speech: offer to rejoin queue ──
  if (canRejoin && !inQueue) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Card className="max-w-sm w-full text-center animate-slide-up">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Hand size={28} className="text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Your turn ended</h2>
          <p className="text-slate-500 text-sm mb-6">Would you like to ask a follow-up?</p>
          <div className="space-y-2.5">
            <Btn sz="lg" onClick={() => { s.current.emit("rejoin_queue", { roomId: room.id, user }); setCanRejoin(false); }} className="w-full">
              <Hand size={18} /> Rejoin Queue
            </Btn>
            <Btn v="secondary" sz="lg" onClick={() => setCanRejoin(false)} className="w-full">
              Stay as Audience
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  // ── Main attendee view ──
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-bold text-base text-slate-900">{room.name}</h1>
          <p className="text-xs text-slate-500">
            {room.currentSpeaker ? (
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {room.currentSpeaker.name} speaking</span>
            ) : "Waiting for speaker"}
          </p>
        </div>
        <Btn v="ghost" sz="sm" onClick={onExit} className="!text-slate-400">Exit</Btn>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {inQueue ? (
          /* ── In Queue View ── */
          <div className="max-w-md mx-auto">
            <Card className="text-center mb-4">
              <p className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-2">Your position</p>
              <div className="text-7xl font-extrabold text-blue-600 mb-1">{qPos}</div>
              <p className="text-slate-500 text-sm">
                {qPos === 1 ? "You're next!" : `${qPos - 1} ${qPos - 1 === 1 ? "person" : "people"} ahead`}
              </p>
              {room.queue && <p className="text-xs text-slate-400 mt-2">{room.queue.length} total in queue</p>}
            </Card>

            <Card className="mb-4">
              <label className="text-sm font-medium text-slate-600 mb-2 block">Your question (optional)</label>
              <textarea value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-slate-50 rounded-xl p-3 text-slate-900 text-sm outline-none border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-none" rows={3} placeholder="Type your question..." />
              <Btn sz="sm" onClick={() => { if (q.trim()) { s.current.emit("submit_question", { roomId: room.id, text: q }); setQ(""); } }} className="w-full mt-3">
                <Send size={14} /> Submit Question
              </Btn>
            </Card>

            <div className="text-center mb-4">
              <Btn v="ghost" onClick={() => s.current.emit("leave_queue", room.id)} className="!text-red-500 hover:!text-red-600 text-sm">Leave Queue</Btn>
            </div>

            <TranscriptPanel transcript={transcript} compact />
          </div>
        ) : (
          /* ── Default Attendee View ── */
          <div className="max-w-md mx-auto">
            <Card className="mb-4 text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-blue-600">{user.name?.charAt(0)?.toUpperCase() || "?"}</span>
              </div>
              <h3 className="font-bold text-lg text-slate-900">{user.name}</h3>
              {user.linkedin && (
                <a
                  href={user.linkedin.startsWith("http") ? user.linkedin : `https://linkedin.com/in/${user.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 flex items-center justify-center gap-1 text-sm mt-1.5"
                >
                  <LinkedInIcon size={14} /> LinkedIn Profile
                </a>
              )}
            </Card>

            <Btn sz="lg" onClick={() => s.current.emit("join_queue", { roomId: room.id, user })} className="w-full mb-6 py-4 text-base shadow-md shadow-blue-600/15">
              <Mic size={20} /> Raise Hand to Speak
            </Btn>

            <div className="text-center mb-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Reactions</p>
              <div className="flex justify-center gap-2 flex-wrap">
                {["🔥", "❤️", "👍", "👏", "🎉", "💡"].map((e) => (
                  <button key={e} onClick={() => s.current.emit("send_reaction", { roomId: room.id, emoji: e })} className="w-11 h-11 bg-white border border-slate-200 rounded-xl text-xl hover:bg-slate-50 active:scale-90 transition shadow-sm">
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <TranscriptPanel transcript={transcript} compact />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Auth pages ──────────────────────────────────────────────────────────────
function Login({ onBack, onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setErr(""); setBusy(true); try { await login(email, pw); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full animate-slide-up">
        <button onClick={onBack} className="mb-8 text-slate-400 hover:text-slate-700 flex items-center gap-2 text-sm font-medium"><ArrowLeft size={16} /> Back</button>
        <Logo />
        <h2 className="text-2xl font-bold text-slate-900 mt-6 mb-1">Welcome back</h2>
        <p className="text-slate-500 mb-6 text-sm">Sign in to manage your events</p>
        {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-600 text-sm flex items-center gap-2"><AlertCircle size={16} /> {err}</div>}
        <form onSubmit={go} className="space-y-4">
          <Field label="Email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field label="Password" type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} required />
          <Btn type="submit" disabled={busy} className="w-full">{busy ? "Signing in..." : "Sign In"}</Btn>
        </form>
        <p className="text-center text-slate-400 mt-6 text-sm">No account? <button onClick={onSwitch} className="text-blue-600 hover:underline font-medium">Create one</button></p>
        <div className="mt-6 pt-6 border-t border-slate-200"><p className="text-center text-slate-400 text-xs">Demo: <code className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">admin@speakapp.io</code> / <code className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">admin123</code></p></div>
      </div>
    </div>
  );
}

function Register({ onBack, onSwitch }) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setErr(""); setBusy(true); try { await register(name, email, pw); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full animate-slide-up">
        <button onClick={onBack} className="mb-8 text-slate-400 hover:text-slate-700 flex items-center gap-2 text-sm font-medium"><ArrowLeft size={16} /> Back</button>
        <Logo />
        <h2 className="text-2xl font-bold text-slate-900 mt-6 mb-1">Create account</h2>
        <p className="text-slate-500 mb-6 text-sm">Start hosting events in minutes</p>
        {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-600 text-sm flex items-center gap-2"><AlertCircle size={16} /> {err}</div>}
        <form onSubmit={go} className="space-y-4">
          <Field label="Full name" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} required />
          <Field label="Email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field label="Password" type="password" placeholder="Min 6 characters" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
          <Btn type="submit" disabled={busy} className="w-full">{busy ? "Creating..." : "Create Account"}</Btn>
        </form>
        <p className="text-center text-slate-400 mt-6 text-sm">Already have an account? <button onClick={onSwitch} className="text-blue-600 hover:underline font-medium">Sign in</button></p>
      </div>
    </div>
  );
}

function Admin({ onBack }) {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch(`${API}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats).catch(() => {});
  }, [token]);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
        <Logo sm />
        <Btn v="ghost" sz="sm" onClick={onBack}><ArrowLeft size={16} /> Back</Btn>
      </header>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>
        <div className="grid grid-cols-3 gap-4">
          {[
            { i: Users, l: "Total Users", v: stats?.totalUsers || 0, color: "blue" },
            { i: Monitor, l: "Events Created", v: stats?.totalEvents || 0, color: "violet" },
            { i: TrendingUp, l: "Active Now", v: stats?.activeEvents || 0, color: "emerald" },
          ].map((x, i) => (
            <Card key={i}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${x.color === "blue" ? "bg-blue-50 text-blue-600" : x.color === "violet" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"}`}>
                <x.i size={20} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{x.v}</div>
              <div className="text-sm text-slate-500 mt-1">{x.l}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Setup pages ─────────────────────────────────────────────────────────────
function HostSetup({ onBack, onCreate, ok }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Status ok={ok} />
      <div className="max-w-sm w-full animate-slide-up">
        <button onClick={onBack} className="mb-8 text-slate-400 hover:text-slate-700 flex items-center gap-2 text-sm font-medium"><ArrowLeft size={16} /> Back</button>
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-5"><Monitor size={24} className="text-blue-600" /></div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Create Event</h2>
        <p className="text-slate-500 mb-6 text-sm">Set up your Q&A session</p>
        <div className="space-y-4">
          <Field label="Event name" placeholder="e.g. Tech Conference Q&A" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Your name" placeholder="e.g. Jane Smith" value={host} onChange={(e) => setHost(e.target.value)} />
          <Btn onClick={() => { if (!name.trim()) return alert("Enter event name"); onCreate({ name: name.trim(), hostName: host.trim() || "Host" }); }} disabled={!ok} className="w-full" sz="lg">
            <Play size={18} /> Launch Event
          </Btn>
          {!ok && <p className="text-amber-600 text-sm text-center flex items-center justify-center gap-1"><WifiOff size={14} /> Connecting to server...</p>}
        </div>
      </div>
    </div>
  );
}

function JoinPage({ onBack, onJoin, ok }) {
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get("room") || "");
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [anon, setAnon] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Status ok={ok} />
      <div className="max-w-sm w-full animate-slide-up">
        <button onClick={onBack} className="mb-8 text-slate-400 hover:text-slate-700 flex items-center gap-2 text-sm font-medium"><ArrowLeft size={16} /> Back</button>
        <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center mb-5"><Smartphone size={24} className="text-violet-600" /></div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Join Event</h2>
        <p className="text-slate-500 mb-6 text-sm">Enter the room code to participate</p>
        <div className="space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full bg-slate-50 border-2 border-slate-200 p-4 text-center text-3xl font-mono uppercase text-slate-900 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 tracking-[0.3em]"
            placeholder="CODE"
            maxLength={4}
          />
          {!anon && (
            <>
              <Field placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="relative">
                <Field
                  placeholder="LinkedIn URL (optional)"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                />
                <LinkedInIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
              </div>
            </>
          )}
          <label className="flex items-center gap-3 text-sm text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            Join anonymously
          </label>
          <Btn onClick={() => {
            if (!code.trim()) return alert("Enter code");
            const n = anon ? `Guest_${Math.random().toString(36).slice(2, 6)}` : name.trim();
            if (!anon && !n) return alert("Enter name");
            const li = anon ? "" : linkedin.trim();
            onJoin(code.trim(), { name: n, linkedin: li });
          }} disabled={!ok} className="w-full" sz="lg">
            Enter Room
          </Btn>
          {!ok && <p className="text-amber-600 text-sm text-center flex items-center justify-center gap-1"><WifiOff size={14} /> Connecting to server...</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Landing ─────────────────────────────────────────────────────────────────
function Landing({ ok, nav }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Status ok={ok} />
      {/* Nav */}
      <nav className="w-full px-6 py-4 flex justify-between items-center max-w-6xl mx-auto">
        <Logo />
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {["admin", "superadmin"].includes(user.role) && <Btn v="ghost" sz="sm" onClick={() => nav("admin")}><BarChart3 size={16} /> Admin</Btn>}
              <span className="text-slate-500 text-sm hidden sm:inline">{user.name}</span>
              <Btn v="ghost" sz="sm" onClick={logout}><LogOut size={16} /></Btn>
            </>
          ) : (
            <Btn v="ghost" sz="sm" onClick={() => nav("login")}><LogIn size={16} /> Sign in</Btn>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="animate-slide-up text-center max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium mb-8">
            <Mic size={14} />
            Real-time conference Q&A platform
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-5 leading-[1.1]">
            Every voice<br />
            <span className="text-blue-600">deserves to be heard</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-500 mb-10 max-w-lg mx-auto leading-relaxed">
            Stream audio directly from phones to venue speakers. No app downloads, no microphone queues. Just scan & speak.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Btn sz="lg" onClick={() => nav("host")} className="px-8 py-3.5 text-base shadow-md shadow-blue-600/20">
              <Monitor size={18} /> Host an Event
            </Btn>
            <Btn v="outline" sz="lg" onClick={() => nav("join")} className="px-8 py-3.5 text-base">
              <Smartphone size={18} /> Join Event
            </Btn>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-slate-400">
          <div className="flex items-center gap-2"><Globe size={16} className="text-blue-500" /> 27 languages</div>
          <div className="flex items-center gap-2"><Wifi size={16} className="text-emerald-500" /> WebRTC audio</div>
          <div className="flex items-center gap-2"><Users size={16} className="text-violet-500" /> No app needed</div>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("landing");
  const [room, setRoom] = useState(null);
  const [attUser, setAttUser] = useState({ name: "", linkedin: "" });
  const [ok, setOk] = useState(false);
  const sk = useRef(null);

  useEffect(() => {
    const s = getSocket();
    sk.current = s;
    s.on("connect", () => setOk(true));
    s.on("disconnect", () => setOk(false));
    s.on("event_created", (d) => { setRoom(d); setView("dash"); });
    s.on("room_data", (d) => setRoom((p) => ({ ...p, ...d })));
    s.on("event_ended", ({ reason }) => { alert(`Event ended${reason ? ": " + reason : ""}`); setView("landing"); setRoom(null); });
    s.on("error", (m) => alert(m));
    setOk(s.connected);
    if (new URLSearchParams(window.location.search).get("room")) setView("join");
    return () => { s.off("connect"); s.off("disconnect"); s.off("event_created"); s.off("room_data"); s.off("event_ended"); s.off("error"); };
  }, []);

  const create = (d) => { if (!ok) return alert("Connecting..."); sk.current.emit("create_event", d); };
  const join = (code, u) => { if (!ok) return alert("Connecting..."); setAttUser(u); sk.current.emit("join_room_attendee", { roomId: code.toUpperCase(), user: u }); setView("att"); };
  const nav = (v) => setView(v);
  const home = () => nav("landing");

  return (
    <AuthProvider>
      <Routes view={view} room={room} attUser={attUser} ok={ok} nav={nav} home={home} create={create} join={join} />
    </AuthProvider>
  );
}

function Routes({ view, room, attUser, ok, nav, home, create, join }) {
  const { user } = useAuth();
  switch (view) {
    case "landing": return <Landing ok={ok} nav={nav} />;
    case "host": return <HostSetup onBack={home} onCreate={create} ok={ok} />;
    case "dash": return room ? <HostDash room={room} onEnd={home} /> : <Landing ok={ok} nav={nav} />;
    case "join": return <JoinPage onBack={home} onJoin={join} ok={ok} />;
    case "att": return room ? <Attendee room={room} user={attUser} onExit={home} /> : <Landing ok={ok} nav={nav} />;
    case "login": return <Login onBack={home} onSwitch={() => nav("register")} />;
    case "register": return <Register onBack={home} onSwitch={() => nav("login")} />;
    case "admin": return user && ["admin", "superadmin"].includes(user.role) ? <Admin onBack={home} /> : <Login onBack={home} onSwitch={() => nav("register")} />;
    default: return <Landing ok={ok} nav={nav} />;
  }
}
