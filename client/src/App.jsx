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
const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Free TURN servers for NAT traversal
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// ─── Translation languages ───────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "hi", label: "हिन्दी" },
  { code: "zh-CN", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "it", label: "Italiano" },
  { code: "ru", label: "Русский" },
];

async function translateText(text, targetLang) {
  if (!text || targetLang === "en") return text;
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|${targetLang}`);
    const d = await r.json();
    if (d.responseData?.translatedText && !d.responseData.translatedText.includes("MYMEMORY WARNING")) {
      return d.responseData.translatedText;
    }
    return text;
  } catch { return text; }
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
  <div className={`flex items-center gap-2 font-black select-none ${sm ? "text-xl" : "text-2xl"}`}>
    <div className="bg-cyan-500 text-black px-2 py-1 rounded-lg">S</div>
    <span className="text-white">Speak<span className="text-cyan-500">App</span></span>
  </div>
);

const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-900/90 backdrop-blur border border-white/10 rounded-2xl p-6 shadow-xl ${className}`}>{children}</div>
);

const Btn = ({ children, v = "primary", sz = "md", disabled, onClick, className = "", type = "button" }) => {
  const base = "font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 select-none";
  const vs = {
    primary: "bg-cyan-500 hover:bg-cyan-400 text-black active:scale-95",
    secondary: "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 active:scale-95",
    danger: "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 active:scale-95",
    ghost: "hover:bg-white/10 text-slate-400 hover:text-white",
    success: "bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/50 active:scale-95",
  };
  const ss = { sm: "px-3 py-2 text-sm", md: "px-4 py-3", lg: "px-6 py-4 text-lg", xs: "px-2 py-1 text-xs" };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${vs[v] || vs.primary} ${ss[sz] || ss.md} ${className}`}>{children}</button>;
};

const Field = ({ label, ...p }) => (
  <div className="w-full">
    {label && <label className="block text-sm text-slate-400 mb-1.5">{label}</label>}
    <input className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-cyan-500 transition" {...p} />
  </div>
);

const QR = ({ value, size = 200 }) => (
  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=FFFFFF&color=000000&margin=10`} alt="QR" className="rounded-xl shadow-lg" style={{ width: size, height: size }} />
);

