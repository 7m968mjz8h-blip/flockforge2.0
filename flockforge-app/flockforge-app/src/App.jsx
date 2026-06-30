import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Bird, Egg as EggIcon, Heart, CalendarDays, Stethoscope, GitBranch, BellRing,
  Feather, Plus, X, Pencil, Trash2, Camera, ChevronDown, ChevronLeft, ChevronRight,
  Check, Loader2, Link2, Gauge, Wallet, Repeat, Search, Download, Upload, AlertTriangle, ShoppingBasket, StickyNote, LogOut, Mail, Lock
} from "lucide-react";
import { supabase } from "./supabaseClient.js";

/* ----------------------------- constants ----------------------------- */

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Gauge, accent: "#8FBF7A" },
  { id: "flock", label: "Flock", icon: Bird, accent: "#4F8F52" },
  { id: "incubator", label: "Incubator", icon: EggIcon, accent: "#3D7A4A" },
  { id: "breeding", label: "Breeding", icon: Heart, accent: "#6B9C5E" },
  { id: "egglog", label: "Egg Log", icon: CalendarDays, accent: "#3F9A6B" },
  { id: "economics", label: "Economics", icon: Wallet, accent: "#8C6D3F" },
  { id: "health", label: "Health", icon: Stethoscope, accent: "#3F6B4A" },
  { id: "lineage", label: "Lineage", icon: GitBranch, accent: "#2E4F33" },
  { id: "reminders", label: "Reminders", icon: BellRing, accent: "#C8893A" },
  { id: "mortality", label: "Mortality", icon: Feather, accent: "#6B7561" },
];

const EGG_COLORS = [
  { name: "White", hex: "#F5F1E6" },
  { name: "Brown", hex: "#A9764F" },
  { name: "Dark Brown", hex: "#6B4226" },
  { name: "Tan", hex: "#D6B583" },
  { name: "Blue", hex: "#A9C4C4" },
  { name: "Green", hex: "#7CA869" },
  { name: "Olive", hex: "#8C8B4E" },
  { name: "Cream", hex: "#E8DCC0" },
  { name: "Pink", hex: "#E3C6BE" },
  { name: "Speckled", hex: "#C9A876" },
];

const EGG_SIZES = ["Peewee", "Small", "Medium", "Large", "Extra Large", "Jumbo"];

const SPECIES_PRESETS = [
  { name: "Chicken", days: 21 },
  { name: "Duck", days: 28 },
  { name: "Quail", days: 18 },
  { name: "Turkey", days: 28 },
  { name: "Goose", days: 30 },
  { name: "Other", days: 21 },
];

const MORTALITY_CAUSES = ["Predator", "Illness", "Injury", "Egg-bound", "Old age", "Unknown", "Cull", "Other"];
const ORIGIN_PRESETS = ["Hatched in my incubator", "Hatched by a broody hen", "Purchased — feed store", "Purchased — breeder", "Purchased — online/mail order", "Gift or trade"];
const HEALTH_TYPES = ["Vaccination", "Deworming", "Treatment", "Weight check", "Checkup", "Injury", "Other"];
const REMOVAL_REASONS = ["Infertile", "Quitter / stopped developing", "Cracked", "Other"];

/* ------------------------------- helpers ------------------------------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) {
  const A = new Date(a + "T00:00:00"), B = new Date(b + "T00:00:00");
  return Math.round((B - A) / 86400000);
}
function ageString(hatchDate) {
  if (!hatchDate) return "—";
  const days = daysBetween(hatchDate, todayStr());
  if (days < 0) return "—";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} old`;
  if (days < 60) return `${Math.floor(days / 7)} wks old`;
  const months = Math.floor(days / 30.4);
  if (months < 18) return `${months} mo old`;
  return `${(days / 365).toFixed(1)} yrs old`;
}
function eggColorHex(name) { return EGG_COLORS.find((c) => c.name === name)?.hex || "#CFEDE7"; }
function sexBorderColor(sex) { return sex === "rooster" ? "#3F6B4A" : sex === "hen" ? "#8FBF7A" : "#6B7561"; }
function sexBadgeColor(sex) { return sex === "rooster" ? "#3F6B4A" : sex === "hen" ? "#4F8F52" : "#6B7561"; }

function advanceDate(dateStr, recurrence) {
  const d = new Date(dateStr + "T00:00:00");
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function resizeImage(file, maxDim = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
        else if (height >= width && height > maxDim) { width *= maxDim / height; height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* --------------------------- persistence hook --------------------------- */

function usePersistedArray(key, userId, onReady, onSaveStateChange) {
  const [data, setData] = useState([]);
  const loadedRef = useRef(false);
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
    if (!userId) { loadedRef.current = false; return; }
    loadedRef.current = false;
    (async () => {
      try {
        const { data: row } = await supabase.from("user_data").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
        setData(row && Array.isArray(row.value) ? row.value : []);
      } catch (e) {
        setData([]);
      }
      loadedRef.current = true;
      onReady();
    })();
  }, [userId]);

  useEffect(() => {
    if (!loadedRef.current || !userIdRef.current) return;
    onSaveStateChange?.(true);
    supabase.from("user_data").upsert({ user_id: userIdRef.current, key, value: data, updated_at: new Date().toISOString() })
      .then(() => {})
      .catch(() => {})
      .finally(() => onSaveStateChange?.(false));
  }, [data]);

  return [data, setData];
}

/* ------------------------------ UI atoms ------------------------------- */

function HenAnvilLogo({ size = 22, color = "#E3D5B8" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color}>
      {/* anvil */}
      <rect x="6" y="14" width="23" height="6" rx="1" />
      <path d="M6 15 L0.5 18 L6 19.5 Z" />
      <rect x="11" y="20" width="10" height="6" />
      <rect x="4" y="26" width="24" height="4" rx="1.5" />
      {/* hen tail feathers */}
      <path d="M15 7 C 11.5 4, 8 1.5, 5 1 C 7 4, 9.5 6.5, 13 9.5 Z" />
      <path d="M16 5.5 C 13 2.5, 10 0.5, 7.5 0.3 C 9.5 3, 12 5, 14.5 7.5 Z" />
      {/* hen body */}
      <path d="M27 13.5 C 28.5 9.5, 26.5 5, 22 3.5 C 18 3, 14 5, 13.5 9 C 13.3 11, 15 12.8, 18 13.2 C 21.5 13.6, 24.5 13.6, 27 13.5 Z" />
      {/* hen head */}
      <circle cx="27.5" cy="6" r="2.6" />
      {/* comb */}
      <path d="M25.3 3.6 Q26.2 0.8 27 3.2 Q27.8 0.6 28.6 3.1 Q29.4 0.9 30 3 Z" />
      {/* beak */}
      <path d="M29.7 5.6 L31.6 5 L29.5 7.2 Z" />
      {/* wattle */}
      <path d="M28.3 8 C 27.8 9.3, 28.6 10, 29.3 9.2 C 29.6 8.6, 29 8, 28.3 8 Z" />
      {/* legs */}
      <rect x="17" y="13" width="1.4" height="1.6" />
      <rect x="21.6" y="13" width="1.4" height="1.6" />
    </svg>
  );
}

function EggShape({ size = 14, fill = "#CFEDE7", glow = 0, ring }) {
  const style = {
    width: size, height: size * 1.22,
    borderRadius: "50% 50% 48% 48% / 62% 62% 40% 40%",
    background: fill,
    boxShadow: glow > 0 ? `0 0 ${6 + glow * 14}px ${2 + glow * 6}px rgba(143,191,122,${0.25 + glow * 0.5})` : "none",
    border: ring ? `2px solid ${ring}` : "1px solid rgba(11,42,44,0.15)",
    flexShrink: 0,
  };
  return <div style={style} />;
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-bold uppercase mb-1" style={{ color: "var(--teal)", fontFamily: "Manrope, sans-serif", letterSpacing: "0.04em" }}>{label}</span>
      {children}
      {hint && <span className="block text-xs mt-1" style={{ color: "var(--slate)" }}>{hint}</span>}
    </label>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl outline-none text-base transition-colors";
const inputStyle = { border: "1.5px solid rgba(11,42,44,0.12)", background: "#fff", color: "var(--ink)" };

function TextInput(props) { return <input {...props} className={inputCls + " " + (props.className || "")} style={{ ...inputStyle, ...props.style }} />; }
function Select(props) { return <select {...props} className={inputCls + " " + (props.className || "")} style={{ ...inputStyle, ...props.style }}>{props.children}</select>; }
function TextArea(props) { return <textarea {...props} className={inputCls + " " + (props.className || "")} style={{ ...inputStyle, minHeight: 70, ...props.style }} />; }

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function DateInput({ value, onChange }) {
  const parseValue = (v) => {
    if (!v) return { y: "", m: "", d: "" };
    const [y, m, d] = v.split("-");
    return { y, m: String(Number(m)), d: String(Number(d)) };
  };
  const [parts, setParts] = useState(parseValue(value));
  useEffect(() => { setParts(parseValue(value)); }, [value]);

  const daysInMonth = (y, m) => (y && m) ? new Date(+y, +m, 0).getDate() : 31;
  const maxDay = daysInMonth(parts.y, parts.m);
  const years = useMemo(() => { const cy = new Date().getFullYear(); const arr = []; for (let y = cy + 5; y >= cy - 20; y--) arr.push(y); return arr; }, []);

  const handle = (next) => {
    const dim = daysInMonth(next.y, next.m);
    if (next.d && +next.d > dim) next = { ...next, d: String(dim) };
    setParts(next);
    if (next.y && next.m && next.d) {
      onChange(`${next.y}-${String(next.m).padStart(2, "0")}-${String(next.d).padStart(2, "0")}`);
    } else {
      onChange("");
    }
  };

  return (
    <div className="flex gap-2">
      <Select value={parts.m} onChange={(e) => handle({ ...parts, m: e.target.value })} className="flex-1">
        <option value="">Month</option>
        {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
      </Select>
      <Select value={parts.d} onChange={(e) => handle({ ...parts, d: e.target.value })} className="flex-1">
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </Select>
      <Select value={parts.y} onChange={(e) => handle({ ...parts, y: e.target.value })} className="flex-1">
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
    </div>
  );
}

function Btn({ children, onClick, accent = "#4F8F52", variant = "solid", type = "button", className = "", title }) {
  const base = "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition-transform active:scale-95 " + (variant === "solid" ? "rounded-full" : "rounded-xl");
  const style = variant === "solid" ? { background: accent, color: "#fff" } : variant === "ghost" ? { background: "transparent", color: accent, border: `1.5px solid ${accent}` } : { background: "transparent", color: accent };
  return (
    <button type={type} onClick={onClick} title={title} className={base + " " + className} style={{ fontFamily: "Manrope, sans-serif", ...style }}>
      {children}
    </button>
  );
}

function IconBtn({ icon: Icon, onClick, accent = "var(--ink)", title }) {
  return <button onClick={onClick} title={title} className="p-1.5 rounded-lg transition-colors" style={{ color: accent, opacity: 0.8 }}><Icon size={16} /></button>;
}

function Modal({ title, accent = "#4F8F52", onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(11,42,44,0.45)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"w-full bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col " + (wide ? "sm:max-w-xl" : "sm:max-w-md")} style={{ maxHeight: "92vh" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: `4px solid ${accent}` }}>
          <h3 className="text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif", color: accent }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle, accent, onAction, actionLabel }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 rounded-2xl bg-white shadow-sm">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: accent + "1A" }}>
        <Icon size={26} style={{ color: accent }} />
      </div>
      <p className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>{title}</p>
      <p className="text-sm mt-1 max-w-xs" style={{ color: "var(--slate)" }}>{subtitle}</p>
      {onAction && (
        <Btn accent={accent} className="mt-4" onClick={onAction}><Plus size={15} /> {actionLabel || "Add"}</Btn>
      )}
    </div>
  );
}

function ConfirmDialog({ title = "Are you sure?", message, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <Modal title={title} accent="var(--danger)" onClose={onCancel}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(200,73,60,0.12)" }}>
          <AlertTriangle size={17} style={{ color: "var(--danger)" }} />
        </div>
        <p className="text-sm" style={{ color: "var(--ink)" }}>{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" accent="rgba(11,42,44,0.5)" onClick={onCancel}>Cancel</Btn>
        <Btn accent="var(--danger)" onClick={onConfirm}><Trash2 size={14} /> {confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

function Badge({ children, color, bg }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: color || "#fff", background: bg }}>{children}</span>;
}

function ToggleSwitch({ checked, onChange, label, accent = "#4F8F52" }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="inline-flex items-center gap-2"
    >
      <span className="relative inline-block w-9 h-5 rounded-full flex-shrink-0 transition-colors" style={{ background: checked ? accent : "rgba(11,42,44,0.18)" }}>
        <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }} />
      </span>
      {label && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}

function StatPill({ label, value, accent }) {
  return (
    <div className="rounded-xl px-3 py-2 flex-1 min-w-[86px]" style={{ background: accent + "12" }}>
      <div className="text-xl font-bold" style={{ color: accent, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div className="text-[11px] uppercase font-bold tracking-wide" style={{ color: "var(--slate)" }}>{label}</div>
    </div>
  );
}

function PhotoSlot({ value, onChange, label = "Photo", shape = "egg", fit = "cover" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fit === "contain") {
      setBusy(true);
      try { onChange(await resizeImage(file, 480)); } finally { setBusy(false); }
    } else {
      const reader = new FileReader();
      reader.onload = () => setCropSrc(reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };
  return (
    <div>
      <span className="block text-xs font-bold uppercase mb-1" style={{ color: "var(--teal)" }}>{label}</span>
      <div onClick={() => ref.current?.click()} className="relative w-24 h-24 flex items-center justify-center cursor-pointer overflow-hidden border-2"
        style={{ borderRadius: shape === "egg" ? "50% 50% 48% 48% / 62% 62% 40% 40%" : 16, borderColor: "rgba(11,42,44,0.15)", background: "#fff" }}>
        {busy ? <Loader2 className="animate-spin" size={20} style={{ color: "var(--teal)" }} /> : value ? <img src={value} alt="" className={"w-full h-full " + (fit === "contain" ? "object-contain" : "object-cover")} /> : <Camera size={22} style={{ color: "var(--slate)" }} />}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {value && fit !== "contain" && <button onClick={() => setCropSrc(value)} className="text-xs underline" style={{ color: "var(--teal)" }}>Adjust crop</button>}
        {value && <button onClick={() => onChange(null)} className="text-xs underline" style={{ color: "var(--danger)" }}>Remove</button>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          shape={shape}
          onCancel={() => setCropSrc(null)}
          onApply={(cropped) => { onChange(cropped); setCropSrc(null); }}
        />
      )}
    </div>
  );
}

function ImageCropModal({ src, shape, onCancel, onApply }) {
  const FRAME = 260;
  const OUTPUT = 480;
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const clampPan = (p, s, n) => {
    const dw = n.w * s, dh = n.h * s;
    const minX = FRAME - dw, minY = FRAME - dh;
    return { x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
  };

  const onImgLoad = (e) => {
    const w = e.target.naturalWidth, h = e.target.naturalHeight;
    const ms = Math.max(FRAME / w, FRAME / h);
    setNatural({ w, h });
    setMinScale(ms);
    setScale(ms);
    setPan({ x: (FRAME - w * ms) / 2, y: (FRAME - h * ms) / 2 });
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current || !natural.w) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan(clampPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }, scale, natural));
  };
  const onPointerUp = (e) => { e.preventDefault(); dragRef.current = null; };

  const handleZoom = (e) => {
    const newScale = parseFloat(e.target.value);
    const cx = FRAME / 2, cy = FRAME / 2;
    const imgX = (cx - pan.x) / scale, imgY = (cy - pan.y) / scale;
    const newPan = { x: cx - imgX * newScale, y: cy - imgY * newScale };
    setScale(newScale);
    setPan(clampPan(newPan, newScale, natural));
  };

  const apply = () => {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    const sx = -pan.x / scale, sy = -pan.y / scale;
    const sSize = FRAME / scale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    onApply(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <Modal title="Adjust photo" accent="var(--teal)" onClose={onCancel}>
      <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>Drag to reposition. Use the slider to zoom in or out.</p>
      <div
        className="relative mx-auto overflow-hidden select-none"
        style={{ width: FRAME, height: FRAME, borderRadius: shape === "egg" ? "50% 50% 48% 48% / 62% 62% 40% 40%" : 16, background: "#1B2E1F", border: "2px solid rgba(11,42,44,0.15)", cursor: "grab", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={onImgLoad}
          style={{ position: "absolute", left: pan.x, top: pan.y, width: natural.w * scale || 0, height: natural.h * scale || 0, maxWidth: "none" }}
        />
      </div>
      <input
        type="range" min={minScale} max={minScale * 3} step={0.001} value={scale}
        onChange={handleZoom} className="w-full mt-4" style={{ accentColor: "var(--teal)" }}
      />
      <div className="flex justify-end gap-2 mt-3">
        <Btn variant="ghost" accent="rgba(11,42,44,0.5)" onClick={onCancel}>Cancel</Btn>
        <Btn accent="var(--teal)" onClick={apply}><Check size={15} /> Use this crop</Btn>
      </div>
    </Modal>
  );
}

/* ===================================================================== */
/*                               DASHBOARD                                */
/* ===================================================================== */

function DashCard({ icon: Icon, label, value, sub, accent, onClick, cornerAction }) {
  return (
    <div className="relative">
      <button onClick={onClick} className="bg-white rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition-shadow w-full">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: accent + "1A" }}>
          <Icon size={17} style={{ color: accent }} />
        </div>
        <div className="text-2xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--ink)" }}>{value}</div>
        <div className="text-xs font-bold" style={{ color: "var(--slate)" }}>{label}</div>
        <div className="text-[11px] mt-0.5 font-semibold" style={{ color: accent }}>{sub}</div>
      </button>
      {cornerAction}
    </div>
  );
}