const Status = ({ ok }) => (
  <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 ${ok ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"}`}>
    {ok ? <Wifi size={14} /> : <WifiOff size={14} />}{ok ? "CONNECTED" : "CONNECTING..."}
  </div>
);

const CopyBtn = ({ text }) => {
  const [ok, setOk] = useState(false);
  return <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }} className="p-2 hover:bg-white/10 rounded-lg">{ok ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-slate-400" />}</button>;
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
      <Globe size={14} className="text-cyan-400 mr-1" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1 outline-none focus:border-cyan-500 appearance-none pr-6 cursor-pointer"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-1 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ─── Transcript Panel (shared between Host & Attendee) ───────────────────────
function TranscriptPanel({ transcript, compact = false }) {
  const [lang, setLang] = useState("en");
  const [translated, setTranslated] = useState({});
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, translated]);

  useEffect(() => {
    if (lang === "en") { setTranslated({}); return; }
    let cancelled = false;
    const pending = transcript.slice(-20); // only translate recent
    pending.forEach((e, i) => {
      const key = `${transcript.length - pending.length + i}-${lang}`;
      if (!translated[key]) {
        translateText(e.text, lang).then((t) => {
          if (!cancelled) setTranslated((p) => ({ ...p, [key]: t }));
        });
      }
    });
    return () => { cancelled = true; };
  }, [lang, transcript.length]);

  const getText = (e, i) => {
    if (lang === "en") return e.text;
    return translated[`${i}-${lang}`] || e.text;
  };

  return (
    <div className={`flex flex-col ${compact ? "" : "bg-slate-900/50 rounded-2xl border border-slate-800 p-4 h-full"}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-bold flex items-center gap-2 ${compact ? "text-sm" : ""}`}>
          <MessageSquare size={compact ? 14 : 16} className="text-cyan-400" />Transcript
        </h3>
        <LangSelect value={lang} onChange={setLang} />
      </div>
      <div ref={scrollRef} className={`flex-1 overflow-y-auto space-y-2 ${compact ? "max-h-40" : "max-h-[400px]"}`}>
        {!transcript.length ? (
          <p className={`text-slate-500 ${compact ? "text-xs" : "text-sm"} italic`}>Waiting...</p>
        ) : transcript.map((e, i) => (
          <div key={i} className={`bg-black/30 rounded-lg ${compact ? "p-2" : "p-3"}`}>
            <span className={`text-cyan-400 font-bold ${compact ? "text-xs" : "text-xs"}`}>{e.speaker}</span>
            <p className={`mt-1 ${compact ? "text-xs" : "text-sm"}`}>{getText(e, i)}</p>
          </div>
        ))}
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
  const [audioOn, setAudioOn] = useState(true); // Auto-enable audio
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const audio = useRef(null);
  const pc = useRef(null);
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Floating reactions */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
        {rxns.map((r) => (
          <div key={r.id} className="absolute bottom-0 text-5xl" style={{ left: `${r.left}%`, animation: "floatUp 3.5s ease-out forwards" }}>{r.emoji}</div>
        ))}
      </div>

      {/* Follow-up modal */}
      {followUp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full text-center">
            <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Hand size={32} className="text-black" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Follow-up Request</h2>
            <p className="text-slate-400 mb-6"><span className="text-cyan-400 font-bold">{followUp}</span> wants to continue</p>
            <div className="flex gap-4">
              <Btn v="danger" onClick={() => { s.current.emit("followup_response", { roomId: room.id, approved: false }); setFollowUp(null); }} className="flex-1"><X size={20} /> Decline</Btn>
              <Btn onClick={() => { s.current.emit("followup_response", { roomId: room.id, approved: true }); setFollowUp(null); }} className="flex-1"><Check size={20} /> Allow</Btn>
            </div>
          </Card>
        </div>
      )}

      <audio ref={audio} autoPlay playsInline />

      {/* Audio blocked banner */}
      {audioBlocked && (
        <div className="fixed top-16 left-0 right-0 z-50 bg-yellow-500 text-black px-4 py-3 flex items-center justify-center gap-4">
          <span className="font-bold">🔇 Browser blocked audio playback</span>
          <button onClick={enableAudio} className="bg-black text-yellow-500 px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-gray-900">
            🔊 Click to Enable Audio
          </button>
        </div>
      )}

      {/* Header */}
      <header className="h-16 bg-slate-900/80 backdrop-blur border-b border-white/10 flex items-center justify-between px-4 md:px-6 shrink-0">
        <div className="flex items-center gap-2 md:gap-4">
          <Logo sm />
          <span className="bg-white/10 px-3 py-1 rounded-lg font-mono text-cyan-400 text-sm">{room.id}</span>
          <span className="text-slate-500 text-sm hidden md:inline">({room.attendeeCount || 0} joined)</span>
        </div>
        <div className="flex items-center gap-2">
          <Btn v={audioOn ? "primary" : "secondary"} sz="sm" onClick={() => {
            if (!audioOn) { enableAudio(); } else { setAudioOn(false); if (audio.current) audio.current.muted = true; }
          }}>
            {audioOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </Btn>
          {room.currentSpeaker && (
            <>
              <Btn v="secondary" sz="sm" onClick={() => s.current.emit("end_speech", room.id)} title="End speech gracefully">
                <Square size={16} /> End Turn
              </Btn>
              <Btn v="danger" sz="sm" onClick={() => s.current.emit("remove_speaker", room.id)} title="Remove speaker immediately">
                <UserMinus size={16} />
              </Btn>
            </>
          )}
          <Btn v="danger" sz="sm" onClick={() => { if (confirm("End event for everyone?")) { s.current.emit("end_event", room.id); onEnd(); } }}>
            <Power size={16} />
          </Btn>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-auto">
        {/* Queue - with Grant & Remove buttons */}
        <div className="lg:col-span-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/5">
            <h2 className="font-bold flex items-center gap-2">
              <Users size={18} className="text-cyan-400" />Queue ({room.queue?.length || 0})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {(!room.queue?.length) ? (
              <p className="text-slate-500 text-center py-8">No one in queue</p>
            ) : room.queue.map((p, i) => (
              <div key={p.id} className="bg-black/40 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center text-cyan-400 font-bold shrink-0">{i + 1}</div>
                    <div className="min-w-0">
                      <span className="font-bold block truncate">{p.name}</span>
                      {p.linkedin && <LinkedInBadge url={p.linkedin} size={40} />}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Btn sz="sm" disabled={!!room.currentSpeaker} onClick={() => s.current.emit("grant_floor", { roomId: room.id, userId: p.id })}>
                      <Play size={14} /> Grant
                    </Btn>
                    <Btn v="danger" sz="sm" onClick={() => s.current.emit("remove_from_queue", { roomId: room.id, userId: p.id })} title="Remove from queue">
                      <X size={14} />
                    </Btn>
                  </div>
                </div>
                {p.question && (
                  <div className="mt-3 bg-slate-800/50 p-3 rounded-lg text-sm text-slate-300 border-l-2 border-cyan-500">
                    "{p.question}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stage - QR ALWAYS visible */}
        <div className="lg:col-span-5 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col items-center justify-center p-6">
          {room.currentSpeaker ? (
            <div className="text-center w-full">
              {/* Speaker info */}
              <div className="mb-4">
                <div className="w-28 h-28 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse shadow-[0_0_50px_rgba(34,197,94,0.4)]">
                  <Mic size={48} className="text-white" />
                </div>
                <h2 className="text-3xl font-bold mb-1">{room.currentSpeaker.name}</h2>
                <p className="text-green-400 font-bold tracking-widest animate-pulse mb-2">● LIVE</p>
                {room.currentSpeaker.linkedin && (
                  <div className="flex justify-center">
                    <LinkedInBadge url={room.currentSpeaker.linkedin} size={50} />
                  </div>
                )}
              </div>
              {/* Persistent QR (smaller) */}
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-4">
                <div className="bg-white p-2 rounded-lg">
                  <QR value={joinUrl} size={80} />
                </div>
                <div className="text-left">
                  <p className="text-slate-400 text-xs">Scan to join</p>
                  <div className="flex items-center gap-1">
                    <code className="text-cyan-400 font-mono text-lg">{room.id}</code>
                    <CopyBtn text={joinUrl} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="bg-white p-4 rounded-2xl mb-6 inline-block shadow-xl">
                <QR value={joinUrl} size={180} />
              </div>
              <h2 className="text-2xl font-bold mb-3">Scan to Join</h2>
              <div className="flex items-center justify-center gap-2">
                <code className="text-cyan-400 font-mono text-2xl">{room.id}</code>
                <CopyBtn text={room.id} />
              </div>
              <p className="text-slate-500 text-sm mt-4">or share:</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <code className="text-slate-400 text-xs break-all max-w-[250px]">{joinUrl}</code>
                <CopyBtn text={joinUrl} />
              </div>
            </div>
          )}
        </div>

        {/* Transcript with language selector */}
        <div className="lg:col-span-3">
          <TranscriptPanel transcript={transcript} />
        </div>
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
      setTimeout(() => setFuStatus(null), 3000);
    });
    // speech_ended is broadcast to EVERYONE in the room
    // Only non-speakers should stopRTC here; the speaker waits for speech_done_can_rejoin
    sk.on("speech_ended", () => {
      setFuStatus(null);
      if (!isSpeaking) {
        stopRTC();
      }
    });
    // Only the speaker receives this - safe to stop RTC and show rejoin
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
    sk.on("removed_from_queue", () => { /* room_data update handles UI */ });
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
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 text-white flex flex-col items-center justify-center p-6">
        <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-6 animate-pulse shadow-2xl">
          <Mic size={64} className="text-green-600" />
        </div>
        <h2 className="text-4xl font-black mb-2 text-center">YOU ARE LIVE</h2>
        <p className="text-green-200 mb-8">Your voice is streaming</p>
        {fuStatus === "pending" && <div className="bg-yellow-500/20 border border-yellow-500 rounded-xl p-4 mb-4"><p className="text-yellow-200">Waiting for host...</p></div>}
        {fuStatus === "approved" && <div className="bg-green-500/30 border border-green-400 rounded-xl p-4 mb-4"><p className="text-green-200">✓ Continue!</p></div>}
        {fuStatus === "declined" && <div className="bg-red-500/30 border border-red-400 rounded-xl p-4 mb-4"><p className="text-red-200">Follow-up declined</p></div>}
        <div className="space-y-4 w-full max-w-xs">
          {fuStatus !== "pending" && (
            <Btn v="secondary" sz="lg" onClick={() => { s.current.emit("signal_followup", room.id); setFuStatus("pending"); }} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black">
              <Hand size={24} /> Follow-up
            </Btn>
          )}
          <Btn v="secondary" sz="lg" onClick={() => { s.current.emit("end_speech", room.id); stopRTC(); }} className="w-full">
            <Square size={24} /> Done
          </Btn>
        </div>
      </div>
    );
  }

  // ── Post-speech: offer to rejoin queue ──
  if (canRejoin && !inQueue) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Hand size={36} className="text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Your turn ended</h2>
          <p className="text-slate-400 mb-6">Want to ask a follow-up question?</p>
          <div className="space-y-3">
            <Btn sz="lg" onClick={() => { s.current.emit("rejoin_queue", { roomId: room.id, user }); setCanRejoin(false); }} className="w-full">
              <Hand size={20} /> Rejoin Queue (Follow-up)
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="p-4 border-b border-white/10 bg-slate-900/80 backdrop-blur flex justify-between items-center shrink-0">
        <div>
          <h1 className="font-bold text-lg">{room.name}</h1>
          <p className="text-xs text-slate-400">
            {room.currentSpeaker ? `${room.currentSpeaker.name} speaking` : "Stage empty"}
          </p>
        </div>
        <Btn v="ghost" sz="sm" onClick={onExit}>Exit</Btn>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {inQueue ? (
          /* ── In Queue View ── */
          <div className="max-w-md mx-auto text-center">
            {/* Queue position - prominent display */}
            <div className="bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-2xl p-6 mb-6">
              <p className="text-sm uppercase font-bold tracking-widest text-slate-300 mb-2">Your position</p>
              <div className="text-8xl font-black text-cyan-500 mb-1">{qPos}</div>
              <p className="text-slate-400 text-sm">
                {qPos === 1 ? "🎉 You're next!" : `${qPos - 1} ${qPos - 1 === 1 ? "person" : "people"} ahead of you`}
              </p>
              {room.queue && (
                <div className="mt-3 text-xs text-slate-500">
                  {room.queue.length} total in queue
                </div>
              )}
            </div>

            <div className="bg-slate-800/50 p-4 rounded-xl mb-6 text-left border border-slate-700">
              <label className="text-sm text-slate-400 mb-2 block">Your question (optional)</label>
              <textarea value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-black/50 rounded-lg p-3 text-white text-sm outline-none border border-slate-700 focus:border-cyan-500 resize-none" rows={3} placeholder="Type your question..." />
              <Btn sz="sm" onClick={() => { if (q.trim()) { s.current.emit("submit_question", { roomId: room.id, text: q }); setQ(""); } }} className="w-full mt-3">
                <Send size={14} /> Submit
              </Btn>
            </div>

            <Btn v="ghost" onClick={() => s.current.emit("leave_queue", room.id)}>Leave Queue</Btn>

            {/* Transcript visible while waiting */}
            <div className="mt-6">
              <TranscriptPanel transcript={transcript} compact />
            </div>
          </div>
        ) : (
          /* ── Default Attendee View ── */
          <div className="max-w-md mx-auto">
            <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl mb-6 text-center">
              <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-cyan-400">{user.name?.charAt(0)?.toUpperCase() || "?"}</span>
              </div>
              <h3 className="font-bold text-xl">{user.name}</h3>
              {user.linkedin && (
                <a
                  href={user.linkedin.startsWith("http") ? user.linkedin : `https://linkedin.com/in/${user.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 text-sm mt-2"
                >
                  <LinkedInIcon size={14} /> LinkedIn Profile
                </a>
              )}
            </div>

            <Btn sz="lg" onClick={() => s.current.emit("join_queue", { roomId: room.id, user })} className="w-full mb-8 py-6 text-lg">
              <Mic size={24} /> Join Queue
            </Btn>

            <div className="text-center mb-8">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">React</p>
              <div className="flex justify-center gap-3 flex-wrap">
                {["🔥", "❤️", "👍", "👏", "🎉", "💡"].map((e) => (
                  <button key={e} onClick={() => s.current.emit("send_reaction", { roomId: room.id, emoji: e })} className="w-12 h-12 bg-slate-800 rounded-full text-2xl hover:bg-slate-700 active:scale-90 transition">
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Transcript with language selector */}
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
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <button onClick={onBack} className="mb-6 text-slate-500 hover:text-white flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
        <Logo /><p className="text-slate-400 mt-2 mb-6">Welcome back</p>
        {err && <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-4 text-red-400 text-sm flex items-center gap-2"><AlertCircle size={16} /> {err}</div>}
        <form onSubmit={go} className="space-y-4">
          <Field type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          <Btn type="submit" disabled={busy} className="w-full">{busy ? "Signing in..." : "Sign In"}</Btn>
        </form>
        <p className="text-center text-slate-500 mt-6">No account? <button onClick={onSwitch} className="text-cyan-400 hover:underline">Sign up</button></p>
        <div className="mt-6 pt-6 border-t border-slate-800"><p className="text-center text-slate-600 text-sm">Demo: <code className="text-cyan-500">admin@speakapp.io</code> / <code className="text-cyan-500">admin123</code></p></div>
      </Card>
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
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <button onClick={onBack} className="mb-6 text-slate-500 hover:text-white flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
        <Logo /><p className="text-slate-400 mt-2 mb-6">Create account</p>
        {err && <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-4 text-red-400 text-sm flex items-center gap-2"><AlertCircle size={16} /> {err}</div>}
        <form onSubmit={go} className="space-y-4">
          <Field placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Field type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field type="password" placeholder="Password (min 6)" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
          <Btn type="submit" disabled={busy} className="w-full">{busy ? "Creating..." : "Create Account"}</Btn>
        </form>
        <p className="text-center text-slate-500 mt-6">Have account? <button onClick={onSwitch} className="text-cyan-400 hover:underline">Sign in</button></p>
      </Card>
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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="h-16 bg-slate-900/80 backdrop-blur border-b border-white/10 flex items-center justify-between px-6">
        <Logo sm />
        <Btn v="ghost" sz="sm" onClick={onBack}><ArrowLeft size={16} /> Back</Btn>
      </header>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Admin</h1>
        <div className="grid grid-cols-3 gap-4">
          {[
            { i: Users, l: "Users", v: stats?.totalUsers || 0 },
            { i: Monitor, l: "Events", v: stats?.totalEvents || 0 },
            { i: TrendingUp, l: "Active", v: stats?.activeEvents || 0 },
          ].map((x, i) => (
            <div key={i} className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
              <x.i size={20} className="text-cyan-400 mb-2" />
              <div className="text-2xl font-bold">{x.v}</div>
              <div className="text-sm text-slate-400">{x.l}</div>
            </div>
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
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Status ok={ok} />
      <Card className="max-w-md w-full">
        <button onClick={onBack} className="mb-6 text-slate-500 hover:text-white flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
        <h2 className="text-2xl font-bold mb-2">Create Event</h2>
        <p className="text-slate-400 mb-6">Set up your Q&A</p>
        <div className="space-y-4">
          <Field label="Event Name" placeholder="Tech Conference Q&A" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Your Name" placeholder="John Smith" value={host} onChange={(e) => setHost(e.target.value)} />
          <Btn onClick={() => { if (!name.trim()) return alert("Enter event name"); onCreate({ name: name.trim(), hostName: host.trim() || "Host" }); }} disabled={!ok} className="w-full" sz="lg">
            <Play size={20} /> Launch Event
          </Btn>
          {!ok && <p className="text-yellow-400 text-sm text-center">⏳ Connecting to server...</p>}
        </div>
      </Card>
    </div>
  );
}

function JoinPage({ onBack, onJoin, ok }) {
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get("room") || "");
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [anon, setAnon] = useState(false);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Status ok={ok} />
      <Card className="max-w-md w-full">
        <button onClick={onBack} className="mb-6 text-slate-500 hover:text-white flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
        <h2 className="text-2xl font-bold mb-2">Join Event</h2>
        <p className="text-slate-400 mb-6">Enter room code</p>
        <div className="space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full bg-white/10 border border-white/20 p-4 text-center text-3xl font-mono uppercase text-white rounded-xl outline-none focus:border-cyan-500"
            placeholder="CODE"
            maxLength={4}
          />
          {!anon && (
            <>
              <Field placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="relative">
                <Field
                  placeholder="LinkedIn URL or username (optional)"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                />
                <LinkedInIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
              </div>
            </>
          )}
          <label className="flex items-center gap-3 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="w-4 h-4 rounded" />
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
          {!ok && <p className="text-yellow-400 text-sm text-center">⏳ Connecting to server...</p>}
        </div>
      </Card>
    </div>
  );
}

// ─── Landing ─────────────────────────────────────────────────────────────────
function Landing({ ok, nav }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <Status ok={ok} />
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      <nav className="absolute top-0 w-full p-4 md:p-6 flex justify-between items-center z-10">
        <Logo />
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {["admin", "superadmin"].includes(user.role) && <Btn v="ghost" sz="sm" onClick={() => nav("admin")}><BarChart3 size={16} /></Btn>}
              <span className="text-slate-400 text-sm hidden sm:inline">{user.name}</span>
              <Btn v="ghost" sz="sm" onClick={logout}><LogOut size={16} /></Btn>
            </>
          ) : (
            <Btn v="ghost" sz="sm" onClick={() => nav("login")}><LogIn size={16} /></Btn>
          )}
        </div>
      </nav>
      <div className="relative z-10 text-center max-w-2xl px-4">
        <div className="inline-block px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-6">Conference Q&A</div>
        <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-6">
          Speak<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">App</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 mb-10">
          Real-time Q&A with WebRTC audio streaming.<br className="hidden md:block" />No app downloads required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Btn sz="lg" onClick={() => nav("host")}><Monitor size={20} /> Host Event</Btn>
          <Btn v="secondary" sz="lg" onClick={() => nav("join")}><Smartphone size={20} /> Join Event</Btn>
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