function DashboardTab({ chickens, incubators, eggLogs, setEggLogs, reminders, onNavigate, onExport, onImport }) {
  const fileRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const pens = useMemo(() => [...new Set(chickens.map((c) => c.pen).filter(Boolean))], [chickens]);
  const active = chickens.filter((c) => c.status !== "deceased");
  const hens = active.filter((c) => c.sex === "hen").length;
  const roosters = active.filter((c) => c.sex === "rooster").length;
  const unsexed = active.filter((c) => c.sex === "unknown" || !c.sex).length;
  const today = todayStr();
  const eggsToday = eggLogs.filter((l) => l.date === today).reduce((s, l) => s + (l.count || 0), 0);
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); });
  const eggsWeek = eggLogs.filter((l) => last7.includes(l.date)).reduce((s, l) => s + (l.count || 0), 0);
  const incubatingCount = incubators.flatMap((i) => i.eggs).filter((e) => e.status === "incubating").length;
  const nearestHatch = incubators.map((inc) => {
    if (!inc.eggs.some((e) => e.status === "incubating")) return null;
    const hd = new Date(inc.startDate + "T00:00:00");
    hd.setDate(hd.getDate() + (inc.incubationDays || 21));
    const dateStr = hd.toISOString().slice(0, 10);
    return { name: inc.name, daysLeft: daysBetween(today, dateStr) };
  }).filter(Boolean).sort((a, b) => a.daysLeft - b.daysLeft);
  const openReminders = reminders.filter((r) => !r.done);
  const overdue = openReminders.filter((r) => r.dueDate < today).length;
  const upcoming = openReminders.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  const recentBirds = active.slice().sort((a, b) => b.id.localeCompare(a.id)).slice(0, 4);

  return (
    <div>
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <DashCard icon={Bird} label="Active birds" value={active.length} sub={`${hens} hens · ${roosters} roosters${unsexed ? ` · ${unsexed} unsexed` : ""}`} accent="#4F8F52" onClick={() => onNavigate("flock")} />
        <DashCard
          icon={EggIcon} label="Eggs today" value={eggsToday} sub={`${eggsWeek} this week`} accent="#3F9A6B" onClick={() => onNavigate("egglog")}
          cornerAction={
            <button
              onClick={(e) => { e.stopPropagation(); setQuickLogOpen(true); }}
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center shadow-sm"
              style={{ background: "#3F9A6B" }}
              title="Log today's eggs"
            >
              <Plus size={14} color="#fff" />
            </button>
          }
        />
        <DashCard icon={Gauge} label="Incubating" value={incubatingCount} sub={nearestHatch[0] ? (nearestHatch[0].daysLeft <= 0 ? "Any day now" : `Hatch in ${nearestHatch[0].daysLeft}d`) : "None running"} accent="#3D7A4A" onClick={() => onNavigate("incubator")} />
        <DashCard icon={BellRing} label="Reminders" value={openReminders.length} sub={overdue ? `${overdue} overdue` : "All caught up"} accent={overdue ? "#C8893A" : "#4F8F52"} onClick={() => onNavigate("reminders")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>Upcoming</h3>
          {upcoming.length === 0 ? <p className="text-sm" style={{ color: "var(--slate)" }}>Nothing on the calendar.</p> : (
            <div className="space-y-2">
              {upcoming.map((r) => (
                <div key={r.id} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{r.title}</span>
                  <span className="font-mono flex-shrink-0" style={{ color: r.dueDate < today ? "var(--danger)" : "var(--slate)" }}>{fmtDate(r.dueDate)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>Hatching soon</h3>
          {nearestHatch.length === 0 ? <p className="text-sm" style={{ color: "var(--slate)" }}>No incubators running.</p> : (
            <div className="space-y-2">
              {nearestHatch.map((h) => (
                <div key={h.name} className="flex justify-between text-sm">
                  <span>{h.name}</span>
                  <span className="font-mono font-bold" style={{ color: "var(--teal)" }}>{h.daysLeft <= 0 ? "Any day now" : `${h.daysLeft}d left`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {recentBirds.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <h3 className="font-bold mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>Recently added</h3>
          <div className="flex gap-3 flex-wrap">
            {recentBirds.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1" style={{ background: "rgba(79,143,82,0.1)" }}>
                <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0" style={{ borderColor: "var(--teal)" }}>
                  {b.photo ? <img src={b.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={11} /></div>}
                </div>
                <span className="text-sm font-semibold">{b.name || "Unnamed"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
        <h3 className="font-bold mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Backup & restore</h3>
        <p className="text-sm mb-3" style={{ color: "var(--slate)" }}>Your data lives in this artifact. Export a backup now and then so you always have a copy.</p>
        <div className="flex gap-2 flex-wrap">
          <Btn accent="#4F8F52" onClick={onExport}><Download size={15} /> Export backup</Btn>
          <Btn accent="#8C6D3F" variant="ghost" onClick={() => fileRef.current?.click()}><Upload size={15} /> Restore backup</Btn>
        </div>
        <input
          ref={fileRef} type="file" accept="application/json" className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try { setPendingImport(JSON.parse(await file.text())); }
            catch { alert("That file doesn't look like a valid FlockForge backup."); }
            e.target.value = "";
          }}
        />
      </div>

      {pendingImport && (
        <ConfirmDialog
          title="Restore this backup?"
          message="This replaces all current FlockForge data with the contents of this file. This cannot be undone."
          confirmLabel="Restore"
          onConfirm={() => { onImport(pendingImport); setPendingImport(null); }}
          onCancel={() => setPendingImport(null)}
        />
      )}
      {quickLogOpen && (
        <DayLogModal
          date={today} accent="#3F9A6B" pens={pens} chickens={chickens}
          entries={eggLogs.filter((l) => l.date === today)}
          onClose={() => setQuickLogOpen(false)}
          onAdd={(entry) => setEggLogs((arr) => [...arr, { ...entry, id: uid(), date: today }])}
          onDelete={(id) => setEggLogs((arr) => arr.filter((l) => l.id !== id))}
        />
      )}
    </div>
  );
}

/* ===================================================================== */
/*                                FLOCK TAB                               */
/* ===================================================================== */

function FlockTab({ chickens, setChickens, healthRecords, jumpToChickenId, onJumpHandled }) {
  const accent = "#4F8F52";
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [filterPen, setFilterPen] = useState("all");
  const [filterSex, setFilterSex] = useState("all");
  const pens = useMemo(() => [...new Set(chickens.map((c) => c.pen).filter(Boolean))], [chickens]);

  useEffect(() => {
    if (!jumpToChickenId) return;
    const bird = chickens.find((c) => c.id === jumpToChickenId.id);
    if (bird) setDetail(bird);
    onJumpHandled?.();
  }, [jumpToChickenId]);

  const visible = chickens.filter((c) => (showInactive || (c.status !== "deceased" && c.status !== "sold")) && (filterPen === "all" || c.pen === filterPen) && (filterSex === "all" || c.sex === filterSex || (filterSex === "unknown" && !c.sex)));

  const save = (data) => {
    if (data.id) setChickens((cs) => cs.map((c) => (c.id === data.id ? data : c)));
    else setChickens((cs) => [...cs, { ...data, id: uid(), status: "active" }]);
    setModal(null);
  };
  const remove = (id) => { setChickens((cs) => cs.filter((c) => c.id !== id)); setDetail(null); setConfirmDelete(null); };
  const toggleLaying = (id) => {
    setChickens((cs) => cs.map((c) => (c.id === id ? { ...c, laying: !c.laying } : c)));
    setDetail((d) => (d && d.id === id ? { ...d, laying: !d.laying } : d));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <Select value={filterPen} onChange={(e) => setFilterPen(e.target.value)} className="!w-auto text-sm">
            <option value="all">All pens</option>
            {pens.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={filterSex} onChange={(e) => setFilterSex(e.target.value)} className="!w-auto text-sm">
            <option value="all">Hens & roosters</option>
            <option value="hen">Hens only</option>
            <option value="rooster">Roosters only</option>
            <option value="unknown">Not yet sexed</option>
          </Select>
          <label className="flex items-center gap-1.5 text-sm px-2 select-none">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show deceased & sold
          </label>
        </div>
        <Btn accent={accent} onClick={() => setModal({ data: {} })}><Plus size={16} /> Add bird</Btn>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Bird} accent={accent} title="No birds yet" subtitle="Add your first chicken to start tracking the flock." onAction={() => setModal({ data: {} })} actionLabel="Add bird" />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
          {visible.map((c) => (
            <div key={c.id} onClick={() => setDetail(c)} className="rounded-2xl p-3.5 cursor-pointer bg-white shadow-sm hover:shadow-md transition-shadow flex gap-3" style={{ opacity: (c.status === "deceased" || c.status === "sold") ? 0.55 : 1 }}>
              <div className="w-14 h-14 flex items-center justify-center overflow-hidden flex-shrink-0 border-2" style={{ borderRadius: "50% 50% 48% 48% / 62% 62% 40% 40%", borderColor: sexBorderColor(c.sex), background: "#fff" }}>
                {c.photo ? <img src={c.photo} className="w-full h-full object-cover" /> : <Bird size={20} style={{ color: sexBorderColor(c.sex) }} />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold truncate" style={{ fontFamily: "'Playfair Display', serif" }}>{c.name || "Unnamed"}</p>
                  {c.status === "deceased" && <Badge bg="#6B756133" color="#6B7561">deceased</Badge>}
                  {c.status === "sold" && <Badge bg="#8C6D3F33" color="#8C6D3F">sold</Badge>}
                </div>
                <p className="text-xs" style={{ color: "var(--slate)" }}>{c.breed || "Unknown breed"} · {ageString(c.hatchDate)}</p>
                {c.origin && <p className="text-xs italic truncate" style={{ color: "var(--slate)" }}>From: {c.origin}</p>}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge bg={sexBadgeColor(c.sex)}>{c.sex || "unknown"}</Badge>
                  {c.pen && <Badge bg="#3D7A4A">{c.pen}</Badge>}
                  {c.sex === "hen" && (
                    <button onClick={(e) => { e.stopPropagation(); toggleLaying(c.id); }} title="Tap to toggle laying status">
                      <Badge bg={c.laying ? "#4F8F52" : "#6B756133"} color={c.laying ? "#fff" : "#6B7561"}>{c.laying ? "Laying" : "Not laying"}</Badge>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <Modal title={detail.name || "Bird detail"} accent={accent} onClose={() => setDetail(null)} wide>
          <ChickenDetail chicken={detail} chickens={chickens} healthRecords={healthRecords} onEdit={() => { setModal({ data: detail }); setDetail(null); }} onDelete={() => setConfirmDelete(detail.id)} onToggleLaying={() => toggleLaying(detail.id)} />
        </Modal>
      )}
      {modal && <ChickenForm accent={accent} initial={modal.data} chickens={chickens} onSave={save} onClose={() => setModal(null)} />}
      {confirmDelete && (
        <ConfirmDialog message="Remove this bird from FlockForge? This cannot be undone." onConfirm={() => remove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

function ChickenDetail({ chicken: c, chickens, healthRecords, onEdit, onDelete, onToggleLaying }) {
  const dam = chickens.find((x) => x.id === c.damId);
  const sire = chickens.find((x) => x.id === c.sireId);
  const children = chickens.filter((x) => x.damId === c.id || x.sireId === c.id);
  const records = healthRecords.filter((h) => h.chickenId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      {(c.status === "deceased" || c.status === "sold") && (
        <div className="mb-3">
          {c.status === "deceased" && <Badge bg="#6B756133" color="#6B7561">deceased</Badge>}
          {c.status === "sold" && <Badge bg="#8C6D3F33" color="#8C6D3F">sold</Badge>}
        </div>
      )}
      <div className="flex gap-4 mb-4">
        <div className="w-24 h-24 overflow-hidden border-2 flex-shrink-0" style={{ borderRadius: "50% 50% 48% 48% / 62% 62% 40% 40%", borderColor: sexBorderColor(c.sex) }}>
          {c.photo ? <img src={c.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={26} style={{ color: "var(--slate)" }} /></div>}
        </div>
        <div className="text-sm space-y-0.5">
          <p><span className="font-bold" style={{ color: "var(--teal)" }}>Breed:</span> {c.breed || "—"}</p>
          <p><span className="font-bold" style={{ color: "var(--teal)" }}>Hatched:</span> {fmtDate(c.hatchDate)} ({ageString(c.hatchDate)})</p>
          <p><span className="font-bold" style={{ color: "var(--teal)" }}>Band #:</span> <span className="font-mono">{c.bandNumber || "—"}</span></p>
          <p><span className="font-bold" style={{ color: "var(--teal)" }}>Pen:</span> {c.pen || "—"}</p>
          <p><span className="font-bold" style={{ color: "var(--teal)" }}>Origin:</span> {c.origin || "—"}</p>
          {c.sex === "hen" && <p className="flex items-center gap-1.5"><span className="font-bold" style={{ color: "var(--teal)" }}>Egg color:</span> <EggShape size={11} fill={eggColorHex(c.eggColor)} /> {c.eggColor || "—"}</p>}
          {c.sex === "hen" && <p><span className="font-bold" style={{ color: "var(--teal)" }}>Egg size:</span> {c.eggSize || "—"}</p>}
        </div>
      </div>
      {c.eggPhoto && (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase mb-1" style={{ color: "var(--teal)" }}>Egg sample</p>
          <img src={c.eggPhoto} className="w-20 h-20 object-contain rounded-xl border" style={{ background: "#fff", borderColor: "rgba(11,42,44,0.12)" }} />
        </div>
      )}
      {c.sex === "hen" && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-xs font-bold uppercase" style={{ color: "var(--teal)" }}>Laying status</span>
          <ToggleSwitch checked={!!c.laying} onChange={onToggleLaying} label={c.laying ? "Currently laying" : "Not laying yet"} accent="#4F8F52" />
        </div>
      )}
      {(dam || sire) && (
        <div className="mb-4 text-sm">
          <p className="text-xs font-bold uppercase mb-1" style={{ color: "var(--teal)" }}>Parents</p>
          <p>{sire ? sire.name : "Unknown sire"} × {dam ? dam.name : "Unknown dam"}</p>
        </div>
      )}
      {children.length > 0 && (
        <div className="mb-4 text-sm">
          <p className="text-xs font-bold uppercase mb-1" style={{ color: "var(--teal)" }}>Offspring ({children.length})</p>
          <p>{children.map((x) => x.name).join(", ")}</p>
        </div>
      )}
      {c.notes && <p className="text-sm mb-4 italic" style={{ color: "var(--slate)" }}>"{c.notes}"</p>}
      {records.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase mb-1.5" style={{ color: "var(--teal)" }}>Recent health records</p>
          <div className="space-y-1.5">
            {records.slice(0, 4).map((r) => (
              <div key={r.id} className="text-sm flex justify-between border-b pb-1" style={{ borderColor: "rgba(11,42,44,0.08)" }}>
                <span>{r.type}{r.description ? `: ${r.description}` : ""}</span>
                <span className="font-mono text-xs" style={{ color: "var(--slate)" }}>{fmtDate(r.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <Btn accent="var(--teal)" onClick={onEdit}><Pencil size={14} /> Edit</Btn>
        <Btn accent="var(--danger)" variant="ghost" onClick={onDelete}><Trash2 size={14} /> Delete</Btn>
      </div>
    </div>
  );
}

function ChickenForm({ accent, initial, chickens, onSave, onClose }) {
  const [f, setF] = useState({ name: "", hatchDate: "", breed: "", sex: "unknown", bandNumber: "", pen: "", eggColor: "", eggSize: "", photo: null, eggPhoto: null, notes: "", damId: "", sireId: "", status: "active", laying: false, origin: "", ...initial });
  const [customColor, setCustomColor] = useState(!!f.eggColor && !EGG_COLORS.some((c) => c.name === f.eggColor));
  const [customSize, setCustomSize] = useState(!!f.eggSize && !EGG_SIZES.includes(f.eggSize));
  const pens = useMemo(() => [...new Set(chickens.map((c) => c.pen).filter(Boolean))], [chickens]);
  const [customPen, setCustomPen] = useState(!!f.pen && !pens.includes(f.pen));
  const [customOrigin, setCustomOrigin] = useState(!!f.origin && !ORIGIN_PRESETS.includes(f.origin));
  const hens = chickens.filter((c) => c.sex === "hen" && c.id !== initial.id);
  const roosters = chickens.filter((c) => c.sex === "rooster" && c.id !== initial.id);
  return (
    <Modal title={initial.id ? "Edit bird" : "Add a bird"} accent={accent} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Name"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Henrietta" /></Field>
        <Field label="Sex">
          <Select value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })}>
            <option value="hen">Hen</option><option value="rooster">Rooster</option><option value="unknown">Unknown / not yet sexed</option>
          </Select>
        </Field>
        <Field label="Hatch date"><DateInput value={f.hatchDate} onChange={(v) => setF({ ...f, hatchDate: v })} /></Field>
        <Field label="Breed"><TextInput value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} placeholder="Easter Egger" /></Field>
        <Field label="Band number"><TextInput value={f.bandNumber} onChange={(e) => setF({ ...f, bandNumber: e.target.value })} placeholder="A-014" /></Field>
        <Field label="Pen">
          <Select
            value={customPen ? "__custom__" : f.pen}
            onChange={(e) => {
              if (e.target.value === "__custom__") { setCustomPen(true); setF({ ...f, pen: "" }); }
              else { setCustomPen(false); setF({ ...f, pen: e.target.value }); }
            }}
          >
            <option value="">No pen</option>
            {pens.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="__custom__">+ New pen</option>
          </Select>
          {customPen && (
            <TextInput className="mt-2" value={f.pen} onChange={(e) => setF({ ...f, pen: e.target.value })} placeholder="e.g. Pen 3" />
          )}
        </Field>
        <Field label="Origin" hint="Where this bird came from">
          <Select
            value={customOrigin ? "__custom__" : f.origin}
            onChange={(e) => {
              if (e.target.value === "__custom__") { setCustomOrigin(true); setF({ ...f, origin: "" }); }
              else { setCustomOrigin(false); setF({ ...f, origin: e.target.value }); }
            }}
          >
            <option value="">Not specified</option>
            {ORIGIN_PRESETS.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value="__custom__">Other (type your own)</option>
          </Select>
          {customOrigin && (
            <TextInput className="mt-2" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} placeholder="e.g. Tractor Supply" />
          )}
        </Field>
        {f.sex === "hen" && (
          <Field label="Egg color">
            <Select
              value={customColor ? "__custom__" : f.eggColor}
              onChange={(e) => {
                if (e.target.value === "__custom__") { setCustomColor(true); setF({ ...f, eggColor: "" }); }
                else { setCustomColor(false); setF({ ...f, eggColor: e.target.value }); }
              }}
            >
              <option value="">Select color</option>
              {EGG_COLORS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              <option value="__custom__">Other (type your own)</option>
            </Select>
            {customColor && (
              <TextInput className="mt-2" value={f.eggColor} onChange={(e) => setF({ ...f, eggColor: e.target.value })} placeholder="e.g. olive with dark speckles" />
            )}
          </Field>
        )}
        {f.sex === "hen" && (
          <Field label="Egg size">
            <Select
              value={customSize ? "__custom__" : f.eggSize}
              onChange={(e) => {
                if (e.target.value === "__custom__") { setCustomSize(true); setF({ ...f, eggSize: "" }); }
                else { setCustomSize(false); setF({ ...f, eggSize: e.target.value }); }
              }}
            >
              <option value="">Select size</option>
              {EGG_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">Other (type your own)</option>
            </Select>
            {customSize && (
              <TextInput className="mt-2" value={f.eggSize} onChange={(e) => setF({ ...f, eggSize: e.target.value })} placeholder="e.g. extra-extra-large" />
            )}
          </Field>
        )}
        {f.sex === "hen" && (
          <Field label="Laying status">
            <ToggleSwitch checked={!!f.laying} onChange={(v) => setF({ ...f, laying: v })} label={f.laying ? "Currently laying" : "Not laying yet"} accent="#4F8F52" />
          </Field>
        )}
        <Field label="Dam (mother)">
          <Select value={f.damId} onChange={(e) => setF({ ...f, damId: e.target.value })}>
            <option value="">Unknown</option>{hens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </Field>
        <Field label="Sire (father)">
          <Select value={f.sireId} onChange={(e) => setF({ ...f, sireId: e.target.value })}>
            <option value="">Unknown</option>{roosters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex gap-4 mb-3">
        <PhotoSlot value={f.photo} onChange={(v) => setF({ ...f, photo: v })} label="Bird photo" />
        {f.sex === "hen" && <PhotoSlot value={f.eggPhoto} onChange={(v) => setF({ ...f, eggPhoto: v })} label="Egg photo" />}
      </div>
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Broody every spring, friendly with kids..." /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="ghost" accent="rgba(11,42,44,0.5)" onClick={onClose}>Cancel</Btn>
        <Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save bird</Btn>
      </div>
    </Modal>
  );
}

/* ===================================================================== */
/*                              INCUBATOR TAB                            */
/* ===================================================================== */

function IncubatorTab({ incubators, setIncubators, chickens, setChickens, breedingPairs, setReminders }) {
  const accent = "#3D7A4A";
  const [modal, setModal] = useState(null);
  const [eggModal, setEggModal] = useState(null);
  const [hatchModal, setHatchModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const saveIncubator = (data) => {
    if (data.id) setIncubators((arr) => arr.map((i) => (i.id === data.id ? { ...i, ...data } : i)));
    else setIncubators((arr) => [...arr, { ...data, id: uid(), eggs: [] }]);
    setModal(null);
  };
  const removeIncubator = (id) => { setIncubators((arr) => arr.filter((i) => i.id !== id)); setConfirmDelete(null); };

  const addReminders = (inc) => {
    const days = inc.incubationDays || 21;
    const add = (offset, type, title) => {
      const due = new Date(inc.startDate + "T00:00:00");
      due.setDate(due.getDate() + offset);
      return { id: uid(), title, dueDate: due.toISOString().slice(0, 10), type, relatedIncubatorId: inc.id, done: false };
    };
    setReminders((r) => [...r, add(7, "Candling", `Candle eggs — ${inc.name}`), add(days - 3, "Lockdown", `Lockdown: stop turning — ${inc.name}`), add(days, "Hatch day", `Expected hatch day — ${inc.name}`)]);
    alert("Added candling, lockdown, and hatch-day reminders.");
  };

  return (
    <div>
      <div className="flex justify-end mb-4"><Btn accent={accent} onClick={() => setModal({ data: {} })}><Plus size={16} /> New incubator</Btn></div>
      {incubators.length === 0 ? (
        <EmptyState icon={EggIcon} accent={accent} title="No incubators running" subtitle="Set one up to start tracking eggs through to hatch." onAction={() => setModal({ data: {} })} actionLabel="New incubator" />
      ) : (
        <div className="space-y-5">
          {incubators.map((inc) => (
            <IncubatorCard
              key={inc.id} inc={inc} accent={accent} breedingPairs={breedingPairs} chickens={chickens}
              onEdit={() => setModal({ data: inc })}
              onDelete={() => setConfirmDelete(inc.id)}
              onAddEggs={() => setEggModal({ incubatorId: inc.id })}
              onRemoveEgg={(eggId, reason) => setIncubators((arr) => arr.map((i) => i.id !== inc.id ? i : { ...i, eggs: i.eggs.map((e) => e.id === eggId ? { ...e, status: "removed", removedDate: todayStr(), removedReason: reason } : e) }))}
              onHatchEgg={(eggId) => setIncubators((arr) => arr.map((i) => i.id !== inc.id ? i : { ...i, eggs: i.eggs.map((e) => e.id === eggId ? { ...e, status: "hatched", hatchedDate: todayStr() } : e) }))}
              onAddToFlock={(egg) => setHatchModal({ incubatorId: inc.id, egg })}
              onAddReminders={() => addReminders(inc)}
              onUpdateNotes={(eggId, notes) => setIncubators((arr) => arr.map((i) => i.id !== inc.id ? i : { ...i, eggs: i.eggs.map((e) => (e.id === eggId ? { ...e, notes } : e)) }))}
              onDeleteEgg={(eggId) => setIncubators((arr) => arr.map((i) => i.id !== inc.id ? i : { ...i, eggs: i.eggs.filter((e) => e.id !== eggId) }))}
              onUpdateEgg={(eggId, updates) => setIncubators((arr) => arr.map((i) => i.id !== inc.id ? i : { ...i, eggs: i.eggs.map((e) => (e.id === eggId ? { ...e, ...updates } : e)) }))}
              onUpdateEggPhoto={(eggId, photo) => setIncubators((arr) => arr.map((i) => i.id !== inc.id ? i : { ...i, eggs: i.eggs.map((e) => (e.id === eggId ? { ...e, photo } : e)) }))}
            />
          ))}
        </div>
      )}
      {modal && <IncubatorForm accent={accent} initial={modal.data} onSave={saveIncubator} onClose={() => setModal(null)} />}
      {eggModal && (
        <EggBatchForm accent={accent} breedingPairs={breedingPairs} chickens={chickens} onClose={() => setEggModal(null)}
          onSave={(eggs) => { setIncubators((arr) => arr.map((i) => i.id === eggModal.incubatorId ? { ...i, eggs: [...i.eggs, ...eggs] } : i)); setEggModal(null); }} />
      )}
      {hatchModal && (
        <ChickenForm accent={accent}
          initial={{ breed: hatchModal.egg.breed, hatchDate: hatchModal.egg.hatchedDate || todayStr(), damId: hatchModal.egg.damId || "", sireId: hatchModal.egg.sireId || "", sex: "unknown", origin: "Hatched in my incubator" }}
          chickens={chickens} onClose={() => setHatchModal(null)}
          onSave={(data) => {
            const newId = uid();
            setChickens((cs) => [...cs, { ...data, id: newId, status: "active" }]);
            setIncubators((arr) => arr.map((i) => i.id !== hatchModal.incubatorId ? i : { ...i, eggs: i.eggs.map((e) => e.id === hatchModal.egg.id ? { ...e, addedToFlock: true, chickId: newId } : e) }));
            setHatchModal(null);
          }} />
      )}
      {confirmDelete && (
        <ConfirmDialog message="Delete this incubator and all its egg records? This cannot be undone." onConfirm={() => removeIncubator(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

function IncubatorCard({ inc, accent, breedingPairs, chickens, onEdit, onDelete, onAddEggs, onRemoveEgg, onHatchEgg, onAddToFlock, onAddReminders, onUpdateNotes, onDeleteEgg, onUpdateEgg, onUpdateEggPhoto }) {
  const [open, setOpen] = useState(true);
  const [reasonFor, setReasonFor] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [photoFor, setPhotoFor] = useState(null);
  const [editEgg, setEditEgg] = useState(null);
  const [confirmDeleteEgg, setConfirmDeleteEgg] = useState(null);
  const total = inc.eggs.length;
  const hatched = inc.eggs.filter((e) => e.status === "hatched").length;
  const removed = inc.eggs.filter((e) => e.status === "removed").length;
  const incubating = total - hatched - removed;
  const rate = total ? Math.round((hatched / total) * 100) : 0;
  const days = inc.incubationDays || 21;
  const orderedEggs = inc.eggs.slice().sort((a, b) => a.setDate.localeCompare(b.setDate));

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {inc.photo && (
            <img src={inc.photo} className="w-14 h-14 rounded-xl object-contain flex-shrink-0 border" style={{ background: "#fff", borderColor: "rgba(11,42,44,0.12)" }} alt="Carton" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => setOpen(!open)}><ChevronDown size={16} className={open ? "" : "-rotate-90"} style={{ transition: "transform .15s" }} /></button>
              <h3 className="font-bold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>{inc.name}</h3>
              <Badge bg={accent}>{inc.species || "Chicken"}</Badge>
            </div>
            <p className="text-xs ml-6" style={{ color: "var(--slate)" }}>Started {fmtDate(inc.startDate)} · {days}-day cycle</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <IconBtn icon={BellRing} onClick={onAddReminders} title="Add hatch reminders" accent="var(--teal)" />
          <IconBtn icon={Pencil} onClick={onEdit} title="Edit incubator" />
          <IconBtn icon={Trash2} onClick={onDelete} accent="var(--danger)" title="Delete incubator" />
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-3 flex-wrap">
        <StatPill label="Set" value={total} accent={accent} />
        <StatPill label="Incubating" value={incubating} accent="#8FBF7A" />
        <StatPill label="Hatched" value={hatched} accent="#4F8F52" />
        <StatPill label="Removed" value={removed} accent="#6B7561" />
        <StatPill label="Hatch rate" value={total ? rate + "%" : "—"} accent={accent} />
      </div>

      {open && (
        <div className="px-4 pb-4">
          <Btn accent={accent} variant="ghost" className="mb-3" onClick={onAddEggs}><Plus size={14} /> Add eggs</Btn>
          {inc.eggs.length === 0 ? <p className="text-sm" style={{ color: "var(--slate)" }}>No eggs set yet.</p> : (
            <div className="space-y-1.5">
              {orderedEggs.map((egg, idx) => {
                const dayCount = egg.status === "incubating" ? daysBetween(egg.setDate, todayStr()) : null;
                const glow = dayCount != null ? Math.max(0.14, Math.min(1, dayCount / days)) : 0;
                return (
                  <div key={egg.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg flex-wrap" style={{ background: "rgba(14,124,134,0.05)" }}>
                    <span className="text-xs font-mono font-bold w-5 text-right flex-shrink-0" style={{ color: "var(--slate)" }}>{idx + 1}</span>
                    <EggShape size={21} fill="#F5F1E6" glow={egg.status === "incubating" ? glow : 0} ring={egg.status === "hatched" ? "#4F8F52" : egg.status === "removed" ? "#6B7561" : null} />
                    {egg.photo && (
                      <button onClick={() => setPhotoFor(egg.id)} className="w-7 h-7 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: "rgba(11,42,44,0.15)" }} title="View egg photo">
                        <img src={egg.photo} className="w-full h-full object-contain" style={{ background: "#fff" }} />
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{egg.breed || "Unmarked breed"}</p>
                      <p className="text-xs font-mono" style={{ color: "var(--slate)" }}>
                        Set {fmtDate(egg.setDate)}
                        {egg.status === "incubating" && ` · day ${dayCount} of ${days}`}
                        {egg.status === "removed" && ` · removed (${egg.removedReason})`}
                        {egg.status === "hatched" && ` · hatched ${fmtDate(egg.hatchedDate)}`}
                      </p>
                      {egg.notes && <p className="text-xs italic truncate mt-0.5" style={{ color: accent }}>"{egg.notes}"</p>}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <IconBtn icon={Camera} accent={egg.photo ? accent : "var(--slate)"} title={egg.photo ? "View/replace egg photo" : "Add egg photo"} onClick={() => setPhotoFor(egg.id)} />
                      <IconBtn icon={StickyNote} accent={egg.notes ? accent : "var(--slate)"} title={egg.notes ? "Edit note" : "Add note"} onClick={() => setNoteFor(egg.id)} />
                      <IconBtn icon={Pencil} title="Edit egg" onClick={() => setEditEgg(egg)} />
                      <IconBtn icon={Trash2} accent="var(--danger)" title="Remove from incubator entirely" onClick={() => setConfirmDeleteEgg(egg.id)} />
                    </div>
                    {egg.status === "incubating" && (
                      <div className="flex gap-1">
                        <Btn accent="#4F8F52" className="!px-2 !py-1 !text-xs" onClick={() => onHatchEgg(egg.id)}>Hatched</Btn>
                        <Btn accent="#6B7561" variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => setReasonFor(egg.id)}>Remove</Btn>
                      </div>
                    )}
                    {egg.status === "hatched" && !egg.addedToFlock && <Btn accent={accent} className="!px-2 !py-1 !text-xs" onClick={() => onAddToFlock(egg)}><Link2 size={12} /> Add to flock</Btn>}
                    {egg.addedToFlock && <Badge bg="#4F8F52">in flock</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {reasonFor && (
        <Modal title="Why was this egg removed?" accent="#6B7561" onClose={() => setReasonFor(null)}>
          <div className="space-y-2">
            {REMOVAL_REASONS.map((r) => (
              <button key={r} onClick={() => { onRemoveEgg(reasonFor, r); setReasonFor(null); }} className="block w-full text-left px-3 py-2 rounded-xl hover:bg-black/5 text-sm" style={{ background: "rgba(11,42,44,0.04)" }}>{r}</button>
            ))}
          </div>
        </Modal>
      )}

      {noteFor && (
        <Modal title="Egg notes" accent={accent} onClose={() => setNoteFor(null)}>
          <EggNoteForm
            initial={inc.eggs.find((e) => e.id === noteFor)?.notes || ""}
            onSave={(notes) => { onUpdateNotes(noteFor, notes); setNoteFor(null); }}
            accent={accent}
          />
        </Modal>
      )}

      {photoFor && (
        <Modal title="Egg photo" accent={accent} onClose={() => setPhotoFor(null)}>
          <EggPhotoForm
            initial={inc.eggs.find((e) => e.id === photoFor)?.photo || null}
            onSave={(photo) => { onUpdateEggPhoto(photoFor, photo); setPhotoFor(null); }}
            accent={accent}
          />
        </Modal>
      )}

      {editEgg && (
        <Modal title="Edit egg" accent={accent} onClose={() => setEditEgg(null)}>
          <EggEditForm
            initial={editEgg}
            breedingPairs={breedingPairs}
            chickens={chickens}
            onSave={(updates) => { onUpdateEgg(editEgg.id, updates); setEditEgg(null); }}
            accent={accent}
          />
        </Modal>
      )}

      {confirmDeleteEgg && (
        <ConfirmDialog
          message="Remove this egg from the incubator entirely? This is different from marking it removed — it deletes the entry completely, for when one was added by mistake. This cannot be undone."
          onConfirm={() => { onDeleteEgg(confirmDeleteEgg); setConfirmDeleteEgg(null); }}
          onCancel={() => setConfirmDeleteEgg(null)}
        />
      )}
    </div>
  );
}

function EggEditForm({ initial, breedingPairs, chickens, onSave, accent }) {
  const [f, setF] = useState({ breed: "", setDate: todayStr(), breedingPairId: null, damId: null, sireId: null, ...initial });
  return (
    <div>
      <Field label="Linked breeding pair (optional)" hint="Changing this updates parentage for lineage tracking">
        <Select
          value={f.breedingPairId || ""}
          onChange={(e) => {
            const p = breedingPairs.find((bp) => bp.id === e.target.value);
            const hen = chickens.find((c) => c.id === p?.henId);
            setF({ ...f, breedingPairId: e.target.value || null, damId: p?.henId || null, sireId: p?.roosterId || null, breed: hen?.breed || f.breed });
          }}
        >
          <option value="">None</option>
          {breedingPairs.map((p) => {
            const r = chickens.find((c) => c.id === p.roosterId);
            const h = chickens.find((c) => c.id === p.henId);
            return <option key={p.id} value={p.id}>{r?.name || "?"} × {h?.name || "?"}</option>;
          })}
        </Select>
      </Field>
      <Field label="Breed"><TextInput value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} placeholder="Olive Egger" /></Field>
      <Field label="Set date"><DateInput value={f.setDate} onChange={(v) => setF({ ...f, setDate: v })} /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save changes</Btn>
      </div>
    </div>
  );
}

function EggNoteForm({ initial, onSave, accent }) {
  const [text, setText] = useState(initial);
  return (
    <div>
      <Field label="Notes" hint="e.g. saddle air cell, hairline crack, extra dark shell...">
        <TextArea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Observations from candling, handling, etc." />
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn accent={accent} onClick={() => onSave(text)}><Check size={15} /> Save note</Btn>
      </div>
    </div>
  );
}

function EggPhotoForm({ initial, onSave, accent }) {
  const [photo, setPhoto] = useState(initial);
  return (
    <div>
      <PhotoSlot value={photo} onChange={setPhoto} label="Egg photo" shape="square" fit="contain" />
      <div className="flex justify-end gap-2 mt-3">
        <Btn accent={accent} onClick={() => onSave(photo)}><Check size={15} /> Save</Btn>
      </div>
    </div>
  );
}

function IncubatorForm({ accent, initial, onSave, onClose }) {
  const [f, setF] = useState({ name: "", species: "Chicken", incubationDays: 21, startDate: todayStr(), photo: null, ...initial });
  return (
    <Modal title={initial.id ? "Edit incubator" : "New incubator"} accent={accent} onClose={onClose}>
      <Field label="Name"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Incubator 1" /></Field>
      <Field label="Species">
        <Select value={f.species} onChange={(e) => { const preset = SPECIES_PRESETS.find((s) => s.name === e.target.value); setF({ ...f, species: e.target.value, incubationDays: preset ? preset.days : f.incubationDays }); }}>
          {SPECIES_PRESETS.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Incubation length (days)"><TextInput type="number" value={f.incubationDays} onChange={(e) => setF({ ...f, incubationDays: +e.target.value })} /></Field>
      <Field label="Start date"><DateInput value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} /></Field>
      <div className="mb-3">
        <PhotoSlot value={f.photo} onChange={(v) => setF({ ...f, photo: v })} label="Carton photo (optional)" shape="square" fit="contain" />
      </div>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="ghost" accent="rgba(11,42,44,0.5)" onClick={onClose}>Cancel</Btn>
        <Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save</Btn>
      </div>
    </Modal>
  );
}

function EggBatchForm({ accent, breedingPairs, chickens, onSave, onClose }) {
  const [f, setF] = useState({ breedingPairId: "", breed: "", quantity: 1, setDate: todayStr() });
  const pair = breedingPairs.find((p) => p.id === f.breedingPairId);
  return (
    <Modal title="Add eggs to incubator" accent={accent} onClose={onClose}>
      <Field label="Linked breeding pair (optional)" hint="Auto-fills breed and parentage for lineage tracking">
        <Select value={f.breedingPairId} onChange={(e) => { const p = breedingPairs.find((bp) => bp.id === e.target.value); const hen = chickens.find((c) => c.id === p?.henId); setF({ ...f, breedingPairId: e.target.value, breed: hen?.breed || f.breed }); }}>
          <option value="">None</option>
          {breedingPairs.map((p) => { const r = chickens.find((c) => c.id === p.roosterId); const h = chickens.find((c) => c.id === p.henId); return <option key={p.id} value={p.id}>{r?.name || "?"} × {h?.name || "?"}</option>; })}
        </Select>
      </Field>
      <Field label="Breed"><TextInput value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} placeholder="Olive Egger" /></Field>
      <Field label="Quantity"><TextInput type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: +e.target.value })} /></Field>
      <Field label="Set date"><DateInput value={f.setDate} onChange={(v) => setF({ ...f, setDate: v })} /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn variant="ghost" accent="rgba(11,42,44,0.5)" onClick={onClose}>Cancel</Btn>
        <Btn accent={accent} onClick={() => { const eggs = Array.from({ length: Math.max(1, f.quantity) }, () => ({ id: uid(), breed: f.breed, setDate: f.setDate, status: "incubating", breedingPairId: f.breedingPairId || null, damId: pair?.henId || null, sireId: pair?.roosterId || null, addedToFlock: false, notes: "", photo: null })); onSave(eggs); }}>
          <Check size={15} /> Add {f.quantity} egg{f.quantity == 1 ? "" : "s"}
        </Btn>
      </div>
    </Modal>
  );
}

/* ===================================================================== */
/*                              BREEDING TAB                             */
/* ===================================================================== */

function BreedingTab({ breedingPairs, setBreedingPairs, chickens }) {
  const accent = "#6B9C5E";
  const [modal, setModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const hens = chickens.filter((c) => c.sex === "hen" && c.status !== "deceased");
  const roosters = chickens.filter((c) => c.sex === "rooster" && c.status !== "deceased");

  const save = (data) => {
    if (data.id) setBreedingPairs((p) => p.map((x) => (x.id === data.id ? data : x)));
    else setBreedingPairs((p) => [...p, { ...data, id: uid(), createdDate: todayStr() }]);
    setModal(null);
  };
  const remove = (id) => { setBreedingPairs((p) => p.filter((x) => x.id !== id)); setConfirmDelete(null); };

  return (
    <div>
      <div className="flex justify-end mb-4"><Btn accent={accent} onClick={() => setModal({ data: {} })}><Plus size={16} /> New pair</Btn></div>
      {breedingPairs.length === 0 ? (
        <EmptyState icon={Heart} accent={accent} title="No breeding pairs yet" subtitle="Pair a rooster and hen to plan for target traits or egg colors." onAction={() => setModal({ data: {} })} actionLabel="New pair" />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
          {breedingPairs.map((p) => {
            const rooster = chickens.find((c) => c.id === p.roosterId);
            const hen = chickens.find((c) => c.id === p.henId);
            const offspring = chickens.filter((c) => c.damId === p.henId && c.sireId === p.roosterId);
            return (
              <div key={p.id} className="rounded-2xl p-4 bg-white shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <Badge bg={p.status === "retired" ? "#6B7561" : accent}>{p.status || "active"}</Badge>
                  <div className="flex gap-1">
                    <IconBtn icon={Pencil} onClick={() => setModal({ data: p })} />
                    <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => setConfirmDelete(p.id)} />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 mx-auto" style={{ borderColor: "#3F6B4A" }}>
                      {rooster?.photo ? <img src={rooster.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={18} /></div>}
                    </div>
                    <p className="text-xs font-bold mt-1">{rooster?.name || "?"}</p>
                  </div>
                  <Heart size={16} style={{ color: accent }} className="rotate-12" />
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 mx-auto" style={{ borderColor: "#8FBF7A" }}>
                      {hen?.photo ? <img src={hen.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={18} /></div>}
                    </div>
                    <p className="text-xs font-bold mt-1">{hen?.name || "?"}</p>
                  </div>
                </div>
                {p.targetEggColor && (
                  <div className="flex items-center justify-center gap-1.5 text-xs mb-2" style={{ color: "var(--slate)" }}>
                    Target egg color: <EggShape size={11} fill={eggColorHex(p.targetEggColor)} /> {p.targetEggColor}
                  </div>
                )}
                {p.goalNotes && <p className="text-xs italic text-center mb-2" style={{ color: "var(--slate)" }}>"{p.goalNotes}"</p>}
                <div className="text-center text-xs font-mono mt-2 pt-2" style={{ borderTop: "1px solid rgba(11,42,44,0.08)", color: accent }}>
                  {offspring.length} chick{offspring.length === 1 ? "" : "s"} hatched
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && (
        <Modal title={modal.data.id ? "Edit pair" : "New breeding pair"} accent={accent} onClose={() => setModal(null)}>
          <PairForm initial={modal.data} hens={hens} roosters={roosters} onSave={save} accent={accent} />
        </Modal>
      )}
      {confirmDelete && <ConfirmDialog message="Delete this breeding pair?" onConfirm={() => remove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

function PairForm({ initial, hens, roosters, onSave, accent }) {
  const [f, setF] = useState({ roosterId: "", henId: "", goalNotes: "", targetEggColor: "", status: "active", ...initial });
  return (
    <div>
      <Field label="Rooster">
        <Select value={f.roosterId} onChange={(e) => setF({ ...f, roosterId: e.target.value })}>
          <option value="">Select rooster</option>{roosters.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.breed})</option>)}
        </Select>
      </Field>
      <Field label="Hen">
        <Select value={f.henId} onChange={(e) => setF({ ...f, henId: e.target.value })}>
          <option value="">Select hen</option>{hens.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.breed}{h.eggColor ? `, ${h.eggColor}` : ""})</option>)}
        </Select>
      </Field>
      <Field label="Target egg color">
        <Select value={f.targetEggColor} onChange={(e) => setF({ ...f, targetEggColor: e.target.value })}>
          <option value="">No target</option>{EGG_COLORS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Breeding goal / notes"><TextArea value={f.goalNotes} onChange={(e) => setF({ ...f, goalNotes: e.target.value })} placeholder="Working toward olive eggers with better feathering..." /></Field>
      <Field label="Status">
        <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="active">Active</option><option value="retired">Retired</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2 mt-2"><Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save pair</Btn></div>
    </div>
  );
}

/* ===================================================================== */
/*                              EGG LOG TAB                              */
/* ===================================================================== */

function EggLogTab({ eggLogs, setEggLogs, chickens }) {
  const accent = "#3F9A6B";
  const [section, setSection] = useState("calendar");
  const [monthOffset, setMonthOffset] = useState(0);
  const [pen, setPen] = useState("all");
  const [dayModal, setDayModal] = useState(null);
  const pens = useMemo(() => [...new Set(chickens.map((c) => c.pen).filter(Boolean))], [chickens]);
  const hens = useMemo(() => chickens.filter((c) => c.sex === "hen" && c.status !== "deceased" && c.status !== "sold"), [chickens]);

  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const countFor = (d) => { const ds = dateStr(d); return eggLogs.filter((l) => l.date === ds && (pen === "all" || l.pen === pen)).reduce((s, l) => s + (l.count || 0), 0); };
  const monthTotal = Array.from({ length: daysInMonth }, (_, i) => countFor(i + 1)).reduce((a, b) => a + b, 0);
  const maxDay = Math.max(1, ...Array.from({ length: daysInMonth }, (_, i) => countFor(i + 1)));

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const today = todayStr();
  const henStats = hens.map((h) => {
    const henEntries = eggLogs.filter((l) => l.henId === h.id);
    const totalAllTime = henEntries.reduce((s, l) => s + (l.count || 0), 0);
    const totalThisMonth = henEntries.filter((l) => l.date.startsWith(monthPrefix)).reduce((s, l) => s + (l.count || 0), 0);
    const lastEntry = henEntries.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const daysSince = lastEntry ? daysBetween(lastEntry.date, today) : null;
    return { hen: h, totalAllTime, totalThisMonth, lastDate: lastEntry?.date || null, daysSince };
  }).sort((a, b) => {
    if (a.daysSince == null && b.daysSince == null) return 0;
    if (a.daysSince == null) return 1;
    if (b.daysSince == null) return -1;
    return b.daysSince - a.daysSince;
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Btn variant={section === "calendar" ? "solid" : "ghost"} accent={accent} onClick={() => setSection("calendar")}>Calendar</Btn>
        <Btn variant={section === "byHen" ? "solid" : "ghost"} accent={accent} onClick={() => setSection("byHen")}>By Hen</Btn>
      </div>

      {section === "calendar" && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <IconBtn icon={ChevronLeft} onClick={() => setMonthOffset((m) => m - 1)} />
              <h3 className="font-bold text-lg w-44 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>{monthLabel}</h3>
              <IconBtn icon={ChevronRight} onClick={() => setMonthOffset((m) => m + 1)} />
            </div>
            <Select value={pen} onChange={(e) => setPen(e.target.value)} className="!w-auto text-sm">
              <option value="all">All pens</option>{pens.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <StatPill label="Eggs this month" value={monthTotal} accent={accent} />
            <StatPill label="Daily average" value={(monthTotal / daysInMonth).toFixed(1)} accent={accent} />
            <StatPill label="Best day" value={maxDay} accent={accent} />
          </div>

          <div className="bg-white rounded-2xl p-3 shadow-sm grid gap-2.5" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const c = countFor(d);
              const intensity = Math.min(1, c / Math.max(1, maxDay));
              return (
                <button key={d} onClick={() => setDayModal({ date: dateStr(d), day: d })} className="flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-black/5 transition-colors">
                  <EggShape size={26} fill={c === 0 ? "#F5F1E6" : accent} glow={c === 0 ? 0 : intensity * 0.6} />
                  <span className="text-[10px] font-mono" style={{ color: "var(--slate)" }}>{d}</span>
                  {c > 0 && <span className="text-xs font-bold font-mono" style={{ color: accent }}>{c}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {section === "byHen" && (
        <div className="space-y-2">
          {hens.length === 0 ? (
            <EmptyState icon={Bird} accent={accent} title="No hens yet" subtitle="Add hens to your flock to start tracking who's laying." />
          ) : henStats.map(({ hen, totalAllTime, totalThisMonth, lastDate, daysSince }) => {
            const flagged = daysSince != null && daysSince > 7;
            return (
              <div key={hen.id} className="rounded-xl p-3 bg-white shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden border flex-shrink-0" style={{ borderColor: sexBorderColor(hen.sex) }}>
                    {hen.photo ? <img src={hen.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={14} /></div>}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{hen.name}</p>
                    <p className="text-xs" style={{ color: "var(--slate)" }}>{totalThisMonth} this month · {totalAllTime} all time</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {lastDate ? (
                    <p className="text-xs font-mono" style={{ color: flagged ? "var(--danger)" : accent }}>
                      Last laid {fmtDate(lastDate)}{flagged ? ` · ${daysSince}d ago` : ""}
                    </p>
                  ) : <p className="text-xs" style={{ color: "var(--slate)" }}>No eggs logged yet</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dayModal && (
        <DayLogModal date={dayModal.date} accent={accent} pens={pens} chickens={chickens} entries={eggLogs.filter((l) => l.date === dayModal.date)} onClose={() => setDayModal(null)}
          onAdd={(entry) => setEggLogs((arr) => [...arr, { ...entry, id: uid(), date: dayModal.date }])}
          onDelete={(id) => setEggLogs((arr) => arr.filter((l) => l.id !== id))} />
      )}
    </div>
  );
}

function DayLogModal({ date, accent, pens, chickens, entries, onClose, onAdd, onDelete }) {
  const hens = chickens.filter((c) => c.sex === "hen" && c.status !== "deceased" && c.status !== "sold");
  const [mode, setMode] = useState("pen");
  const [f, setF] = useState({ pen: pens[0] || "", henId: "", count: 1, notes: "" });

  const handleAdd = () => {
    if (mode === "hen") {
      if (!f.henId) { alert("Select a hen first."); return; }
      const hen = chickens.find((c) => c.id === f.henId);
      onAdd({ henId: f.henId, pen: hen?.pen || "", count: f.count, notes: f.notes });
    } else {
      onAdd({ pen: f.pen, henId: null, count: f.count, notes: f.notes });
    }
  };

  return (
    <Modal title={fmtDate(date)} accent={accent} onClose={onClose}>
      {entries.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {entries.map((e) => {
            const hen = e.henId ? chickens.find((c) => c.id === e.henId) : null;
            return (
              <div key={e.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg" style={{ background: "rgba(20,163,163,0.06)" }}>
                <span>{hen ? hen.name : (e.pen || "General")} — <span className="font-mono font-bold">{e.count}</span> eggs{e.notes ? ` · ${e.notes}` : ""}</span>
                <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => onDelete(e.id)} />
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs font-bold uppercase mb-1.5" style={{ color: "var(--teal)" }}>Add entry</p>
      <Select value={mode} onChange={(e) => setMode(e.target.value)} className="mb-2">
        <option value="pen">Log by pen</option>
        <option value="hen">Log by hen</option>
      </Select>
      <div className="flex gap-2 mb-2">
        {mode === "pen" ? (
          <TextInput value={f.pen} onChange={(e) => setF({ ...f, pen: e.target.value })} placeholder="Pen name" />
        ) : (
          <Select value={f.henId} onChange={(e) => setF({ ...f, henId: e.target.value })}>
            <option value="">Select hen</option>
            {hens.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        )}
        <TextInput type="number" min={0} className="!w-24" value={f.count} onChange={(e) => setF({ ...f, count: +e.target.value })} />
      </div>
      <TextInput value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional)" className="mb-3" />
      <Btn accent={accent} onClick={handleAdd}><Plus size={14} /> Add</Btn>
    </Modal>
  );
}

/* ===================================================================== */
/*                             ECONOMICS TAB                              */
/* ===================================================================== */

const COST_CATEGORIES = ["Feed", "Bedding", "Medication", "Equipment", "Supplies", "Other"];

function EconomicsTab({ feedCosts, setFeedCosts, eggSales, setEggSales, birdSales, setBirdSales, eggLogs, chickens, setChickens }) {
  const accent = "#8C6D3F";
  const [section, setSection] = useState("overview");
  const [costModal, setCostModal] = useState(null);
  const [saleModal, setSaleModal] = useState(null);
  const [birdSaleModal, setBirdSaleModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const sellable = chickens.filter((c) => c.status === "active" || !c.status);

  const totalSpent = feedCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const eggRevenue = eggSales.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const birdRevenue = birdSales.reduce((s, c) => s + (Number(c.price) || 0), 0);
  const totalEarned = eggRevenue + birdRevenue;
  const net = totalEarned - totalSpent;
  const totalEggsLogged = eggLogs.reduce((s, l) => s + (l.count || 0), 0);
  const costPerDozen = totalEggsLogged > 0 ? (totalSpent / (totalEggsLogged / 12)).toFixed(2) : null;
  const totalEggsSold = eggSales.reduce((s, c) => s + (Number(c.count) || 0), 0);

  const saveCost = (data) => { if (data.id) setFeedCosts((c) => c.map((x) => (x.id === data.id ? data : x))); else setFeedCosts((c) => [...c, { ...data, id: uid() }]); setCostModal(null); };
  const saveSale = (data) => { if (data.id) setEggSales((c) => c.map((x) => (x.id === data.id ? data : x))); else setEggSales((c) => [...c, { ...data, id: uid() }]); setSaleModal(null); };
  const saveBirdSale = (data) => {
    if (data.id) {
      setBirdSales((c) => c.map((x) => (x.id === data.id ? data : x)));
    } else {
      setBirdSales((c) => [...c, { ...data, id: uid() }]);
      if (data.chickenId) setChickens((cs) => cs.map((c) => (c.id === data.chickenId ? { ...c, status: "sold" } : c)));
    }
    setBirdSaleModal(null);
  };
  const removeCost = (id) => { setFeedCosts((c) => c.filter((x) => x.id !== id)); setConfirmDelete(null); };
  const removeSale = (id) => { setEggSales((c) => c.filter((x) => x.id !== id)); setConfirmDelete(null); };
  const removeBirdSale = (id) => { setBirdSales((c) => c.filter((x) => x.id !== id)); setConfirmDelete(null); };

  const sortedCosts = feedCosts.slice().sort((a, b) => b.date.localeCompare(a.date));
  const sortedSales = eggSales.slice().sort((a, b) => b.date.localeCompare(a.date));
  const sortedBirdSales = birdSales.slice().sort((a, b) => b.date.localeCompare(a.date));

  const exportCSV = () => {
    const escape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [];
    feedCosts.forEach((c) => rows.push([c.date, "Expense", c.category, (-(Number(c.amount) || 0)).toFixed(2), c.notes || ""]));
    eggSales.forEach((s) => rows.push([s.date, "Egg Sale", `Sold to ${s.customer || "walk-in"} (${s.count || 0} eggs)`, (Number(s.amount) || 0).toFixed(2), s.notes || ""]));
    birdSales.forEach((s) => {
      const bird = chickens.find((c) => c.id === s.chickenId);
      rows.push([s.date, "Bird Sale", `${bird?.name || s.birdName || "Unknown bird"} sold to ${s.buyer || "—"}`, (Number(s.price) || 0).toFixed(2), s.notes || ""]);
    });
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    const csv = [["Date", "Type", "Description", "Amount", "Notes"], ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flockforge-economics-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <StatPill label="Total spent" value={`$${totalSpent.toFixed(2)}`} accent="#C8493C" />
        <StatPill label="Total earned" value={`$${totalEarned.toFixed(2)}`} accent="#4F8F52" />
        <StatPill label="Net" value={`${net >= 0 ? "+$" : "-$"}${Math.abs(net).toFixed(2)}`} accent={net >= 0 ? "#4F8F52" : "#C8493C"} />
        <StatPill label="Cost / dozen" value={costPerDozen ? `$${costPerDozen}` : "—"} accent={accent} />
      </div>

      <div className="flex gap-2 mb-2 flex-wrap">
        <Btn variant={section === "overview" ? "solid" : "ghost"} accent={accent} onClick={() => setSection("overview")}>Overview</Btn>
        <Btn variant={section === "costs" ? "solid" : "ghost"} accent={accent} onClick={() => setSection("costs")}>Expenses</Btn>
        <Btn variant={section === "sales" ? "solid" : "ghost"} accent={accent} onClick={() => setSection("sales")}>Egg Sales</Btn>
        <Btn variant={section === "birdSales" ? "solid" : "ghost"} accent={accent} onClick={() => setSection("birdSales")}>Bird Sales</Btn>
      </div>
      <div className="flex justify-end mb-4">
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" style={{ color: accent, background: accent + "12" }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {section === "overview" && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex justify-between text-sm"><span style={{ color: "var(--slate)" }}>Eggs logged (all time)</span><span className="font-mono font-bold">{totalEggsLogged}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: "var(--slate)" }}>Eggs sold (all time)</span><span className="font-mono font-bold">{totalEggsSold}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: "var(--slate)" }}>Birds sold (all time)</span><span className="font-mono font-bold">{birdSales.length}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: "var(--slate)" }}>Expense entries</span><span className="font-mono font-bold">{feedCosts.length}</span></div>
          <p className="text-xs pt-1" style={{ color: "var(--slate)" }}>Switch tabs above to add entries. Cost-per-dozen factors in every egg logged in your Egg Log, whether sold or not. Bird-sale income counts toward Net but not toward Cost/dozen.</p>
        </div>
      )}

      {section === "costs" && (
        <div>
          <div className="flex justify-end mb-3"><Btn accent={accent} onClick={() => setCostModal({ data: {} })}><Plus size={15} /> Add expense</Btn></div>
          {sortedCosts.length === 0 ? (
            <EmptyState icon={Wallet} accent={accent} title="No expenses logged" subtitle="Track feed, bedding, and supply costs to see your real cost per dozen." onAction={() => setCostModal({ data: {} })} actionLabel="Add expense" />
          ) : (
            <div className="space-y-2">
              {sortedCosts.map((c) => (
                <div key={c.id} className="rounded-xl p-3 bg-white shadow-sm flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{c.category} <span style={{ color: "var(--slate)" }}>· ${Number(c.amount).toFixed(2)}</span></p>
                    {c.notes && <p className="text-sm" style={{ color: "var(--ink)" }}>{c.notes}</p>}
                    <p className="text-xs font-mono mt-1" style={{ color: "var(--slate)" }}>{fmtDate(c.date)}</p>
                  </div>
                  <div className="flex gap-1">
                    <IconBtn icon={Pencil} onClick={() => setCostModal({ data: c })} />
                    <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => setConfirmDelete({ type: "cost", id: c.id })} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "sales" && (
        <div>
          <div className="flex justify-end mb-3"><Btn accent={accent} onClick={() => setSaleModal({ data: {} })}><Plus size={15} /> Add sale</Btn></div>
          {sortedSales.length === 0 ? (
            <EmptyState icon={ShoppingBasket} accent={accent} title="No egg sales logged" subtitle="Track who buys your eggs and how much they pay." onAction={() => setSaleModal({ data: {} })} actionLabel="Add sale" />
          ) : (
            <div className="space-y-2">
              {sortedSales.map((s) => (
                <div key={s.id} className="rounded-xl p-3 bg-white shadow-sm flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{s.customer || "Walk-in"} <span style={{ color: "var(--slate)" }}>· {s.count} eggs · ${Number(s.amount).toFixed(2)}</span></p>
                    {s.notes && <p className="text-sm" style={{ color: "var(--ink)" }}>{s.notes}</p>}
                    <p className="text-xs font-mono mt-1" style={{ color: "var(--slate)" }}>{fmtDate(s.date)}</p>
                  </div>
                  <div className="flex gap-1">
                    <IconBtn icon={Pencil} onClick={() => setSaleModal({ data: s })} />
                    <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => setConfirmDelete({ type: "sale", id: s.id })} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "birdSales" && (
        <div>
          <div className="flex justify-end mb-3"><Btn accent={accent} onClick={() => setBirdSaleModal({ data: {} })}><Plus size={15} /> Sell a bird</Btn></div>
          {sortedBirdSales.length === 0 ? (
            <EmptyState icon={Bird} accent={accent} title="No birds sold yet" subtitle="When you sell a bird you don't want, log who bought it and for how much." onAction={() => setBirdSaleModal({ data: {} })} actionLabel="Sell a bird" />
          ) : (
            <div className="space-y-2">
              {sortedBirdSales.map((s) => {
                const bird = chickens.find((c) => c.id === s.chickenId);
                return (
                  <div key={s.id} className="rounded-xl p-3 bg-white shadow-sm flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-sm">{bird?.name || s.birdName || "Unknown bird"} <span style={{ color: "var(--slate)" }}>· sold to {s.buyer || "—"} · ${Number(s.price).toFixed(2)}</span></p>
                      {s.notes && <p className="text-sm" style={{ color: "var(--ink)" }}>{s.notes}</p>}
                      <p className="text-xs font-mono mt-1" style={{ color: "var(--slate)" }}>{fmtDate(s.date)}</p>
                    </div>
                    <div className="flex gap-1">
                      <IconBtn icon={Pencil} onClick={() => setBirdSaleModal({ data: s })} />
                      <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => setConfirmDelete({ type: "birdSale", id: s.id })} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {costModal && (
        <Modal title={costModal.data.id ? "Edit expense" : "Add expense"} accent={accent} onClose={() => setCostModal(null)}>
          <CostForm initial={costModal.data} onSave={saveCost} accent={accent} />
        </Modal>
      )}
      {saleModal && (
        <Modal title={saleModal.data.id ? "Edit sale" : "Add sale"} accent={accent} onClose={() => setSaleModal(null)}>
          <SaleForm initial={saleModal.data} onSave={saveSale} accent={accent} />
        </Modal>
      )}
      {birdSaleModal && (
        <Modal title={birdSaleModal.data.id ? "Edit bird sale" : "Sell a bird"} accent={accent} onClose={() => setBirdSaleModal(null)}>
          <BirdSaleForm initial={birdSaleModal.data} chickens={sellable} onSave={saveBirdSale} accent={accent} />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.type === "birdSale" ? "Delete this bird sale record?" : "Are you sure?"}
          message={
            confirmDelete.type === "cost" ? "Delete this expense record?"
            : confirmDelete.type === "sale" ? "Delete this egg sale record?"
            : "This deletes the sale record, but does not move the bird back to your active flock — edit the bird directly if you need to undo that."
          }
          onConfirm={() => (confirmDelete.type === "cost" ? removeCost(confirmDelete.id) : confirmDelete.type === "sale" ? removeSale(confirmDelete.id) : removeBirdSale(confirmDelete.id))}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function CostForm({ initial, onSave, accent }) {
  const [f, setF] = useState({ category: "Feed", amount: "", date: todayStr(), notes: "", ...initial });
  return (
    <div>
      <Field label="Category">
        <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Amount ($)"><TextInput type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="42.50" /></Field>
      <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="50lb bag of layer feed, Tractor Supply" /></Field>
      <div className="flex justify-end gap-2 mt-2"><Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save</Btn></div>
    </div>
  );
}

function SaleForm({ initial, onSave, accent }) {
  const [f, setF] = useState({ customer: "", count: "", amount: "", date: todayStr(), notes: "", ...initial });
  return (
    <div>
      <Field label="Customer"><TextInput value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} placeholder="Sarah next door" /></Field>
      <Field label="Eggs sold"><TextInput type="number" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} placeholder="12" /></Field>
      <Field label="Amount received ($)"><TextInput type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="6.00" /></Field>
      <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-2"><Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save</Btn></div>
    </div>
  );
}

function BirdSaleForm({ initial, chickens, onSave, accent }) {
  const isEdit = !!initial.id;
  const [f, setF] = useState({ chickenId: "", buyer: "", price: "", date: todayStr(), notes: "", ...initial });
  return (
    <div>
      <Field label="Bird" hint={isEdit ? null : "Selling a bird moves it out of your active flock, just like marking a loss — but it shows up here as a sale, not in Mortality."}>
        <Select value={f.chickenId} onChange={(e) => setF({ ...f, chickenId: e.target.value })} disabled={isEdit}>
          <option value="">Select bird</option>
          {chickens.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.breed || "unknown breed"})</option>)}
        </Select>
      </Field>
      <Field label="Sold to"><TextInput value={f.buyer} onChange={(e) => setF({ ...f, buyer: e.target.value })} placeholder="Jane from the swap meet" /></Field>
      <Field label="Price ($)"><TextInput type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="25.00" /></Field>
      <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Rehomed with laying flock, picked up at the farm" /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn
          accent={accent}
          onClick={() => {
            if (!isEdit && !f.chickenId) { alert("Select which bird was sold."); return; }
            onSave(f);
          }}
        >
          <Check size={15} /> {isEdit ? "Save" : "Log sale"}
        </Btn>
      </div>
    </div>
  );
}

/* ===================================================================== */
/*                               HEALTH TAB                              */
/* ===================================================================== */

function HealthTab({ healthRecords, setHealthRecords, chickens }) {
  const accent = "#3F6B4A";
  const [modal, setModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterChicken, setFilterChicken] = useState("all");
  const active = chickens.filter((c) => c.status !== "deceased");
  const pens = useMemo(() => [...new Set(active.map((c) => c.pen).filter(Boolean))], [active]);
  const records = healthRecords.filter((r) => filterChicken === "all" || r.chickenId === filterChicken).slice().sort((a, b) => b.date.localeCompare(a.date));

  const save = (data) => {
    if (data.id) {
      setHealthRecords((r) => r.map((x) => (x.id === data.id ? data : x)));
    } else if (data.targetType === "pen" && data.pen) {
      const { targetType, pen, ...shared } = data;
      const penBirds = active.filter((c) => c.pen === pen);
      const newRecords = penBirds.map((c) => ({ ...shared, chickenId: c.id, id: uid() }));
      setHealthRecords((r) => [...r, ...newRecords]);
    } else {
      setHealthRecords((r) => [...r, { ...data, id: uid() }]);
    }
    setModal(null);
  };
  const remove = (id) => { setHealthRecords((r) => r.filter((x) => x.id !== id)); setConfirmDelete(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Select value={filterChicken} onChange={(e) => setFilterChicken(e.target.value)} className="!w-auto text-sm">
          <option value="all">All birds</option>{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Btn accent={accent} onClick={() => setModal({ data: {} })}><Plus size={16} /> Add record</Btn>
      </div>
      {records.length === 0 ? (
        <EmptyState icon={Stethoscope} accent={accent} title="No health records yet" subtitle="Log vaccinations, treatments, and checkups to keep a vet-ready history." onAction={() => setModal({ data: {} })} actionLabel="Add record" />
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const bird = chickens.find((c) => c.id === r.chickenId);
            const overdue = r.nextDueDate && r.nextDueDate < todayStr();
            return (
              <div key={r.id} className="rounded-xl p-3 bg-white shadow-sm flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-sm">{bird?.name || "Unknown bird"} <span style={{ color: "var(--slate)" }}>· {r.type}</span></p>
                  {r.description && <p className="text-sm" style={{ color: "var(--ink)" }}>{r.description}</p>}
                  <p className="text-xs font-mono mt-1" style={{ color: "var(--slate)" }}>
                    {fmtDate(r.date)}{r.weight ? ` · ${r.weight} lb` : ""}
                    {r.nextDueDate && <span style={{ color: overdue ? "var(--danger)" : accent }}> · next due {fmtDate(r.nextDueDate)}</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <IconBtn icon={Pencil} onClick={() => setModal({ data: r })} />
                  <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => setConfirmDelete(r.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <Modal title={modal.data.id ? "Edit health record" : "Add health record"} accent={accent} onClose={() => setModal(null)}><HealthForm initial={modal.data} chickens={active} pens={pens} onSave={save} accent={accent} /></Modal>}
      {confirmDelete && <ConfirmDialog message="Delete this health record?" onConfirm={() => remove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

function HealthForm({ initial, chickens, pens, onSave, accent }) {
  const isEdit = !!initial.id;
  const [f, setF] = useState({ chickenId: "", type: "Checkup", date: todayStr(), description: "", weight: "", nextDueDate: "", targetType: "bird", pen: "", ...initial });
  const affectedCount = f.targetType === "pen" && f.pen ? chickens.filter((c) => c.pen === f.pen).length : 0;

  return (
    <div>
      {!isEdit && (
        <Field label="Apply to">
          <Select value={f.targetType} onChange={(e) => setF({ ...f, targetType: e.target.value, chickenId: "", pen: "" })}>
            <option value="bird">A single bird</option>
            <option value="pen">A whole pen</option>
          </Select>
        </Field>
      )}
      {!isEdit && f.targetType === "pen" ? (
        <Field label="Pen" hint={f.pen ? `Will log this for ${affectedCount} bird${affectedCount === 1 ? "" : "s"} in ${f.pen}.` : "Creates one record for every active bird in the pen"}>
          <Select value={f.pen} onChange={(e) => setF({ ...f, pen: e.target.value })}>
            <option value="">Select pen</option>
            {pens.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label="Bird">
          <Select value={f.chickenId} onChange={(e) => setF({ ...f, chickenId: e.target.value })}>
            <option value="">Select bird</option>{chickens.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Type">
        <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{HEALTH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
      </Field>
      <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="Description"><TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Wormed with Safe-Guard, dosage..." /></Field>
      <Field label="Weight (lb, optional)"><TextInput type="number" step="0.1" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field>
      <Field label="Next due date (optional)"><DateInput value={f.nextDueDate} onChange={(v) => setF({ ...f, nextDueDate: v })} /></Field>
      <div className="flex justify-end gap-2 mt-2">
        <Btn
          accent={accent}
          onClick={() => {
            if (!isEdit && f.targetType === "pen" && !f.pen) { alert("Select a pen first."); return; }
            onSave(f);
          }}
        >
          <Check size={15} /> {f.targetType === "pen" && !isEdit ? "Log for pen" : "Save record"}
        </Btn>
      </div>
    </div>
  );
}

/* ===================================================================== */
/*                              LINEAGE TAB                              */
/* ===================================================================== */

function LineageTab({ chickens }) {
  const accent = "#2E4F33";
  const roots = chickens.filter((c) => !c.damId && !c.sireId);
  if (chickens.length === 0) return <EmptyState icon={GitBranch} accent={accent} title="No lineage data yet" subtitle="Add parents when entering birds to build a family tree." />;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-1">
      <p className="text-sm mb-3" style={{ color: "var(--slate)" }}>Birds with no recorded parents are shown as roots. Expand to see their offspring.</p>
      {roots.map((c) => <TreeNode key={c.id} chicken={c} all={chickens} accent={accent} depth={0} />)}
    </div>
  );
}

function TreeNode({ chicken, all, accent, depth }) {
  const [open, setOpen] = useState(depth < 1);
  const children = all.filter((c) => c.damId === chicken.id || c.sireId === chicken.id);
  return (
    <div style={{ marginLeft: depth ? 20 : 0, borderLeft: depth ? "2px solid rgba(11,42,44,0.1)" : "none", paddingLeft: depth ? 14 : 0 }}>
      <div className="flex items-center gap-2 py-1.5">
        {children.length > 0 ? <button onClick={() => setOpen(!open)}><ChevronDown size={14} className={open ? "" : "-rotate-90"} style={{ transition: "transform .15s" }} /></button> : <span className="w-3.5" />}
        <div className="w-7 h-7 rounded-full overflow-hidden border flex-shrink-0" style={{ borderColor: sexBorderColor(chicken.sex) }}>
          {chicken.photo ? <img src={chicken.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={12} /></div>}
        </div>
        <span className="text-sm font-bold">{chicken.name}</span>
        <span className="text-xs" style={{ color: "var(--slate)" }}>{chicken.breed}</span>
        {chicken.status === "deceased" && <Badge bg="#6B756133" color="#6B7561">deceased</Badge>}
        {chicken.status === "sold" && <Badge bg="#8C6D3F33" color="#8C6D3F">sold</Badge>}
        {children.length > 0 && <span className="text-xs font-mono" style={{ color: accent }}>{children.length} chick{children.length === 1 ? "" : "s"}</span>}
      </div>
      {open && children.map((ch) => <TreeNode key={ch.id} chicken={ch} all={all} accent={accent} depth={depth + 1} />)}
    </div>
  );
}

/* ===================================================================== */
/*                             REMINDERS TAB                             */
/* ===================================================================== */

function RemindersTab({ reminders, setReminders }) {
  const accent = "#C8893A";
  const [modal, setModal] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [flashingId, setFlashingId] = useState(null);
  const sorted = reminders.filter((r) => showDone || !r.done).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const save = (data) => { if (data.id) setReminders((r) => r.map((x) => (x.id === data.id ? data : x))); else setReminders((r) => [...r, { ...data, id: uid(), done: false }]); setModal(null); };

  const toggle = (id) => {
    const target = reminders.find((x) => x.id === id);
    if (target && target.recurrence && target.recurrence !== "none" && !target.done) {
      setFlashingId(id);
      setTimeout(() => {
        setReminders((r) => r.map((x) => (x.id === id ? { ...x, dueDate: advanceDate(x.dueDate, x.recurrence), lastCompletedDate: todayStr() } : x)));
        setFlashingId(null);
      }, 500);
    } else {
      setReminders((r) => r.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    }
  };
  const remove = (id) => setReminders((r) => r.filter((x) => x.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-1.5 text-sm select-none"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed</label>
        <Btn accent={accent} onClick={() => setModal({ data: {} })}><Plus size={16} /> Add reminder</Btn>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={BellRing} accent={accent} title="Nothing on the books" subtitle="Reminders for turning, lockdown, candling, and health stay here." onAction={() => setModal({ data: {} })} actionLabel="Add reminder" />
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const overdue = !r.done && r.dueDate < todayStr();
            const isToday = r.dueDate === todayStr();
            const flashing = flashingId === r.id;
            const badgeColor = (r.done || flashing) ? "#4F8F52" : overdue ? "var(--danger)" : isToday ? accent : "#6B7561";
            return (
              <div key={r.id} className="rounded-xl p-3 bg-white shadow-sm flex items-center gap-3" style={{ opacity: r.done ? 0.55 : 1, transition: "opacity .25s" }}>
                <button
                  onClick={() => !flashing && toggle(r.id)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ borderColor: badgeColor, background: (r.done || flashing) ? badgeColor : "transparent", transform: flashing ? "scale(1.25)" : "scale(1)" }}
                >
                  {(r.done || flashing) && <Check size={12} color="#fff" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ textDecoration: r.done ? "line-through" : "none" }}>{r.title}</p>
                  <p className="text-xs font-mono flex items-center gap-1" style={{ color: badgeColor }}>
                    {r.type} · due {fmtDate(r.dueDate)}{overdue ? " · overdue" : ""}
                    {r.recurrence && r.recurrence !== "none" && <span className="inline-flex items-center gap-0.5"><Repeat size={11} /> {r.recurrence}</span>}
                  </p>
                  {r.lastCompletedDate && (
                    <p className="text-xs mt-0.5" style={{ color: "#4F8F52" }}>✓ Last done {fmtDate(r.lastCompletedDate)}</p>
                  )}
                </div>
                <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => remove(r.id)} />
              </div>
            );
          })}
        </div>
      )}
      {modal && <Modal title="Add reminder" accent={accent} onClose={() => setModal(null)}><ReminderForm initial={modal.data} onSave={save} accent={accent} /></Modal>}
    </div>
  );
}

function ReminderForm({ initial, onSave, accent }) {
  const [f, setF] = useState({ title: "", type: "General", dueDate: todayStr(), recurrence: "none", ...initial });
  return (
    <div>
      <Field label="Title"><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Turn eggs" /></Field>
      <Field label="Type">
        <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option>Turning</option><option>Candling</option><option>Lockdown</option><option>Hatch day</option><option>Health</option><option>General</option>
        </Select>
      </Field>
      <Field label="Due date"><DateInput value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} /></Field>
      <Field label="Repeats" hint="Checking off a repeating reminder rolls it forward instead of completing it">
        <Select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}>
          <option value="none">Doesn't repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2 mt-2"><Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save</Btn></div>
    </div>
  );
}

/* ===================================================================== */
/*                             MORTALITY TAB                             */
/* ===================================================================== */

function MortalityTab({ mortalityLog, setMortalityLog, chickens, setChickens }) {
  const accent = "#6B7561";
  const [modal, setModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const save = (data) => {
    setMortalityLog((m) => [...m, { ...data, id: uid() }]);
    if (data.chickenId) setChickens((cs) => cs.map((c) => (c.id === data.chickenId ? { ...c, status: "deceased" } : c)));
    setModal(false);
  };
  const remove = (id) => { setMortalityLog((m) => m.filter((x) => x.id !== id)); setConfirmDelete(null); };
  const sorted = mortalityLog.slice().sort((a, b) => b.date.localeCompare(a.date));
  const byCause = useMemo(() => { const map = {}; mortalityLog.forEach((m) => { map[m.cause] = (map[m.cause] || 0) + 1; }); return map; }, [mortalityLog]);

  return (
    <div>
      <div className="flex justify-end mb-4"><Btn accent={accent} onClick={() => setModal(true)}><Plus size={16} /> Log a loss</Btn></div>
      {Object.keys(byCause).length > 0 && <div className="flex gap-2 mb-4 flex-wrap">{Object.entries(byCause).map(([cause, n]) => <StatPill key={cause} label={cause} value={n} accent={accent} />)}</div>}
      {sorted.length === 0 ? (
        <EmptyState icon={Feather} accent={accent} title="No losses recorded" subtitle="Tracking cause of loss helps spot predator or disease patterns over time." />
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => {
            const bird = chickens.find((c) => c.id === m.chickenId);
            return (
              <div key={m.id} className="rounded-xl p-3 bg-white shadow-sm flex items-start justify-between gap-3" style={{ borderLeft: `3px solid ${accent}` }}>
                <div>
                  <p className="font-bold text-sm">{bird?.name || m.name || "Unbanded bird"} <span style={{ color: "var(--slate)" }}>· {m.cause}</span></p>
                  {m.notes && <p className="text-sm" style={{ color: "var(--ink)" }}>{m.notes}</p>}
                  <p className="text-xs font-mono mt-1" style={{ color: "var(--slate)" }}>{fmtDate(m.date)}</p>
                </div>
                <IconBtn icon={Trash2} accent="var(--danger)" onClick={() => setConfirmDelete(m.id)} />
              </div>
            );
          })}
        </div>
      )}
      {modal && <MortalityForm chickens={chickens.filter((c) => c.status !== "deceased")} onSave={save} onClose={() => setModal(false)} accent={accent} />}
      {confirmDelete && <ConfirmDialog message="Delete this record?" onConfirm={() => remove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

function MortalityForm({ chickens, onSave, onClose, accent }) {
  const [f, setF] = useState({ chickenId: "", name: "", cause: "Unknown", date: todayStr(), notes: "" });
  return (
    <Modal title="Log a loss" accent={accent} onClose={onClose}>
      <Field label="Bird (if in the flock)">
        <Select value={f.chickenId} onChange={(e) => setF({ ...f, chickenId: e.target.value })}>
          <option value="">Not in flock list</option>{chickens.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      {!f.chickenId && <Field label="Name / description"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Unbanded chick, brown" /></Field>}
      <Field label="Cause">
        <Select value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })}>{MORTALITY_CAUSES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
      </Field>
      <Field label="Date"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="Notes"><TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-2"><Btn accent={accent} onClick={() => onSave(f)}><Check size={15} /> Save record</Btn></div>
    </Modal>
  );
}

/* ===================================================================== */
/*                             SEARCH OVERLAY                            */
/* ===================================================================== */

function SearchOverlay({ chickens, onSelect, onClose }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const results = query
    ? chickens.filter((c) => (c.name || "").toLowerCase().includes(query) || (c.breed || "").toLowerCase().includes(query) || (c.bandNumber || "").toLowerCase().includes(query)).slice(0, 20)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--mist)" }}>
      <div className="flex items-center gap-2 p-4 flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--teal-deep), #0A140C)" }}>
        <Search size={18} color="#E3D5B8" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, breed, or band number..." className="flex-1 bg-transparent outline-none text-base" style={{ color: "#E3D5B8" }} />
        <button onClick={onClose}><X size={20} color="#E3D5B8" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {query === "" ? (
          <p className="text-sm text-center mt-8" style={{ color: "var(--slate)" }}>Start typing to search your flock.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-center mt-8" style={{ color: "var(--slate)" }}>No birds match "{q}".</p>
        ) : (
          <div className="space-y-2">
            {results.map((c) => (
              <button key={c.id} onClick={() => onSelect(c.id)} className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 shadow-sm text-left">
                <div className="w-10 h-10 rounded-full overflow-hidden border flex-shrink-0" style={{ borderColor: sexBorderColor(c.sex) }}>
                  {c.photo ? <img src={c.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Bird size={16} /></div>}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm">{c.name || "Unnamed"}</p>
                  <p className="text-xs" style={{ color: "var(--slate)" }}>{c.breed || "Unknown breed"}{c.bandNumber ? ` · #${c.bandNumber}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================================================================== */
/*                                  APP                                  */
/* ===================================================================== */

function GlobalStyle() {
  return (
    <style>{`
      :root { --ink:#1B2E1F; --teal:#4F8F52; --teal-deep:#16241B; --aqua:#8FBF7A; --mist:#F5F1E6; --slate:#6B7561; --danger:#C8493C; }
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { height: 8px; width: 8px; }
      ::-webkit-scrollbar-thumb { background: rgba(11,42,44,0.18); border-radius: 4px; }
      input[type="checkbox"] { accent-color: var(--teal); width: 15px; height: 15px; }
      input:focus, select:focus, textarea:focus { box-shadow: 0 0 0 2px rgba(79,143,82,0.28); border-color: var(--teal); }
    `}</style>
  );
}

function MainApp({ userId, onLogout }) {
  const [active, setActive] = useState("dashboard");
  const [ready, setReady] = useState(0);
  const bump = () => setReady((c) => c + 1);

  const [pendingSaves, setPendingSaves] = useState(0);
  const onSaveStateChange = (saving) => setPendingSaves((n) => Math.max(0, n + (saving ? 1 : -1)));

  const [chickens, setChickens] = usePersistedArray("chickens", userId, bump, onSaveStateChange);
  const [incubators, setIncubators] = usePersistedArray("incubators", userId, bump, onSaveStateChange);
  const [breedingPairs, setBreedingPairs] = usePersistedArray("breedingPairs", userId, bump, onSaveStateChange);
  const [eggLogs, setEggLogs] = usePersistedArray("eggLogs", userId, bump, onSaveStateChange);
  const [healthRecords, setHealthRecords] = usePersistedArray("healthRecords", userId, bump, onSaveStateChange);
  const [mortalityLog, setMortalityLog] = usePersistedArray("mortalityLog", userId, bump, onSaveStateChange);
  const [reminders, setReminders] = usePersistedArray("reminders", userId, bump, onSaveStateChange);
  const [feedCosts, setFeedCosts] = usePersistedArray("feedCosts", userId, bump, onSaveStateChange);
  const [eggSales, setEggSales] = usePersistedArray("eggSales", userId, bump, onSaveStateChange);
  const [birdSales, setBirdSales] = usePersistedArray("birdSales", userId, bump, onSaveStateChange);

  const [searchOpen, setSearchOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState(null);
  const loading = ready < 10;

  const navRef = useRef(null);
  const [navCanScrollLeft, setNavCanScrollLeft] = useState(false);
  const [navCanScrollRight, setNavCanScrollRight] = useState(true);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => {
      setNavCanScrollLeft(el.scrollLeft > 4);
      setNavCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [loading]);

  const overdueCount = reminders.filter((r) => !r.done && r.dueDate < todayStr()).length;

  const exportData = () => {
    const payload = { app: "FlockForge", version: 1, exportedAt: new Date().toISOString(), chickens, incubators, breedingPairs, eggLogs, healthRecords, mortalityLog, reminders, feedCosts, eggSales, birdSales };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flockforge-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importData = (data) => {
    if (data.chickens) setChickens(data.chickens);
    if (data.incubators) setIncubators(data.incubators);
    if (data.breedingPairs) setBreedingPairs(data.breedingPairs);
    if (data.eggLogs) setEggLogs(data.eggLogs);
    if (data.healthRecords) setHealthRecords(data.healthRecords);
    if (data.mortalityLog) setMortalityLog(data.mortalityLog);
    if (data.reminders) setReminders(data.reminders);
    if (data.feedCosts) setFeedCosts(data.feedCosts);
    if (data.eggSales) setEggSales(data.eggSales);
    if (data.birdSales) setBirdSales(data.birdSales);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--mist)", fontFamily: "Manrope, sans-serif", color: "var(--ink)" }}>
      <GlobalStyle />

      {loading ? (
        <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={28} style={{ color: "var(--teal)" }} /></div>
      ) : (
        <>
          <header className="px-4 sm:px-6 pt-5 pb-2">
            <div className="rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, var(--teal-deep), #0A140C)" }}>
              <HenAnvilLogo size={38} color="#E3D5B8" />
              <div className="flex-1">
                <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: "'Playfair Display', serif", color: "#E3D5B8" }}>FlockForge</h1>
                <p className="text-[10px] font-semibold uppercase" style={{ color: "rgba(227,213,184,0.65)", letterSpacing: "0.18em" }}>Hatch · Grow · Thrive</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setSearchOpen(true)} className="p-2 rounded-full" style={{ background: "rgba(227,213,184,0.12)" }}>
                    <Search size={18} color="#E3D5B8" />
                  </button>
                  <button onClick={onLogout} title="Log out" className="p-2 rounded-full" style={{ background: "rgba(227,213,184,0.12)" }}>
                    <LogOut size={18} color="#E3D5B8" />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase" style={{ color: pendingSaves > 0 ? "#E3D5B8" : "rgba(143,191,122,0.9)", letterSpacing: "0.08em" }}>
                  <span className={"w-1.5 h-1.5 rounded-full" + (pendingSaves > 0 ? " animate-pulse" : "")} style={{ background: pendingSaves > 0 ? "#E3D5B8" : "#8FBF7A" }} />
                  {pendingSaves > 0 ? "Saving…" : "Saved"}
                </div>
              </div>
            </div>
          </header>

          <div className="relative">
            <nav ref={navRef} className="px-4 sm:px-6 pt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {TABS.map((t) => {
                const Icon = t.icon;
                const isActive = active === t.id;
                return (
                  <button key={t.id} onClick={() => setActive(t.id)}
                    className="relative flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex-shrink-0 transition-all"
                    style={{ background: isActive ? t.accent : "#fff", color: isActive ? "#fff" : "var(--ink)", boxShadow: isActive ? `0 4px 12px ${t.accent}55` : "0 1px 2px rgba(11,42,44,0.08)" }}>
                    <Icon size={15} /> {t.label}
                    {t.id === "reminders" && overdueCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "var(--danger)" }}>{overdueCount}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            {navCanScrollLeft && <div className="pointer-events-none absolute left-0 top-0 bottom-1 w-8" style={{ background: "linear-gradient(to right, var(--mist), transparent)" }} />}
            {navCanScrollRight && <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-10" style={{ background: "linear-gradient(to left, var(--mist), transparent)" }} />}
          </div>

          <main className="px-4 sm:px-6 pb-12 pt-4">
            {active === "dashboard" && <DashboardTab chickens={chickens} incubators={incubators} eggLogs={eggLogs} setEggLogs={setEggLogs} reminders={reminders} onNavigate={setActive} onExport={exportData} onImport={importData} />}
            {active === "flock" && <FlockTab chickens={chickens} setChickens={setChickens} healthRecords={healthRecords} jumpToChickenId={jumpTarget} onJumpHandled={() => setJumpTarget(null)} />}
            {active === "incubator" && <IncubatorTab incubators={incubators} setIncubators={setIncubators} chickens={chickens} setChickens={setChickens} breedingPairs={breedingPairs} setReminders={setReminders} />}
            {active === "breeding" && <BreedingTab breedingPairs={breedingPairs} setBreedingPairs={setBreedingPairs} chickens={chickens} />}
            {active === "egglog" && <EggLogTab eggLogs={eggLogs} setEggLogs={setEggLogs} chickens={chickens} />}
            {active === "economics" && <EconomicsTab feedCosts={feedCosts} setFeedCosts={setFeedCosts} eggSales={eggSales} setEggSales={setEggSales} birdSales={birdSales} setBirdSales={setBirdSales} eggLogs={eggLogs} chickens={chickens} setChickens={setChickens} />}
            {active === "health" && <HealthTab healthRecords={healthRecords} setHealthRecords={setHealthRecords} chickens={chickens} />}
            {active === "lineage" && <LineageTab chickens={chickens} />}
            {active === "reminders" && <RemindersTab reminders={reminders} setReminders={setReminders} />}
            {active === "mortality" && <MortalityTab mortalityLog={mortalityLog} setMortalityLog={setMortalityLog} chickens={chickens} setChickens={setChickens} />}
          </main>
        </>
      )}
      {searchOpen && (
        <SearchOverlay
          chickens={chickens}
          onClose={() => setSearchOpen(false)}
          onSelect={(id) => { setJumpTarget({ id, nonce: Date.now() }); setActive("flock"); setSearchOpen(false); }}
        />
      )}
    </div>
  );
}

/* ===================================================================== */
/*                          AUTH / ACCOUNT LAYER                        */
/* ===================================================================== */

const PERSISTED_KEYS = ["chickens", "incubators", "breedingPairs", "eggLogs", "healthRecords", "mortalityLog", "reminders", "feedCosts", "eggSales", "birdSales"];

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => { setMode(m); setError(""); setInfo(""); };

  const submit = async () => {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
        else setInfo("Account created! If email confirmation is on, check your inbox, then log in.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) setError(error.message);
        else setInfo("Password reset email sent — check your inbox.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--mist)", fontFamily: "Manrope, sans-serif" }}>
      <GlobalStyle />
      <div className="w-full max-w-sm">
        <div className="rounded-2xl px-5 py-4 flex items-center gap-3 mb-6" style={{ background: "linear-gradient(135deg, var(--teal-deep), #0A140C)" }}>
          <HenAnvilLogo size={38} color="#E3D5B8" />
          <div>
            <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: "'Playfair Display', serif", color: "#E3D5B8" }}>FlockForge</h1>
            <p className="text-[10px] font-semibold uppercase" style={{ color: "rgba(227,213,184,0.65)", letterSpacing: "0.18em" }}>Hatch · Grow · Thrive</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4" style={{ fontFamily: "'Playfair Display', serif", color: "var(--ink)" }}>
            {mode === "signin" ? "Log in" : mode === "signup" ? "Create an account" : "Reset your password"}
          </h2>

          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>

          {mode !== "reset" && (
            <Field label="Password">
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            </Field>
          )}

          {error && <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</p>}
          {info && <p className="text-sm mb-3" style={{ color: "var(--teal)" }}>{info}</p>}

          <Btn accent="var(--teal)" className="w-full justify-center" onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : mode === "signin" ? "Log in" : mode === "signup" ? "Create account" : "Send reset email"}
          </Btn>

          <div className="flex items-center justify-between mt-4 text-xs flex-wrap gap-2">
            {mode === "signin" && (
              <>
                <button onClick={() => switchMode("signup")} style={{ color: "var(--teal)" }} className="underline font-semibold">Create an account</button>
                <button onClick={() => switchMode("reset")} style={{ color: "var(--slate)" }} className="underline">Forgot password?</button>
              </>
            )}
            {mode !== "signin" && (
              <button onClick={() => switchMode("signin")} style={{ color: "var(--teal)" }} className="underline font-semibold">Back to log in</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MigrationPrompt({ userId, onDone }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    for (const key of PERSISTED_KEYS) {
      try {
        const raw = localStorage.getItem(`flockforge:${key}`);
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr) && arr.length) {
          await supabase.from("user_data").upsert({ user_id: userId, key, value: arr, updated_at: new Date().toISOString() });
        }
      } catch (e) {}
    }
    window.location.reload();
  };
  return (
    <Modal title="Import your existing flock?" accent="var(--teal)" onClose={() => onDone(false)}>
      <p className="text-sm mb-4" style={{ color: "var(--ink)" }}>
        We found flock data already saved on this device, from before you had an account. Want to bring it into your new account? This only happens once — after this, your account's data is the one that counts.
      </p>
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" accent="rgba(11,42,44,0.5)" onClick={() => onDone(false)}>Start fresh instead</Btn>
        <Btn accent="var(--teal)" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : "Import my data"}</Btn>
      </div>
    </Modal>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [migrationChecked, setMigrationChecked] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || migrationChecked) return;
    (async () => {
      const hasLocal = PERSISTED_KEYS.some((key) => {
        try {
          const raw = localStorage.getItem(`flockforge:${key}`);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) && arr.length > 0;
        } catch (e) {
          return false;
        }
      });
      if (hasLocal) {
        const { count } = await supabase.from("user_data").select("*", { count: "exact", head: true }).eq("user_id", session.user.id);
        if (!count) setShowMigration(true);
      }
      setMigrationChecked(true);
    })();
  }, [session, migrationChecked]);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--mist)" }}>
        <GlobalStyle />
        <Loader2 className="animate-spin" size={28} style={{ color: "var(--teal)" }} />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <>
      <MainApp userId={session.user.id} onLogout={() => supabase.auth.signOut()} />
      {showMigration && <MigrationPrompt userId={session.user.id} onDone={() => setShowMigration(false)} />}
    </>
  );
}
