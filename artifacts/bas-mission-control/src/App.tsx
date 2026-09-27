import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FilesetResolver, HandLandmarker, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { motion } from 'framer-motion';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowRight, ArrowUpRight, BarChart3,
  Bell, Boxes, BrainCircuit, Camera, Check, CheckCircle2, ChevronRight, CircleDot,
  CloudOff, Cpu, Download, FileJson, FileText, Gauge, HardDrive, Headphones, Info,
  Layers3, LayoutDashboard, ListChecks, Menu, Mic, Monitor, Network, Pause, Play,
  Radio, RefreshCw, Router as RouterIcon, ScanFace, Settings2, ShieldCheck, Signal,
  Siren, SlidersHorizontal, Sparkles, Square, Timer, Upload, UserRound, Users, Video,
  Wifi, X, Zap
} from 'lucide-react';
import { getSimulatedTelemetry, type TelemetryData } from '@/data/telemetry';
import workflowCatalog from '@/data/workflow.json';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis
} from 'recharts';

const queryClient = new QueryClient();

type Tone = 'cyan' | 'orange' | 'green' | 'red' | 'slate';
type IconType = typeof Gauge;
type NavItem = [string, string, IconType];
type Step = { id: number; name: string; short: string; expected: string; detected: string; confidence: number; duration: string; state: 'verified' | 'active' | 'pending' | 'warning' };
type ConsoleSettings = {
  voiceAssistant: boolean;
  showPoseOverlay: boolean;
  showHandLandmarks: boolean;
  showConfidence: boolean;
  showTelemetry: boolean;
  showActionHistory: boolean;
  compactMode: boolean;
};
const defaultConsoleSettings: ConsoleSettings = {
  voiceAssistant: true,
  showPoseOverlay: true,
  showHandLandmarks: true,
  showConfidence: true,
  showTelemetry: true,
  showActionHistory: true,
  compactMode: false,
};
type PrototypeStep = typeof workflowCatalog.prototype_camera_workflow.steps[number];
type SequenceStatus = 'ALIGNED' | 'WAITING' | 'VERIFY' | 'OUT OF SEQUENCE' | 'LOW CONFIDENCE' | 'UNKNOWN';
type MissionEvent = { timestamp: string; sessionId: string; action: string; confidence: number; expected: string; status: SequenceStatus; voice?: string };

const steps: Step[] = [
  { id: 1, name: 'Crew ingress & station lock', short: 'INGRESS', expected: 'Person enters observation zone', detected: 'Person detected / zone locked', confidence: 98.4, duration: '00:18', state: 'verified' },
  { id: 2, name: 'Acquire experiment pouch', short: 'ACQUIRE', expected: 'Right hand contacts pouch', detected: 'Pouch contact confirmed', confidence: 96.1, duration: '00:34', state: 'verified' },
  { id: 3, name: 'Open containment sleeve', short: 'OPEN', expected: 'Two-hand sleeve opening', detected: 'Sleeve opening detected', confidence: 91.8, duration: '00:29', state: 'verified' },
  { id: 4, name: 'Transfer sample to tray', short: 'TRANSFER', expected: 'Sample moves to tray', detected: 'Sample in hand / tray proximity', confidence: 88.7, duration: '00:41', state: 'active' },
  { id: 5, name: 'Secure tray and verify', short: 'SECURE', expected: 'Tray latch closed', detected: 'Awaiting latch state', confidence: 0, duration: '—', state: 'pending' },
  { id: 6, name: 'Closeout & stow', short: 'CLOSEOUT', expected: 'Pouch returned to stow', detected: 'Awaiting sequence', confidence: 0, duration: '—', state: 'pending' }
];

const confidenceData = [
  { time: '10:42:04', confidence: 82, activity: 74 }, { time: '10:42:08', confidence: 89, activity: 82 },
  { time: '10:42:12', confidence: 93, activity: 88 }, { time: '10:42:16', confidence: 87, activity: 79 },
  { time: '10:42:20', confidence: 92, activity: 91 }, { time: '10:42:24', confidence: 96, activity: 94 },
  { time: '10:42:28', confidence: 91, activity: 86 }, { time: '10:42:32', confidence: 89, activity: 83 }
];

const activityData = [
  { name: 'Ingress', expected: 18, actual: 18 }, { name: 'Acquire', expected: 30, actual: 34 },
  { name: 'Open', expected: 25, actual: 29 }, { name: 'Transfer', expected: 35, actual: 41 },
  { name: 'Secure', expected: 28, actual: 0 }
];

const logs = [
  ['10:42:32.184', 'ACTIVITY', 'Transfer sample to tray', '88.7%', 'IN PROGRESS'],
  ['10:42:28.910', 'PERCEPTION', 'Hand-object contact: sample', '94.2%', 'VERIFIED'],
  ['10:42:24.023', 'SEQUENCE', 'Step 03 → Step 04 transition', '91.3%', 'VALIDATED'],
  ['10:42:20.772', 'GUIDANCE', 'Local cue: align with tray', '—', 'ISSUED'],
  ['10:42:16.441', 'PERCEPTION', 'Person + 6 keypoints tracked', '96.8%', 'VERIFIED'],
  ['10:42:12.006', 'SYSTEM', 'Camera stream synchronized', '—', 'READY']
];

const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'MISSION', items: [['/overview', 'Overview', LayoutDashboard], ['/live', 'Live mission', Video], ['/simulation', 'Simulation', Play]] },
  { label: 'INTELLIGENCE', items: [['/workflow', 'Workflow', ListChecks], ['/perception', 'Perception', ScanFace], ['/activity', 'Activity model', Activity], ['/sequence', 'Sequence intelligence', BrainCircuit]] },
  { label: 'EVIDENCE', items: [['/alerts', 'Alert center', Bell], ['/logs', 'Mission logs', FileText], ['/analytics', 'Analytics', BarChart3]] },
  { label: 'SYSTEM', items: [['/edge', 'Edge intelligence', Cpu], ['/architecture', 'Architecture', Layers3]] }
];

type MissionContextValue = {
  running: boolean; errorMode: boolean; stepIndex: number; setStepIndex: (value: number) => void;
  setRunning: (value: boolean) => void; setErrorMode: (value: boolean) => void; addAlert: () => void;
  guidance: boolean; setGuidance: (value: boolean) => void; alerts: number;
  settings: ConsoleSettings; updateSettings: (patch: Partial<ConsoleSettings>) => void; resetSettings: () => void; preferencesOpen: boolean; setPreferencesOpen: (value: boolean) => void;
  events: MissionEvent[]; addEvent: (event: MissionEvent) => void;
};
const MissionContext = createContext<MissionContextValue | null>(null);
function useMission() {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error('Mission context unavailable');
  return ctx;
}

function MissionProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [errorMode, setErrorMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(3);
  const [guidance, setGuidance] = useState(true);
  const [alerts, setAlerts] = useState(2);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [settings, setSettings] = useState<ConsoleSettings>(() => {
    try {
      const saved = window.localStorage.getItem('bas-console-settings');
      return saved ? { ...defaultConsoleSettings, ...JSON.parse(saved) } : defaultConsoleSettings;
    } catch {
      return defaultConsoleSettings;
    }
  });
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const updateSettings = (patch: Partial<ConsoleSettings>) => setSettings((value) => {
    const next = { ...value, ...patch };
    window.localStorage.setItem('bas-console-settings', JSON.stringify(next));
    return next;
  });
  const resetSettings = () => {
    window.localStorage.removeItem('bas-console-settings');
    setSettings(defaultConsoleSettings);
  };
  const addEvent = (event: MissionEvent) => setEvents((value) => [event, ...value].slice(0, 100));
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setStepIndex((value) => Math.min(value + 1, steps.length - 1)), 7000);
    return () => window.clearInterval(timer);
  }, [running]);
  const addAlert = () => setAlerts((value) => value + 1);
  return <MissionContext.Provider value={{ running, errorMode, stepIndex, setStepIndex, setRunning, setErrorMode, addAlert, guidance, setGuidance, alerts, settings, updateSettings, resetSettings, preferencesOpen, setPreferencesOpen, events, addEvent }}>{children}</MissionContext.Provider>;
}

function StatusBadge({ children, tone = 'slate', dot = true }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="badge-dot" />}{children}</span>;
}

function KpiCard({ label, value, unit, detail, tone = 'cyan', icon: Icon }: { label: string; value: string; unit?: string; detail: string; tone?: Tone; icon: typeof Gauge }) {
  return <div className="panel p-4 flex min-h-[112px] flex-col justify-between" data-testid={`kpi-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="flex items-center justify-between gap-2"><span className="eyebrow text-slate-500">{label}</span><span className={`kpi-icon kpi-${tone}`}><Icon size={15} /></span></div>
    <div className="mt-1 flex items-end gap-1"><span className="text-[1.65rem] font-extrabold tracking-tight">{value}</span>{unit && <span className="mb-1 text-xs text-slate-500">{unit}</span>}</div>
    <span className="text-[11px] text-slate-500">{detail}</span>
  </div>;
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const [location] = useLocation();
  return <header className="topbar">
    <button className="mobile-menu" onClick={onMenu} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button>
    <div className="flex items-center gap-2"><span className="eyebrow hidden text-slate-500 md:block">MISSION /</span><span className="text-sm font-bold">{location === '/' ? 'Entry' : (navGroups.flatMap((group) => group.items).find(([path]) => path === location)?.[1] || 'Control')}</span></div>
    <div className="ml-auto flex items-center gap-3">
       <StatusBadge tone="cyan">EDGE CONTROL</StatusBadge>
      <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex"><span className="live-dot h-2 w-2 rounded-full bg-emerald-500" /><span className="font-mono-data text-[11px] text-slate-600">10:42:32 UTC</span></div>
       <span className="hidden text-xs font-bold text-slate-500 lg:block">MISSION OPERATOR</span>
    </div>
  </header>;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { setPreferencesOpen } = useMission();
  return <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
    <div className="sidebar-brand"><div className="brand-mark"><Radio size={17} /></div><div><div className="text-[15px] font-extrabold tracking-tight text-white">BAS // MC</div><div className="eyebrow text-slate-400">MISSION CONTROL</div></div><button className="ml-auto text-slate-400 md:hidden" onClick={onClose} aria-label="Close navigation"><X size={18} /></button></div>
    <div className="mission-strip"><div className="flex items-center justify-between"><span className="eyebrow text-slate-400">ACTIVE MISSION</span><span className="h-2 w-2 rounded-full bg-emerald-400" /></div><div className="mt-2 font-mono-data text-xs text-cyan-200">SIH26174</div><div className="mt-1 text-[11px] text-slate-400">BAS EXPERIMENT / 01</div></div>
    <nav className="sidebar-nav">{navGroups.map((group) => <div key={group.label} className="nav-group"><div className="eyebrow px-3 pb-2 text-slate-500">{group.label}</div>{group.items.map(([href, label, Icon]) => <Link key={href} href={href} onClick={onClose} className={`nav-item ${location === href ? 'nav-active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} /><span>{label}</span>{href === '/alerts' && <span className="nav-count">2</span>}</Link>)}</div>)}</nav>
     <div className="mt-auto border-t border-slate-700/60 p-3"><button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => setPreferencesOpen(true)}><Settings2 size={16} /><span className="text-xs">Console preferences</span></button><div className="mt-2 flex items-center gap-2 rounded-md bg-slate-800/60 p-2"><div className="h-7 w-7 rounded bg-cyan-900/50 flex items-center justify-center text-[10px] font-bold text-cyan-300">EDGE</div><div><div className="text-[11px] font-bold text-slate-200">LOCAL EDGE NODE</div><div className="font-mono-data text-[9px] text-emerald-400">NOMINAL / LOCAL</div></div></div></div>
  </aside>;
}

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { preferencesOpen, setPreferencesOpen, settings } = useMission();
  return <div className={`app-shell ${settings.compactMode ? 'compact-mode' : ''}`}><Sidebar open={open} onClose={() => setOpen(false)} /><main className="main-shell"><Topbar onMenu={() => setOpen(true)} /><div className="page-container page-in">{children}</div></main>{open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}{preferencesOpen && <PreferencesModal onClose={() => setPreferencesOpen(false)} />}</div>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="eyebrow text-cyan-700">{eyebrow}</div><h1 className="mt-1 text-[1.7rem] font-extrabold tracking-[-.04em] text-slate-800 md:text-[2rem]">{title}</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p></div>{actions && <div className="flex items-center gap-2">{actions}</div>}</div>;
}

function SectionLabel({ children }: { children: ReactNode }) { return <div className="eyebrow mb-3 text-slate-500">{children}</div>; }
function MiniSpark({ data = confidenceData }: { data?: { confidence: number }[] }) { return <div className="h-9 w-20"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><Line type="monotone" dataKey="confidence" stroke="#0891b2" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>; }

function PreferencesModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, resetSettings } = useMission();
  const [draft, setDraft] = useState(settings);
  const fields: [keyof ConsoleSettings, string, string][] = [
    ['voiceAssistant', 'VOICE ASSISTANT', 'Allow local speech guidance'],
    ['showPoseOverlay', 'SHOW POSE OVERLAY', 'Draw body landmarks on camera'],
    ['showHandLandmarks', 'SHOW HAND LANDMARKS', 'Draw hand landmarks on camera'],
    ['showConfidence', 'SHOW CONFIDENCE', 'Show confidence labels and bars'],
    ['showTelemetry', 'SHOW TELEMETRY', 'Show simulated environment telemetry'],
    ['showActionHistory', 'SHOW ACTION HISTORY', 'Show stable action event stream'],
    ['compactMode', 'COMPACT MODE', 'Reduce card spacing'],
  ];
  return <div className="preferences-backdrop" role="dialog" aria-modal="true" aria-label="Console preferences"><div className="preferences-modal panel"><div className="flex items-start justify-between border-b border-slate-200 pb-4"><div><SectionLabel>CONSOLE / SETTINGS</SectionLabel><h2 className="text-lg font-extrabold">Console preferences</h2><p className="mt-1 text-xs text-slate-500">These controls are stored locally in this browser.</p></div><button className="icon-button" onClick={onClose} aria-label="Close preferences"><X size={15} /></button></div><div className="mt-2">{fields.map(([key, label, description]) => <div className="toggle-row" key={key}><div><b className="text-xs">{label}</b><p>{description}</p></div><button className={`switch ${draft[key] ? 'switch-on' : ''}`} onClick={() => setDraft((value) => ({ ...value, [key]: !value[key] }))} aria-label={`Toggle ${label}`}><span /></button></div>)}</div><div className="mt-5 flex flex-wrap justify-end gap-2"><button className="button button-ghost" onClick={() => { resetSettings(); setDraft(defaultConsoleSettings); }}>RESET DEFAULTS</button><button className="button button-ghost" onClick={onClose}>CANCEL</button><button className="button button-primary" onClick={() => { updateSettings(draft); onClose(); }}>APPLY</button></div></div></div>;
}

function Home() {
  const [, setLocation] = useLocation();
  const capabilities: [string, string, string, IconType][] = [['01', 'RECOGNIZE', 'Person, pose, object and hand interaction perception at the edge.', ScanFace], ['02', 'VALIDATE', 'Temporal sequence intelligence checks whether the action is correct now.', BrainCircuit], ['03', 'GUIDE', 'Local voice and visual cues help recover from a protocol deviation.', Headphones]];
  return <div className="landing">
    <div className="landing-grid" />
    <header className="landing-nav"><Link href="/" className="flex items-center gap-3" data-testid="link-landing-brand"><span className="brand-mark brand-mark-light"><Radio size={18} /></span><span className="font-extrabold tracking-tight">BAS // MISSION CONTROL</span></Link><div className="flex items-center gap-4"><StatusBadge tone="orange">PROTOTYPE BUILD 0.9.6</StatusBadge><span className="eyebrow hidden text-slate-500 sm:block">SIH 2026 / 26174</span></div></header>
     <main className="landing-main"><div className="landing-copy"><div className="eyebrow text-cyan-700">SMART INDIA HACKATHON 2026 <span className="mx-2 text-slate-300">/</span> SIH26174</div><h1>AI HUMAN<br /><span>ACTIVITY</span><br />RECOGNITION</h1><p className="landing-lede">On-board BAS Experiment Intelligence for crew-aware, sequence-safe operations.</p><div className="landing-actions"><button className="button button-primary px-5" onClick={() => setLocation('/overview')} data-testid="button-enter-mission-control">ENTER MISSION CONTROL <ArrowRight size={16} /></button><Link href="/architecture" className="button button-ghost" data-testid="link-view-architecture">VIEW ARCHITECTURE <ArrowUpRight size={15} /></Link></div><div className="landing-note"><Info size={14} /><span>Prototype console. Live camera mode uses browser-side pose and hand landmarks; simulation is kept secondary.</span></div></div><div className="landing-visual"><div className="orbital-ring ring-one" /><div className="orbital-ring ring-two" /><div className="landing-radar"><div className="radar-sweep" /><div className="radar-cross cross-h" /><div className="radar-cross cross-v" /><span className="radar-point point-a" /><span className="radar-point point-b" /><div className="radar-center"><Radio size={29} /></div></div><div className="visual-readout readout-a"><span className="live-dot h-2 w-2 rounded-full bg-cyan-500" />LOCAL CAMERA PIPELINE<div className="font-mono-data text-[10px] text-slate-500">POSE + HANDS</div></div><div className="visual-readout readout-b">SEQUENCE GATE <strong>VERIFY</strong><div className="font-mono-data text-[10px] text-emerald-600">SAFETY LAYER</div></div></div></main>
    <section className="landing-capabilities"><div className="eyebrow text-slate-500">THE INTELLIGENCE LOOP</div><div className="capability-grid">{capabilities.map(([no, title, copy, Icon]) => <div className="capability" key={title}><span className="font-mono-data text-xs text-cyan-600">{no}</span><Icon size={19} className="my-5 text-slate-700" /><h2>{title}</h2><p>{copy}</p></div>)}</div></section>
  </div>;
}

function Overview() {
  const { stepIndex, running, setRunning, setStepIndex } = useMission();
  return <><PageHeader eyebrow="BAS EXPERIMENT CONTROL" title="Mission overview" description="A live operating picture of the crew activity recognition pipeline." actions={<><StatusBadge tone="green">EDGE SYSTEM NOMINAL</StatusBadge><button className="button button-primary" onClick={() => setRunning(!running)} data-testid="button-overview-toggle">{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'PAUSE DEMO' : 'RUN DEMO'}</button></>} />
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><KpiCard label="Experiment progress" value={`${Math.round(((stepIndex + 1) / steps.length) * 100)}%`} detail={`${stepIndex + 1} of ${steps.length} protocol gates`} tone="orange" icon={Gauge} /><KpiCard label="Recognition confidence" value="92.4" unit="%" detail="rolling 30 second mean" tone="cyan" icon={ScanFace} /><KpiCard label="Validated actions" value="03" detail="zero unresolved violations" tone="green" icon={ShieldCheck} /><KpiCard label="Edge latency" value="12" unit="ms" detail="camera → decision median" tone="slate" icon={Zap} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><div className="panel p-5"><div className="mb-5 flex items-center justify-between"><div><SectionLabel>EXPERIMENT PROTOCOL</SectionLabel><h2 className="text-base font-extrabold">Transfer sample to tray</h2></div><StatusBadge tone="orange">STEP 04 / 06</StatusBadge></div><div className="progress-sequence">{steps.map((step, index) => <button key={step.id} onClick={() => setStepIndex(index)} className={`sequence-step ${index === stepIndex ? 'sequence-current' : ''}`} data-testid={`button-step-${step.id}`}><span className={`step-node step-${step.state}`}>{step.state === 'verified' ? <Check size={13} /> : step.id}</span><span className="mt-2 block text-[10px] font-bold text-slate-600">{step.short}</span>{index < steps.length - 1 && <span className={`step-connector ${index < stepIndex ? 'connector-done' : ''}`} />}</button>)}</div><div className="mt-6 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-3"><div><span className="eyebrow text-slate-400">EXPECTED</span><p className="mt-1 text-sm font-bold">Sample moves to tray</p></div><div><span className="eyebrow text-slate-400">DETECTED</span><p className="mt-1 text-sm font-bold text-cyan-700">Right hand + sample</p></div><div><span className="eyebrow text-slate-400">GATE CONFIDENCE</span><p className="mt-1 font-mono-data text-sm font-bold text-emerald-600">88.7%</p></div></div></div><SystemHealth /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><MissionTimeline /><ConfidenceCard /></div>
  </>;
}

function SystemHealth() {
  const metrics = [['CAMERA STREAM', 'ONLINE', '98.1 fps', 'green'], ['PERCEPTION ENGINE', 'RUNNING', '12 ms', 'cyan'], ['SEQUENCE GATE', 'ARMED', '6 states', 'orange'], ['VOICE GUIDANCE', 'READY', 'EN-IN', 'green']] as const;
  return <div className="panel p-5"><SectionLabel>SYSTEM HEALTH</SectionLabel><div className="space-y-3">{metrics.map(([name, state, detail, tone]) => <div className="health-row" key={name}><div className={`health-icon health-${tone}`}><CircleDot size={14} /></div><div className="min-w-0 flex-1"><div className="text-xs font-bold">{name}</div><div className="font-mono-data text-[10px] text-slate-500">{detail}</div></div><StatusBadge tone={tone}>{state}</StatusBadge></div>)}</div></div>;
}

function MissionTimeline() {
  return <div className="panel p-5"><div className="flex items-center justify-between"><SectionLabel>MISSION TIMELINE</SectionLabel><Link href="/logs" className="text-xs font-bold text-cyan-700" data-testid="link-view-all-logs">VIEW LOGS <ChevronRight size={13} className="inline" /></Link></div><div className="timeline">{[['10:42:32', 'Transfer sample to tray', 'Activity gate evaluating', 'orange'], ['10:42:28', 'Sample contact detected', 'Hand-object interaction', 'green'], ['10:42:24', 'Transition accepted', 'Sequence 03 → 04', 'cyan'], ['10:42:16', 'Crew member tracked', 'Pose stable / P-01', 'slate']].map(([time, title, copy, tone]) => <div className="timeline-item" key={time}><span className={`timeline-dot dot-${tone}`} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="text-xs font-bold">{title}</span><span className="font-mono-data text-[10px] text-slate-400">{time}</span></div><p className="mt-1 text-[11px] text-slate-500">{copy}</p></div></div>)}</div></div>;
}

function ConfidenceCard() {
  return <div className="panel p-5"><div className="flex items-start justify-between"><div><SectionLabel>CONFIDENCE STREAM</SectionLabel><h2 className="text-sm font-extrabold">Perception / activity agreement</h2></div><StatusBadge tone="cyan">LIVE WINDOW</StatusBadge></div><div className="mt-4 h-[170px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={confidenceData}><defs><linearGradient id="confFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0891b2" stopOpacity={.24} /><stop offset="100%" stopColor="#0891b2" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e5e9ed" vertical={false} /><XAxis dataKey="time" hide /><YAxis domain={[50, 100]} tick={{ fontSize: 10, fill: '#72808b' }} axisLine={false} tickLine={false} /><ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #dce3e8' }} /><Area type="monotone" dataKey="confidence" stroke="#0891b2" fill="url(#confFill)" strokeWidth={2} /><Line type="monotone" dataKey="activity" stroke="#e89b24" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div><div className="mt-2 flex gap-4 text-[10px] font-bold text-slate-500"><span><i className="legend-dot bg-cyan-600" /> PERCEPTION</span><span><i className="legend-dot bg-orange-500" /> ACTIVITY</span></div></div>;
}

type CameraStatus = 'standby' | 'requesting' | 'live' | 'denied' | 'missing' | 'unsupported' | 'model-error';
type ActivityLabel = 'IDLE' | 'STANDING' | 'REACHING' | 'BENDING' | 'GRAB / PINCH' | 'MOVE / TRANSFER' | 'PLACE' | 'HAND MOVEMENT' | 'UNKNOWN';
type BodyPartName = 'HEAD' | 'LEFT SHOULDER' | 'RIGHT SHOULDER' | 'LEFT ELBOW' | 'RIGHT ELBOW' | 'LEFT WRIST' | 'RIGHT WRIST' | 'LEFT HIP' | 'RIGHT HIP' | 'LEFT KNEE' | 'RIGHT KNEE' | 'LEFT ANKLE' | 'RIGHT ANKLE';
type PoseSnapshot = { landmarks: NormalizedLandmark[]; handLandmarks: NormalizedLandmark[][]; humanDetected: boolean; confidence: number; activity: ActivityLabel; motionState: 'ACTIVE' | 'STABLE' | 'IDLE'; visibleBodyParts: BodyPartName[]; leftHandVisible: boolean; rightHandVisible: boolean; pinchDetected: boolean; movementDetail: string; movementParts: string[]; updatedAt: number };

const poseConnections: [number, number][] = [[0, 11], [0, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const bodyPartLandmarks: { name: BodyPartName; index: number }[] = [
  { name: 'HEAD', index: 0 }, { name: 'LEFT SHOULDER', index: 11 }, { name: 'RIGHT SHOULDER', index: 12 },
  { name: 'LEFT ELBOW', index: 13 }, { name: 'RIGHT ELBOW', index: 14 }, { name: 'LEFT WRIST', index: 15 },
  { name: 'RIGHT WRIST', index: 16 }, { name: 'LEFT HIP', index: 23 }, { name: 'RIGHT HIP', index: 24 },
  { name: 'LEFT KNEE', index: 25 }, { name: 'RIGHT KNEE', index: 26 }, { name: 'LEFT ANKLE', index: 27 },
  { name: 'RIGHT ANKLE', index: 28 },
];
const guidanceMessage = 'Please place the sample before activating the device.';
const prototypeSteps: PrototypeStep[] = workflowCatalog.prototype_camera_workflow.steps;

function validatePrototypeSequence(expected: PrototypeStep, detectedAction: ActivityLabel, confidence: number): SequenceStatus {
  if (detectedAction === 'UNKNOWN' || detectedAction === 'HAND MOVEMENT') return 'WAITING';
  if (confidence < expected.requiredConfidence * 100) return 'LOW CONFIDENCE';
  const isReady = expected.action === 'IDLE' && (detectedAction === 'IDLE' || detectedAction === 'STANDING');
  if (detectedAction === expected.action || isReady) return 'ALIGNED';
  if (confidence < 80) return 'VERIFY';
  return 'OUT OF SEQUENCE';
}

function speakGuidance(message = guidanceMessage) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
}

function useWebcamPose() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const landmarkerPromiseRef = useRef<Promise<PoseLandmarker | null> | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const handLandmarkerPromiseRef = useRef<Promise<HandLandmarker | null> | null>(null);
  const rafRef = useRef<number | null>(null);
  const inferenceBusyRef = useRef(false);
  const lastInferenceRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const cameraSessionRef = useRef(0);
  const previousPointsRef = useRef<NormalizedLandmark[]>([]);
  const activityHistoryRef = useRef<ActivityLabel[]>([]);
  const [status, setStatus] = useState<CameraStatus>('standby');
  const [errorMessage, setErrorMessage] = useState('');
  const [mirrored, setMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [poseEnabled, setPoseEnabled] = useState(true);
  const [handEnabled, setHandEnabled] = useState(true);
  const [pose, setPose] = useState<PoseSnapshot>({ landmarks: [], handLandmarks: [], humanDetected: false, confidence: 0, activity: 'UNKNOWN', motionState: 'IDLE', visibleBodyParts: [], leftHandVisible: false, rightHandVisible: false, pinchDetected: false, movementDetail: 'No movement detected', movementParts: [], updatedAt: 0 });

  const getLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    if (!landmarkerPromiseRef.current) {
      landmarkerPromiseRef.current = (async () => {
        try {
          const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
          const detector = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          landmarkerRef.current = detector;
          return detector;
        } catch {
          return null;
        }
      })();
    }
    return landmarkerPromiseRef.current;
  }, []);

  const getHandLandmarker = useCallback(async () => {
    if (handLandmarkerRef.current) return handLandmarkerRef.current;
    if (!handLandmarkerPromiseRef.current) {
      handLandmarkerPromiseRef.current = (async () => {
        try {
          const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
          const detector = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          handLandmarkerRef.current = detector;
          return detector;
        } catch {
          return null;
        }
      })();
    }
    return handLandmarkerPromiseRef.current;
  }, []);

  const drawPose = useCallback((landmarks: NormalizedLandmark[], hands: NormalizedLandmark[][]) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks.length && !hands.length) return;
    if (poseEnabled && landmarks.length) {
      const point = (index: number) => ({ x: landmarks[index].x * canvas.width, y: landmarks[index].y * canvas.height });
      ctx.strokeStyle = '#10a5b5';
      ctx.lineWidth = Math.max(2, canvas.width / 420);
      ctx.lineCap = 'round';
      poseConnections.forEach(([from, to]) => {
      if (!landmarks[from] || !landmarks[to]) return;
      const a = point(from); const b = point(to);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      landmarks.forEach((landmark, index) => {
      if (index > 28 || (landmark.visibility ?? 1) < 0.35) return;
      const p = point(index);
      ctx.fillStyle = index === 0 ? '#ef9b25' : '#e6fbff';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, canvas.width / 220), 0, Math.PI * 2); ctx.fill();
      });
      const visible = landmarks.filter((landmark) => (landmark.visibility ?? 1) > 0.35);
      if (visible.length) {
      ctx.font = `${Math.max(9, canvas.width / 105)}px monospace`;
      ctx.textBaseline = 'middle';
      bodyPartLandmarks.forEach(({ name, index }) => {
        const landmark = landmarks[index];
        if (!landmark || (landmark.visibility ?? 1) < 0.35) return;
        const p = point(index);
        const shortName = name.replace('LEFT ', 'L-').replace('RIGHT ', 'R-');
        const textWidth = ctx.measureText(shortName).width;
        ctx.fillStyle = 'rgba(10, 38, 43, .8)';
        ctx.fillRect(p.x + 7, p.y - 8, textWidth + 7, 16);
        ctx.fillStyle = '#e6fbff';
        ctx.fillText(shortName, p.x + 10, p.y);
      });
      const xs = visible.map((landmark) => landmark.x * canvas.width);
      const ys = visible.map((landmark) => landmark.y * canvas.height);
      ctx.strokeStyle = '#10a5b5';
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(Math.min(...xs) - 12, Math.min(...ys) - 18, Math.max(...xs) - Math.min(...xs) + 24, Math.max(...ys) - Math.min(...ys) + 36);
      ctx.setLineDash([]);
      }
    }
    if (handEnabled) {
      hands.forEach((hand) => {
        const points = hand.map((landmark) => ({ x: landmark.x * canvas.width, y: landmark.y * canvas.height }));
        ctx.strokeStyle = '#e89b24';
        ctx.fillStyle = '#fff4d6';
        ctx.lineWidth = Math.max(1.5, canvas.width / 500);
        [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]].forEach(([from, to]) => {
          const a = points[from]; const b = points[to];
          if (!a || !b) return;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        });
        points.forEach((point) => { ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(2, canvas.width / 330), 0, Math.PI * 2); ctx.fill(); });
      });
    }
  }, [handEnabled, poseEnabled]);

  const classifyActivity = useCallback((landmarks: NormalizedLandmark[], hands: NormalizedLandmark[][]): Pick<PoseSnapshot, 'activity' | 'motionState' | 'confidence' | 'visibleBodyParts' | 'leftHandVisible' | 'rightHandVisible' | 'pinchDetected' | 'movementDetail' | 'movementParts'> => {
    const visibleBodyParts = bodyPartLandmarks.filter(({ index }) => Boolean(landmarks[index]) && (landmarks[index].visibility ?? 1) > 0.35).map(({ name }) => name);
    const leftHandVisible = hands.some((hand) => hand[17]?.x < 0.5);
    const rightHandVisible = hands.some((hand) => hand[17]?.x >= 0.5);
    const handDistance = (hand: NormalizedLandmark[]) => hand[4] && hand[8] ? Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) : 1;
    const pinchDetected = hands.some((hand) => handDistance(hand) < 0.075);
    if (landmarks.length < 29) return { activity: hands.length ? 'HAND MOVEMENT' : 'UNKNOWN', motionState: hands.length ? 'ACTIVE' : 'IDLE', confidence: hands.length ? 55 : 0, visibleBodyParts, leftHandVisible, rightHandVisible, pinchDetected, movementDetail: hands.length ? 'Hand landmarks available; body pose incomplete' : 'Waiting for a full body pose', movementParts: [] };
    const avg = (a: NormalizedLandmark, b: NormalizedLandmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const shoulder = avg(landmarks[11], landmarks[12]);
    const hip = avg(landmarks[23], landmarks[24]);
    const wrists = avg(landmarks[15], landmarks[16]);
    const previous = previousPointsRef.current;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const movement = previous.length ? distance(wrists, avg(previous[15], previous[16]) as NormalizedLandmark) : 0;
    const leftWristMovement = previous.length ? distance(landmarks[15], previous[15]) : 0;
    const rightWristMovement = previous.length ? distance(landmarks[16], previous[16]) : 0;
    const lowerBodyMovement = previous.length ? (distance(landmarks[23], previous[23]) + distance(landmarks[24], previous[24]) + distance(landmarks[27], previous[27]) + distance(landmarks[28], previous[28])) / 4 : 0;
    previousPointsRef.current = landmarks;
    let activity: ActivityLabel = 'STANDING';
    const movementParts: string[] = [];
    if (leftWristMovement > 0.018) movementParts.push('LEFT WRIST');
    if (rightWristMovement > 0.018) movementParts.push('RIGHT WRIST');
    if (lowerBodyMovement > 0.018) movementParts.push('LEGS / FEET');
    const leftArmRaised = landmarks[15].y < landmarks[11].y - 0.08;
    const rightArmRaised = landmarks[16].y < landmarks[12].y - 0.08;
    if (pinchDetected) activity = 'GRAB / PINCH';
    else if (lowerBodyMovement > 0.05 || movement > 0.055) activity = 'MOVE / TRANSFER';
    else if (leftArmRaised || rightArmRaised) activity = 'REACHING';
    else if (hip.y - shoulder.y > 0.38) activity = 'BENDING';
    else if (movementParts.length) activity = 'HAND MOVEMENT';
    const history = [...activityHistoryRef.current, activity].slice(-5);
    activityHistoryRef.current = history;
    const counts = history.reduce<Record<string, number>>((result, item) => ({ ...result, [item]: (result[item] ?? 0) + 1 }), {});
    const stable = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as ActivityLabel | undefined;
    const detail = pinchDetected ? 'Thumb and index proximity / pinch geometry' : leftArmRaised && rightArmRaised ? 'Both arms raised / reaching motion' : leftArmRaised ? 'Left arm raised / reaching motion' : rightArmRaised ? 'Right arm raised / reaching motion' : lowerBodyMovement > 0.05 ? 'Body displacement / transfer motion' : movementParts.length ? `${movementParts.join(' + ')} moving` : hip.y - shoulder.y > 0.38 ? 'Torso angle changed / bending motion' : 'Upper body stable / standing posture';
    const confidence = Math.min(99.2, Math.max(45, Math.round((0.55 + (landmarks[0]?.visibility ?? 0.55) * 0.45) * 1000) / 10));
    return { activity: stable ?? activity, motionState: movement > 0.035 || lowerBodyMovement > 0.025 || hands.length > 0 ? 'ACTIVE' : 'STABLE', confidence, visibleBodyParts, leftHandVisible, rightHandVisible, pinchDetected, movementDetail: detail, movementParts };
  }, []);

  const stopCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    inferenceBusyRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setStatus('standby');
    previousPointsRef.current = [];
    activityHistoryRef.current = [];
     setPose({ landmarks: [], handLandmarks: [], humanDetected: false, confidence: 0, activity: 'UNKNOWN', motionState: 'IDLE', visibleBodyParts: [], leftHandVisible: false, rightHandVisible: false, pinchDetected: false, movementDetail: 'No movement detected', movementParts: [], updatedAt: 0 });
  }, []);

  const startCamera = useCallback(async (requestedFacingMode: 'user' | 'environment' = facingMode) => {
    stopCamera();
    const sessionId = cameraSessionRef.current;
     if (!navigator.mediaDevices?.getUserMedia) {
       setStatus('unsupported');
       setErrorMessage('This browser does not expose camera access. Use a current browser over HTTPS.');
      return false;
    }
    setStatus('requesting');
    setErrorMessage('');
    try {
       const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: requestedFacingMode }, audio: false });
      if (sessionId !== cameraSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      streamRef.current = stream;
      if (!videoRef.current) return false;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus('live');
      const renderFrame = () => {
        const video = videoRef.current;
        if (sessionId !== cameraSessionRef.current || !video || !streamRef.current) return;
        const now = performance.now();
        if (!inferenceBusyRef.current && now - lastInferenceRef.current > 100 && video.readyState >= 2) {
          lastInferenceRef.current = now;
          inferenceBusyRef.current = true;
           void getLandmarker().then(async (landmarker) => {
             if (sessionId !== cameraSessionRef.current) return;
             if (!landmarker) {
               setStatus('model-error');
               setErrorMessage('Pose model could not be loaded. Check the network connection used for the model asset and try again.');
               return;
             }
             if (sessionId !== cameraSessionRef.current || !videoRef.current || !streamRef.current) return;
             const result = landmarker.detectForVideo(videoRef.current, performance.now());
             const handLandmarker = handEnabled ? await getHandLandmarker() : null;
             if (sessionId !== cameraSessionRef.current) return;
             const handResult = handLandmarker ? handLandmarker.detectForVideo(videoRef.current, performance.now()) : { landmarks: [] };
            const landmarks = result.landmarks?.[0] ?? [];
             const hands = handResult.landmarks ?? [];
             drawPose(landmarks, hands);
             const next = classifyActivity(landmarks, hands);
            if (performance.now() - lastUiUpdateRef.current > 220) {
              lastUiUpdateRef.current = performance.now();
               setPose({ landmarks, handLandmarks: hands, humanDetected: landmarks.length > 0, ...next, updatedAt: Date.now() });
            }
          }).finally(() => { inferenceBusyRef.current = false; });
        }
        rafRef.current = requestAnimationFrame(renderFrame);
      };
      rafRef.current = requestAnimationFrame(renderFrame);
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
       setStatus(name === 'NotFoundError' ? 'missing' : name === 'NotAllowedError' ? 'denied' : 'model-error');
       setErrorMessage(name === 'NotFoundError' ? 'No camera device is available on this system.' : name === 'NotAllowedError' ? 'Allow camera permission in your browser settings and try again.' : 'Camera or local model initialization failed. Reload and try again.');
      return false;
    }
  }, [classifyActivity, drawPose, facingMode, getHandLandmarker, getLandmarker, handEnabled, poseEnabled, stopCamera]);

  const switchCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await startCamera(next);
  }, [facingMode, startCamera]);

  useEffect(() => () => {
    stopCamera();
     landmarkerRef.current?.close();
     handLandmarkerRef.current?.close();
  }, [stopCamera]);

  return { videoRef, canvasRef, status, errorMessage, pose, mirrored, setMirrored, poseEnabled, setPoseEnabled, handEnabled, setHandEnabled, startCamera, switchCamera, stopCamera };
}

function Live() {
  const { running, setRunning, errorMode, guidance, setGuidance, stepIndex, setErrorMode, settings, updateSettings, addAlert, addEvent } = useMission();
  const [feedMode, setFeedMode] = useState<'REAL CAMERA' | 'DEMO SIMULATION'>('REAL CAMERA');
  const [telemetry, setTelemetry] = useState<TelemetryData>(() => getSimulatedTelemetry());
  const [prototypeIndex, setPrototypeIndex] = useState(0);
  const [actionHistory, setActionHistory] = useState<{ time: string; action: string; confidence: number; status: SequenceStatus }[]>([]);
  const [confidenceHistory, setConfidenceHistory] = useState<{ time: string; confidence: number; action: string }[]>([]);
  const camera = useWebcamPose();
  const current = steps[stepIndex];
  const previousErrorRef = useRef(errorMode);
  const lastActionRef = useRef('');
  const lastVoiceRef = useRef<{ message: string; at: number }>({ message: '', at: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => setTelemetry((previous) => ({ ...getSimulatedTelemetry(previous), crewMotion: camera.pose.motionState === 'IDLE' ? 'IDLE' : camera.pose.motionState })), 1800);
    return () => window.clearInterval(timer);
  }, [camera.pose.motionState]);

  useEffect(() => {
    if (errorMode && !previousErrorRef.current && guidance && settings.voiceAssistant) speakGuidance();
    previousErrorRef.current = errorMode;
  }, [errorMode, guidance, settings.voiceAssistant]);

  useEffect(() => {
    camera.setPoseEnabled(settings.showPoseOverlay);
    camera.setHandEnabled(settings.showHandLandmarks);
  }, [camera.setHandEnabled, camera.setPoseEnabled, settings.showHandLandmarks, settings.showPoseOverlay]);

  const expectedPrototypeStep = prototypeSteps[prototypeIndex];
  const sequenceStatus = validatePrototypeSequence(expectedPrototypeStep, camera.pose.activity, camera.pose.confidence);
  useEffect(() => {
    if (!camera.pose.updatedAt || camera.status !== 'live' || camera.pose.activity === lastActionRef.current) return;
    const time = new Date(camera.pose.updatedAt).toLocaleTimeString([], { hour12: false });
    const nextEvent = { time, action: camera.pose.activity, confidence: camera.pose.confidence, status: sequenceStatus };
    lastActionRef.current = camera.pose.activity;
    setActionHistory((value) => [nextEvent, ...value].slice(0, 12));
    setConfidenceHistory((value) => [...value, { time, confidence: camera.pose.confidence, action: camera.pose.activity }].slice(-24));
    addEvent({ timestamp: time, sessionId: 'LOCAL-CAM-01', action: camera.pose.activity, confidence: camera.pose.confidence, expected: expectedPrototypeStep.label, status: sequenceStatus });
    if (sequenceStatus === 'ALIGNED' && prototypeIndex < prototypeSteps.length - 1) setPrototypeIndex((value) => value + 1);
    if (sequenceStatus === 'OUT OF SEQUENCE') {
      setErrorMode(true);
      addAlert();
    }
  }, [addAlert, addEvent, camera.pose.activity, camera.pose.confidence, camera.pose.updatedAt, camera.status, expectedPrototypeStep.label, prototypeIndex, sequenceStatus, setErrorMode]);

  const startExperience = async () => {
    setFeedMode('REAL CAMERA');
    await camera.startCamera();
  };
  const liveActivity = camera.status === 'live' ? camera.pose.activity : 'UNKNOWN';
  const liveConfidence = camera.status === 'live' ? camera.pose.confidence : 0;
  const voice = (message = 'Current action requires verification.') => {
    if (!settings.voiceAssistant) return;
    const now = Date.now();
    if (lastVoiceRef.current.message === message && now - lastVoiceRef.current.at < 5000) return;
    lastVoiceRef.current = { message, at: now };
    speakGuidance(message);
  };
  return <><PageHeader eyebrow="LIVE OBSERVATION / CAMERA 01" title="Live mission view" description="The webcam is the primary input. Pose and hand landmarks are processed locally in the browser; no object detection is claimed." actions={<><div className="tab-pills"><button className={feedMode === 'REAL CAMERA' ? 'active' : ''} onClick={() => setFeedMode('REAL CAMERA')} data-testid="tab-real-camera">LIVE CAMERA</button><button className={feedMode === 'DEMO SIMULATION' ? 'active' : ''} onClick={() => { camera.stopCamera(); setFeedMode('DEMO SIMULATION'); }} data-testid="tab-demo-simulation">TEST / SIMULATION</button></div><button className={`button ${camera.status === 'live' ? 'button-danger' : 'button-primary'}`} onClick={camera.status === 'live' ? camera.stopCamera : startExperience} data-testid="button-live-toggle">{camera.status === 'live' ? <Square size={13} /> : <Camera size={13} />}{camera.status === 'live' ? 'STOP CAMERA' : 'START LIVE CAMERA'}</button></>} />
     <div className="mb-4 flex flex-wrap items-center gap-2"><StatusBadge tone={camera.status === 'live' ? 'green' : 'orange'}>{camera.status === 'live' ? 'CAMERA CONNECTED' : feedMode === 'REAL CAMERA' ? 'CAMERA OFFLINE' : 'TEST / SIMULATION MODE'}</StatusBadge><span className="text-xs text-slate-500">CAM-01 / {camera.status === 'live' ? 'LIVE SENSOR' : 'AWAITING INPUT'}</span>{camera.status === 'live' && <span className="font-mono-data text-[10px] text-slate-500 sm:ml-auto">LOCAL INFERENCE · VIDEO 1280×720</span>}</div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]"><CameraPanel running={running} errorMode={errorMode} feedMode={feedMode} camera={camera} showConfidence={settings.showConfidence} /><div className="space-y-5"><LiveActionAnalysis action={liveActivity} confidence={liveConfidence} expected={expectedPrototypeStep.label} status={sequenceStatus} pose={camera.pose} previous={actionHistory[1]} showConfidence={settings.showConfidence} showHistory={settings.showActionHistory} onVoice={() => voice()} onAcknowledge={() => setErrorMode(false)} voiceEnabled={settings.voiceAssistant && guidance} onToggleVoice={() => { setGuidance(!guidance); updateSettings({ voiceAssistant: !settings.voiceAssistant }); }} /><div className="panel p-4"><SectionLabel>CAMERA CONTROLS</SectionLabel><div className="grid grid-cols-2 gap-2"><button className="control-button" onClick={() => camera.status === 'live' ? camera.stopCamera() : startExperience()}><Camera size={14} /> {camera.status === 'live' ? 'Stop camera' : 'Start camera'}</button><button className="control-button" onClick={() => camera.status === 'live' ? camera.switchCamera() : startExperience()}><ArrowRight size={14} /> Switch camera</button><button className="control-button" onClick={() => window.alert('Camera stream re-synchronized locally.')}><RefreshCw size={14} /> Re-sync</button><button className="control-button" onClick={() => document.querySelector('.camera-surface')?.requestFullscreen?.()}><Monitor size={14} /> Fullscreen</button></div><div className="mt-3 flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-[10px]"><span>POSE / HAND OVERLAY</span><button className={`switch ${settings.showPoseOverlay || settings.showHandLandmarks ? 'switch-on' : ''}`} onClick={() => updateSettings({ showPoseOverlay: !settings.showPoseOverlay, showHandLandmarks: !settings.showHandLandmarks })}><span /></button></div></div></div></div>
     {settings.showTelemetry && <MissionTelemetry telemetry={{ ...telemetry, cameraFps: camera.status === 'live' ? telemetry.cameraFps : 0, aiLatency: camera.status === 'live' ? telemetry.aiLatency : 0 }} />}<div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_.8fr]"><LiveConfidenceGraph data={confidenceHistory} /><ActionEventStream events={actionHistory} /><SequenceStrip status={sequenceStatus} step={prototypeIndex} /></div>
   </>;
}

function CameraPanel({ running, errorMode, feedMode, camera, showConfidence }: { running: boolean; errorMode: boolean; feedMode: 'REAL CAMERA' | 'DEMO SIMULATION'; camera: ReturnType<typeof useWebcamPose>; showConfidence: boolean }) {
  const isLive = feedMode === 'REAL CAMERA' && camera.status === 'live';
  const simulated = feedMode === 'DEMO SIMULATION';
  return <div className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="flex items-center gap-2"><span className={`live-dot h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-red-500'}`} /><span className="eyebrow text-slate-500">CAM-01 / {isLive ? 'LIVE SENSOR' : simulated ? 'SIMULATED SENSOR' : 'STANDBY'}</span></div><div className="flex gap-2"><StatusBadge tone={isLive ? 'green' : camera.status === 'requesting' ? 'orange' : camera.status === 'denied' || camera.status === 'missing' ? 'red' : 'slate'}>{camera.status === 'requesting' ? 'REQUESTING' : isLive ? 'CAMERA LIVE' : camera.status === 'denied' ? 'ACCESS DENIED' : camera.status === 'missing' ? 'NO CAMERA' : camera.status === 'unsupported' ? 'UNSUPPORTED' : camera.status === 'model-error' ? 'MODEL ERROR' : running ? 'STREAMING' : 'STANDBY'}</StatusBadge><span className="font-mono-data text-[10px] text-slate-400">{isLive ? 'LOCAL' : '—'}</span></div></div><div className={`camera-surface scanline ${isLive ? 'camera-live-surface' : 'grid-radar'}`}><video ref={camera.videoRef} className={`camera-video ${camera.mirrored ? 'camera-mirrored' : ''} ${isLive ? 'camera-visible' : ''}`} playsInline muted autoPlay aria-label="Local webcam feed" /><canvas ref={camera.canvasRef} className={`camera-pose-overlay ${camera.mirrored ? 'camera-mirrored' : ''} ${isLive && camera.poseEnabled ? 'camera-visible' : ''}`} /><div className="camera-corners" /><div className="camera-grid-label label-tl">ZONE A / 01</div><div className="camera-grid-label label-tr">{isLive ? 'EDGE AI ON' : simulated ? 'TEST / SIMULATION MODE' : 'CAMERA OFFLINE'}</div>{isLive && camera.pose.humanDetected && <><div className="camera-human-label">P-01 / CREW {showConfidence && <b>{camera.pose.confidence}%</b>}</div><div className="camera-activity-label">ACTIVITY: {camera.pose.activity}</div>{showConfidence && <div className="camera-confidence-label">CONFIDENCE: {camera.pose.confidence}%</div>}<div className="camera-pose-readout" aria-live="polite"><span><b>BODY</b> {camera.pose.visibleBodyParts.join(' · ') || 'NOT CLEAR'}</span><span><b>LEFT HAND</b> {camera.pose.leftHandVisible ? 'VISIBLE' : 'NOT CLEAR'} · <b>RIGHT HAND</b> {camera.pose.rightHandVisible ? 'VISIBLE' : 'NOT CLEAR'}</span><span><b>MOVEMENT</b> {camera.pose.movementDetail}</span></div></>}{camera.status === 'requesting' && <div className="camera-status-card"><LoaderGlyph /><b>REQUESTING CAMERA ACCESS...</b><span>Keep this tab open while the browser permission prompt is visible.</span></div>}{camera.status === 'denied' && <div className="camera-status-card camera-status-error"><AlertTriangle size={24} /><b>CAMERA ACCESS DENIED</b><span>{camera.errorMessage || 'Allow camera permission in your browser settings and try again.'}</span></div>}{camera.status === 'missing' && <div className="camera-status-card"><Camera size={24} /><b>NO CAMERA DETECTED</b><span>{camera.errorMessage}</span></div>}{(camera.status === 'unsupported' || camera.status === 'model-error') && <div className="camera-status-card camera-status-error"><AlertTriangle size={24} /><b>{camera.status === 'unsupported' ? 'UNSUPPORTED BROWSER' : 'LOCAL MODEL FAILURE'}</b><span>{camera.errorMessage}</span></div>}{simulated && camera.status !== 'requesting' && <><div className={`person-box ${errorMode ? 'person-box-warning' : ''}`}><span className="box-label">P-01 / CREW</span><PoseSkeleton /></div><div className="object-box pouch-box"><span className="box-label">PROTOTYPE TARGET</span></div><div className="object-box tray-box"><span className="box-label">PROTOTYPE ZONE</span></div></>}{camera.status === 'standby' && feedMode === 'REAL CAMERA' && <div className="camera-status-card"><Camera size={24} /><b>CAMERA OFFLINE</b><span>Click START LIVE CAMERA to request browser access.</span></div>}<div className="camera-watermark"><Radio size={12} /> {isLive ? 'LOCAL CAMERA PROCESSING / NO CLOUD UPLOAD' : simulated ? 'TEST / SIMULATION MODE' : 'NO LIVE INPUT'}</div></div><div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3"><div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-slate-500"><span><i className="legend-dot bg-cyan-600" /> BODY LANDMARKS</span><span><i className="legend-dot bg-orange-500" /> HAND LANDMARKS</span><span><i className="legend-dot bg-red-500" /> ATTENTION</span></div><span className="font-mono-data text-[10px] text-slate-500">LATENCY {camera.status === 'live' ? 'LOCAL' : '—'}</span></div></div>;
}

function LoaderGlyph() { return <span className="camera-loader" aria-hidden="true" />; }

function MissionTelemetry({ telemetry }: { telemetry: TelemetryData }) {
  const items = [['CABIN TEMPERATURE', `${telemetry.temperature} °C`, 'stable'], ['HUMIDITY', `${telemetry.humidity} %`, 'stable'], ['PRESSURE', `${telemetry.pressure} kPa`, 'stable'], ['CO2', `${telemetry.co2} ppm`, 'nominal'], ['O2', `${telemetry.oxygen} %`, 'nominal'], ['HEART RATE', `${telemetry.heartRate} BPM`, 'simulated'], ['CREW MOTION', telemetry.crewMotion, 'pose signal'], ['CAMERA FPS', `${telemetry.cameraFps} FPS`, 'display'], ['AI LATENCY', `${telemetry.aiLatency} ms`, 'local inference'], ['SYSTEM UPTIME', telemetry.uptime, 'session']]; 
  return <section className="mission-telemetry mt-5"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><SectionLabel>MISSION TELEMETRY / SIMULATED TELEMETRY</SectionLabel><p className="text-[11px] text-slate-500">Telemetry values are simulated for demonstration and are not derived from the webcam.</p></div><StatusBadge tone="slate">NO CLOUD UPLOAD</StatusBadge></div><div className="telemetry-grid">{items.map(([label, value, detail]) => <div className="telemetry-card" key={label}><span className="eyebrow text-slate-400">{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div></section>;
}

function PoseSkeleton() { return <svg className="pose-skeleton" viewBox="0 0 150 270" aria-label="Simulated pose skeleton"><circle cx="80" cy="25" r="16" /><path d="M80 41 L77 103 L47 145 L29 210 M77 103 L113 142 L128 207 M78 58 L41 91 L21 124 M78 58 L113 84 L135 116" /><circle cx="21" cy="124" r="4" /><circle cx="135" cy="116" r="4" /><circle cx="29" cy="210" r="4" /><circle cx="128" cy="207" r="4" /></svg>; }
function LiveActionAnalysis({ action, confidence, expected, status, pose, previous, showConfidence, showHistory, onVoice, onAcknowledge, voiceEnabled, onToggleVoice }: { action: string; confidence: number; expected: string; status: SequenceStatus; pose: PoseSnapshot; previous?: { action: string; confidence: number; status: SequenceStatus }; showConfidence: boolean; showHistory: boolean; onVoice: () => void; onAcknowledge: () => void; voiceEnabled: boolean; onToggleVoice: () => void }) {
  const critical = status === 'OUT OF SEQUENCE' || status === 'LOW CONFIDENCE';
  return <div className="panel p-5"><div className="flex items-start justify-between"><div><SectionLabel>LIVE ACTION ANALYSIS</SectionLabel><h2 className="text-[1.05rem] font-extrabold">{action}</h2></div><StatusBadge tone={critical ? 'red' : status === 'ALIGNED' ? 'green' : 'orange'}>{status}</StatusBadge></div><div className={`intelligence-state ${critical ? 'state-critical' : ''}`}><div className="state-icon">{critical ? <AlertTriangle size={20} /> : <Activity size={20} />}</div><div><div className="text-xs font-bold">EXPECTED: {expected}</div><div className="mt-1 text-[11px] text-slate-500">{status === 'ALIGNED' ? 'Physical action matches the prototype workflow gate.' : status === 'UNKNOWN' ? 'Waiting for reliable landmarks.' : 'No automatic workflow advance until verification.'}</div></div></div><div className="mt-4 space-y-3">{showConfidence && <><div className="flex justify-between text-xs"><span className="text-slate-500">Confidence</span><strong>{confidence.toFixed(1)}%</strong></div><div className="confidence-track"><div className={`confidence-fill ${critical ? 'fill-red' : 'fill-cyan'}`} style={{ width: `${confidence}%` }} /></div></>}<div className="grid grid-cols-2 gap-2"><div className="metric-box"><span className="eyebrow">LEFT HAND</span><b className={pose.leftHandVisible ? 'text-emerald-600' : 'text-slate-500'}>{pose.leftHandVisible ? 'VISIBLE' : 'NOT CLEAR'}</b></div><div className="metric-box"><span className="eyebrow">RIGHT HAND</span><b className={pose.rightHandVisible ? 'text-emerald-600' : 'text-slate-500'}>{pose.rightHandVisible ? 'VISIBLE' : 'NOT CLEAR'}</b></div><div className="metric-box"><span className="eyebrow">HEAD / TORSO</span><b>{pose.visibleBodyParts.includes('HEAD') && pose.visibleBodyParts.includes('LEFT HIP') ? 'VISIBLE' : 'NOT CLEAR'}</b></div><div className="metric-box"><span className="eyebrow">STABILITY</span><b>{pose.motionState}</b></div></div></div>{critical && <div className="sequence-deviation"><span className="eyebrow text-red-600">SEQUENCE MISMATCH</span><p className="mt-1 text-xs font-semibold">Expected: {expected} · Detected: {action} · Verify before proceeding.</p><div className="mt-3 flex gap-2"><button className="button button-danger" onClick={onAcknowledge}><Check size={13} /> VERIFY</button><button className="button button-ghost" onClick={onVoice}><Mic size={13} /> REQUEST GUIDANCE</button></div></div>}<div className="mt-4 grid grid-cols-2 gap-2"><button className="guidance-callout" onClick={onVoice}><span className="flex h-8 w-8 items-center justify-center rounded bg-white/70"><Mic size={15} /></span><span className="flex-1 text-left"><b>Voice test</b><small>{voiceEnabled ? 'Assistant ON / local' : 'Assistant OFF'}</small></span></button><button className={`guidance-callout ${voiceEnabled ? '' : 'guidance-off'}`} onClick={onToggleVoice}><span className="flex h-8 w-8 items-center justify-center rounded bg-white/70"><Wifi size={15} /></span><span className="flex-1 text-left"><b>Voice assistant</b><small>{voiceEnabled ? 'ON' : 'OFF'}</small></span><span className={`toggle ${voiceEnabled ? 'toggle-on' : ''}`} /></button></div>{showHistory && <div className="mt-4 border-t border-slate-200 pt-3"><div className="flex justify-between"><span className="eyebrow">PREVIOUS ACTION</span><span className="font-mono-data text-[10px] text-slate-500">{previous?.confidence ? `${previous.confidence.toFixed(1)}%` : '—'}</span></div><b className="mt-1 block text-xs">{previous?.action || 'No stable event yet'}</b></div>}</div>;
}
function LiveConfidenceGraph({ data }: { data: { time: string; confidence: number; action: string }[] }) {
  return <div className="panel p-4"><div className="flex items-center justify-between"><SectionLabel>CONFIDENCE GRAPH</SectionLabel><span className="font-mono-data text-[10px] text-slate-500">LIVE EVENTS</span></div>{data.length ? <div className="h-32"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke="#e5e9ed" vertical={false} /><XAxis dataKey="time" hide /><YAxis domain={[0, 100]} hide /><Line type="monotone" dataKey="confidence" stroke="#0891b2" strokeWidth={2} dot={{ r: 2 }} /></LineChart></ResponsiveContainer></div> : <div className="flex h-32 items-center justify-center text-center text-xs text-slate-500">Start the camera to record<br />confidence from real landmarks.</div>}</div>;
}
function ActionEventStream({ events }: { events: { time: string; action: string; confidence: number; status: SequenceStatus }[] }) {
  return <div className="panel p-4"><SectionLabel>ACTION TIMELINE</SectionLabel><div className="event-stream">{events.length ? events.map((event) => <div className="event-stream-row" key={`${event.time}-${event.action}`}><span className="font-mono-data text-[10px] text-slate-400">{event.time}</span><b>{event.action}</b><span className="font-mono-data text-[10px]">{event.confidence.toFixed(1)}%</span><StatusBadge tone={event.status === 'ALIGNED' ? 'green' : event.status === 'OUT OF SEQUENCE' ? 'red' : 'orange'}>{event.status}</StatusBadge></div>) : <div className="py-12 text-center text-xs text-slate-500">Stable recognition events will appear here.</div>}</div></div>;
}
function CurrentIntelligence({ current, errorMode, guidance, setGuidance, activity, confidence, humanDetected, visibleBodyParts, movementDetail, movementParts, onVoice, onAcknowledge }: { current: Step; errorMode: boolean; guidance: boolean; setGuidance: (value: boolean) => void; activity: string; confidence: number; humanDetected: boolean; visibleBodyParts: BodyPartName[]; movementDetail: string; movementParts: string[]; onVoice: () => void; onAcknowledge: () => void }) {
  return <div className="panel p-5"><div className="flex items-start justify-between"><div><SectionLabel>CURRENT-ACTIVITY INTELLIGENCE</SectionLabel><h2 className="text-[1.05rem] font-extrabold">{errorMode ? 'Sequence deviation' : activity}</h2></div><StatusBadge tone={errorMode ? 'red' : 'orange'}>{errorMode ? 'VIOLATION' : 'ACTIVE'}</StatusBadge></div><div className={`intelligence-state ${errorMode ? 'state-critical' : ''}`}><div className="state-icon">{errorMode ? <AlertTriangle size={20} /> : <Activity size={20} />}</div><div><div className="text-xs font-bold">{errorMode ? 'SEQUENCE DEVIATION' : humanDetected ? movementDetail : 'Temporal gate evaluating'}</div><div className="mt-1 text-[11px] text-slate-500">{errorMode ? 'Expected: PLACE SAMPLE · Detected: ACTIVATE DEVICE' : humanDetected ? `Named movement: ${activity}` : `Expected action: ${current.name}`}</div></div></div>{humanDetected && <div className="body-part-panel"><div><span className="eyebrow">BODY PARTS IN FRAME</span><div className="body-part-list">{visibleBodyParts.length ? visibleBodyParts.map((part) => <span className="body-part-chip" key={part}>{part}</span>) : <span className="text-[10px] text-slate-500">No visible landmarks</span>}</div></div><div className="mt-3"><span className="eyebrow">MOVEMENT SIGNAL</span><strong className="movement-detail">{movementDetail}</strong>{movementParts.length > 0 && <span className="movement-parts">Moving: {movementParts.join(' · ')}</span>}</div></div>}<div className="mt-4 space-y-3"><div className="flex justify-between text-xs"><span className="text-slate-500">Activity confidence</span><strong>{confidence.toFixed(1)}%</strong></div><div className="confidence-track"><div className={`confidence-fill ${errorMode ? 'fill-red' : 'fill-cyan'}`} style={{ width: `${confidence}%` }} /></div><div className="grid grid-cols-2 gap-3 text-xs"><div><span className="block text-slate-500">Motion state</span><strong>{humanDetected ? 'ACTIVE' : 'STABLE'}</strong></div><div><span className="block text-slate-500">Human detected</span><strong className={humanDetected ? 'text-emerald-600' : 'text-slate-500'}>{humanDetected ? 'YES' : 'NO'}</strong></div></div></div>{errorMode && <div className="sequence-deviation"><span className="eyebrow text-red-600">VOICE GUIDANCE</span><p className="mt-1 text-xs font-semibold">“{guidanceMessage}”</p><div className="mt-3 flex gap-2"><button className="button button-danger" onClick={onAcknowledge}><Check size={13} /> ACKNOWLEDGE</button><button className="button button-ghost" onClick={onAcknowledge}>RETURN TO EXPECTED STEP</button></div></div>}<div className="mt-4 grid grid-cols-2 gap-2"><button className="guidance-callout" onClick={onVoice}><span className="flex h-8 w-8 items-center justify-center rounded bg-white/70"><Mic size={15} /></span><span className="flex-1 text-left"><b>Voice guidance</b><small>Play cue locally</small></span></button><button className={`guidance-callout ${guidance ? '' : 'guidance-off'}`} onClick={() => setGuidance(!guidance)}><span className="flex h-8 w-8 items-center justify-center rounded bg-white/70"><Wifi size={15} /></span><span className="flex-1 text-left"><b>Guidance channel</b><small>{guidance ? 'Armed / EN-IN' : 'Muted'}</small></span><span className={`toggle ${guidance ? 'toggle-on' : ''}`} /></button></div></div>;
}
function PerceptionStrip({ live, confidence }: { live: boolean; confidence: number }) { return <div className="panel p-4"><SectionLabel>PERCEPTION</SectionLabel><div className="flex items-end justify-between"><div><div className="text-xl font-extrabold">01</div><div className="text-[11px] text-slate-500">{live ? 'live person track' : 'demo person track'}</div></div><MiniSpark /><StatusBadge tone={live ? 'green' : 'slate'}>{confidence.toFixed(1)}%</StatusBadge></div></div>; }
function ActivityStrip({ activity, confidence }: { activity: string; confidence: number }) { return <div className="panel p-4"><SectionLabel>ACTIVITY MODEL</SectionLabel><div className="flex items-end justify-between gap-2"><div><div className="text-xl font-extrabold">{activity}</div><div className="text-[11px] text-slate-500">current label</div></div><MiniSpark data={confidenceData.map((d) => ({ confidence: d.activity }))} /><StatusBadge tone="orange">{confidence.toFixed(1)}%</StatusBadge></div></div>; }
function SequenceStrip({ status, step }: { status: SequenceStatus; step: number }) { const critical = status === 'OUT OF SEQUENCE' || status === 'LOW CONFIDENCE'; return <div className="panel p-4"><SectionLabel>SEQUENCE GATE</SectionLabel><div className="flex items-end justify-between"><div><div className="text-xl font-extrabold">{step + 1} / {prototypeSteps.length}</div><div className="text-[11px] text-slate-500">{prototypeSteps[step]?.label}</div></div><div className={`flex items-center gap-1 ${critical ? 'text-red-600' : status === 'ALIGNED' ? 'text-emerald-600' : 'text-orange-600'}`}>{critical ? <AlertTriangle size={22} /> : status === 'ALIGNED' ? <CheckCircle2 size={22} /> : <Timer size={22} />}<span className="text-xs font-bold">{status}</span></div></div></div>; }

function Workflow() {
  const { stepIndex, setStepIndex } = useMission();
  const selected = steps[stepIndex];
  return <><PageHeader eyebrow="WORKFLOW DATA / SEQUENCE VALIDATION" title="Experiment workflow" description="Imported handbook lifecycle data and camera-action validation are kept as separate layers." actions={<button className="button button-ghost" onClick={() => window.alert('Workflow export prepared from the local data layer.')}><Download size={14} /> EXPORT WORKFLOW</button>} /><div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><div className="panel p-5"><SectionLabel>WORKFLOW SOURCE</SectionLabel><h2 className="text-sm font-extrabold">{workflowCatalog.workflow_metadata.source}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{workflowCatalog.workflow_metadata.note}</p><div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge tone="green">SOURCE IMPORTED</StatusBadge><span className="text-[10px] text-slate-500">{workflowCatalog.workflow_steps.length} lifecycle steps · {workflowCatalog.workflow_decisions.length} decisions · {workflowCatalog.workflow_loops.length} loops</span></div></div><div className="panel p-5"><SectionLabel>PROTOTYPE CAMERA WORKFLOW</SectionLabel><h2 className="text-sm font-extrabold">{workflowCatalog.prototype_camera_workflow.title}</h2><p className="mt-2 text-xs text-slate-500">Local demonstration mapping only — not an official JAXA procedure.</p><div className="mt-4 flex flex-wrap gap-2">{prototypeSteps.map((item, index) => <span className={`workflow-chip ${index === 0 ? 'workflow-chip-active' : ''}`} key={item.id}>{index + 1}. {item.label}</span>)}</div></div></div><div className="mb-5 panel p-5"><div className="flex items-start justify-between gap-4"><div><SectionLabel>IMPORTED HANDBOOK LIFECYCLE</SectionLabel><h2 className="text-sm font-extrabold">Planning, safety, branch selection, and on-orbit operations</h2><p className="mt-1 text-xs text-slate-500">These are source-backed lifecycle actions, not camera-detectable astronaut actions.</p></div><StatusBadge tone="orange">NOT AN EXECUTABLE CREW PROCEDURE</StatusBadge></div><div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">{workflowCatalog.workflow_steps.slice(0, 9).map((item) => <div className="rounded border border-slate-200 p-3" key={item.id}><div className="font-mono-data text-[10px] text-cyan-700">{item.id} · {item.source_reference}</div><div className="mt-1 text-xs font-bold">{item.name}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{item.actor}</div></div>)}</div></div><div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><div className="panel overflow-hidden"><div className="table-head grid grid-cols-[.35fr_1.4fr_.8fr_.8fr_.7fr]"><span>GATE</span><span>EXPECTED ACTIVITY</span><span>DETECTED</span><span>CONFIDENCE</span><span>STATE</span></div>{steps.map((step, index) => <button key={step.id} className={`workflow-row grid grid-cols-[.35fr_1.4fr_.8fr_.8fr_.7fr] ${index === stepIndex ? 'workflow-selected' : ''}`} onClick={() => setStepIndex(index)} data-testid={`workflow-step-${step.id}`}><span className="font-mono-data text-xs text-slate-400">0{step.id}</span><span><strong className="block text-left text-xs">{step.name}</strong><small className="block text-left text-[10px] text-slate-500">{step.duration} elapsed</small></span><span className="text-left text-[11px] text-slate-500">{step.detected}</span><span className="text-left font-mono-data text-xs">{step.confidence ? `${step.confidence}%` : '—'}</span><span className="text-left"><StatusBadge tone={step.state === 'verified' ? 'green' : step.state === 'active' ? 'orange' : 'slate'}>{step.state}</StatusBadge></span></button>)}</div><WorkflowDetail step={selected} /></div></>;
}
function WorkflowDetail({ step }: { step: Step }) { return <div className="panel p-5"><SectionLabel>SELECTED GATE / 0{step.id}</SectionLabel><h2 className="text-lg font-extrabold">{step.name}</h2><p className="mt-1 text-sm text-slate-500">The sequence gate uses expected state, perception evidence and temporal context before accepting this action.</p><div className="mt-5 space-y-3"><div className="detail-line"><span>EXPECTED</span><b>{step.expected}</b></div><div className="detail-line"><span>DETECTED</span><b className="text-cyan-700">{step.detected}</b></div><div className="detail-line"><span>TIME WINDOW</span><b className="font-mono-data">00:45 – 01:20</b></div><div className="detail-line"><span>GATE RESULT</span><StatusBadge tone={step.state === 'verified' ? 'green' : step.state === 'active' ? 'orange' : 'slate'}>{step.state === 'active' ? 'EVALUATING' : step.state.toUpperCase()}</StatusBadge></div></div><div className="mt-6 rounded-md bg-slate-50 p-4"><div className="mb-2 flex justify-between text-xs font-bold"><span>CONFIDENCE</span><span>{step.confidence || 0}%</span></div><div className="confidence-track"><div className="confidence-fill fill-cyan" style={{ width: `${step.confidence}%` }} /></div></div></div>; }

function Perception() {
  return <><PageHeader eyebrow="AI PERCEPTION / MULTI-MODAL" title="Perception workspace" description="Landmark visibility and movement geometry from the live camera. Object detection is intentionally not claimed." actions={<StatusBadge tone="cyan">POSE + HANDS</StatusBadge>} /><div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><div className="space-y-5"><div className="panel p-5"><SectionLabel>PERSON / BODY LANDMARKS</SectionLabel><div className="flex items-center gap-4"><div className="perception-avatar"><ScanFace size={25} /></div><div className="flex-1"><b className="text-sm">Pose Landmarker</b><p className="mt-2 text-[11px] leading-5 text-slate-500">Use Live Mission for camera-backed visibility, action classification, and confidence values.</p><StatusBadge tone="green">LOCAL MODEL</StatusBadge></div></div></div><div className="panel p-5"><SectionLabel>OBJECT DETECTION</SectionLabel><div className="rounded border border-dashed border-slate-300 p-4 text-xs text-slate-500">NOT IMPLEMENTED — the console reports hand position, pinch geometry, movement, reaching, and placement motion instead of claiming an object was grabbed.</div></div><div className="panel p-5"><SectionLabel>HAND LANDMARKS</SectionLabel><div className="interaction-card"><div className="interaction-icon"><HandIcon /></div><div><b className="text-xs">THUMB / INDEX GEOMETRY</b><p className="mt-1 text-[11px] text-slate-500">Pinch is inferred from landmark distance; object identity is not inferred.</p></div><StatusBadge tone="orange">CAMERA INPUT</StatusBadge></div></div></div><div className="space-y-5"><div className="panel p-5"><div className="mb-3 flex items-center justify-between"><div><SectionLabel>POSE / SKELETON</SectionLabel><h2 className="text-sm font-extrabold">Landmark visualization</h2></div><StatusBadge tone="slate">LIVE PAGE</StatusBadge></div><div className="pose-map"><PoseSkeleton /><div className="pose-metric metric-shoulder">SHOULDER / VISIBILITY</div><div className="pose-metric metric-wrist">WRIST / VISIBILITY</div><div className="pose-metric metric-hip">HIP / VISIBILITY</div></div></div><div className="panel p-5"><SectionLabel>MODEL BOUNDARY</SectionLabel><p className="text-xs leading-5 text-slate-500">The current prototype uses MediaPipe Pose Landmarker and Hand Landmarker in the browser. Confidence is evidence for review, not guaranteed correctness.</p></div></div></div></>;
}
function HandIcon() { return <div className="hand-icon-shape"><span /><span /><span /><span /></div>; }

function ActivityPage() {
  const { stepIndex } = useMission();
  return <><PageHeader eyebrow="ACTIVITY RECOGNITION / TEMPORAL WINDOW" title="Activity model" description="The current label is fused with what came before and what is expected next." actions={<StatusBadge tone="orange">WINDOW 2.4s</StatusBadge>} /><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="panel p-5"><SectionLabel>CURRENT ACTIVITY</SectionLabel><div className="activity-number">04</div><h2 className="mt-2 text-xl font-extrabold">Transfer sample to tray</h2><p className="mt-1 text-sm text-slate-500">Body movement and hand geometry are analysed as a prototype activity signal.</p><div className="mt-5"><div className="mb-2 flex justify-between text-xs"><span>MODEL CONFIDENCE</span><b className="text-cyan-700">88.7%</b></div><div className="confidence-track h-3"><div className="confidence-fill fill-cyan" style={{ width: '88.7%' }} /></div></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="metric-box"><span className="eyebrow">DURATION</span><b>00:41</b></div><div className="metric-box"><span className="eyebrow">TRACK ID</span><b>P-01</b></div></div></div><div className="panel p-5"><SectionLabel>TEMPORAL ACTIVITY TIMELINE</SectionLabel><div className="activity-timeline">{steps.map((step, index) => <div className={`activity-event ${index === stepIndex ? 'event-current' : ''}`} key={step.id}><div className="event-time font-mono-data">{index < stepIndex ? `10:4${index + 1}:2${index}` : index === stepIndex ? 'NOW' : 'NEXT'}</div><div className={`event-node event-${step.state}`}><span /></div><div><b className="text-xs">{step.name}</b><div className="mt-1 text-[11px] text-slate-500">{index < stepIndex ? 'Completed / verified' : index === stepIndex ? 'Currently being evaluated' : 'Awaiting prior state'}</div></div><div className="ml-auto w-20"><div className="confidence-track"><div className={`confidence-fill ${step.confidence ? 'fill-cyan' : 'fill-slate'}`} style={{ width: `${step.confidence || 8}%` }} /></div>{step.confidence > 0 && <span className="font-mono-data text-[10px] text-slate-400">{step.confidence}%</span>}</div></div>)}</div></div></div><div className="mt-5 panel p-5"><SectionLabel>PREVIOUS / CURRENT / NEXT</SectionLabel><div className="grid gap-3 md:grid-cols-3"><div className="activity-card muted"><span className="eyebrow">PREVIOUS</span><b>Open containment sleeve</b><StatusBadge tone="green">VERIFIED</StatusBadge></div><div className="activity-card current"><span className="eyebrow text-orange-700">CURRENT</span><b>Transfer sample to tray</b><StatusBadge tone="orange">88.7% CONFIDENCE</StatusBadge></div><div className="activity-card muted"><span className="eyebrow">NEXT</span><b>Secure tray and verify</b><StatusBadge tone="slate">PENDING</StatusBadge></div></div></div></>;
}

function Sequence() {
  const { errorMode, setErrorMode, guidance, setGuidance, addAlert } = useMission();
  const triggerError = () => { setErrorMode(!errorMode); if (!errorMode) addAlert(); };
  return <><PageHeader eyebrow="TEMPORAL AI / DECISION GATE" title="Sequence intelligence" description="A transparent state-machine view of how expected and detected activity paths are reconciled." actions={<><button className="button button-ghost" onClick={() => setGuidance(!guidance)}><Mic size={14} /> {guidance ? 'MUTE GUIDANCE' : 'ENABLE GUIDANCE'}</button><button className={`button ${errorMode ? 'button-primary' : 'button-danger'}`} onClick={triggerError} data-testid="button-trigger-sequence-error">{errorMode ? <Check size={14} /> : <AlertTriangle size={14} />}{errorMode ? 'RECOVER SEQUENCE' : 'TRIGGER ERROR MODE'}</button></>} /><div className={`sequence-alert ${errorMode ? 'sequence-alert-critical' : ''}`}><div className="flex h-9 w-9 items-center justify-center rounded bg-white/70">{errorMode ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}</div><div className="flex-1"><b>{errorMode ? 'Out-of-sequence violation detected' : 'Current path validated'}</b><p>{errorMode ? 'Detected activity “secure tray” arrived before the transfer gate was accepted.' : 'Steps 01–03 are accepted. Step 04 is the active temporal gate.'}</p></div><StatusBadge tone={errorMode ? 'red' : 'green'}>{errorMode ? 'ACTION REQUIRED' : 'SEQUENCE VALID'}</StatusBadge></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><div className="panel p-5"><div className="mb-4 flex justify-between"><SectionLabel>STATE MACHINE / LIVE TRACE</SectionLabel><span className="font-mono-data text-[10px] text-slate-500">FSM-BAS-06</span></div><StateMachine errorMode={errorMode} /></div><div className="space-y-5"><div className="panel p-5"><SectionLabel>EXPECTED VS DETECTED</SectionLabel><div className="compare-row"><span className="compare-label">EXPECTED PATH</span><div className="path-line">{['INGRESS', 'ACQUIRE', 'OPEN', 'TRANSFER', 'SECURE'].map((x, i) => <span className={i < 4 ? 'path-done' : ''} key={x}>{x}</span>)}</div></div><div className="compare-row"><span className="compare-label">DETECTED PATH</span><div className={`path-line ${errorMode ? 'path-error' : ''}`}>{['INGRESS', 'ACQUIRE', 'OPEN', errorMode ? 'SECURE' : 'TRANSFER', 'TRANSFER'].map((x, i) => <span className={i < 3 ? 'path-done' : i === 3 && errorMode ? 'path-bad' : ''} key={`${x}-${i}`}>{x}</span>)}</div></div></div><div className="panel p-5"><SectionLabel>LOCAL GUIDANCE</SectionLabel><div className={`voice-panel ${guidance ? 'voice-on' : ''}`}><div className="voice-bars">{[1, 2, 3, 4, 5, 6].map((x) => <i key={x} style={{ height: `${10 + (x % 3) * 7}px` }} />)}</div><div><b className="text-sm">{guidance ? '“Please complete sample transfer before securing tray.”' : 'Guidance channel muted'}</b><p className="mt-1 text-[11px] text-slate-500">Generated locally · no network required</p></div></div></div></div></div></>;
}
function StateMachine({ errorMode }: { errorMode: boolean }) { return <div className="state-machine">{['S0 IDLE', 'S1 INGRESS', 'S2 ACQUIRE', 'S3 OPEN', 'S4 TRANSFER', 'S5 SECURE'].map((x, i) => <div key={x} className="machine-col"><div className={`machine-node ${i < 4 ? 'machine-done' : i === 4 && !errorMode ? 'machine-current' : i === 4 && errorMode ? 'machine-alert' : ''}`}><span>{i < 4 ? <Check size={15} /> : i + 1}</span></div><b>{x.split(' ')[0]}</b><small>{x.split(' ')[1]}</small>{i < 5 && <ArrowRight className={`machine-arrow ${i === 3 && errorMode ? 'arrow-error' : ''}`} size={17} />}</div>)}</div>; }

function Alerts() {
  const { alerts } = useMission();
  const [filter, setFilter] = useState('ALL');
  const data = [{ type: 'WARNING', title: 'Sequence confidence below threshold', copy: 'Transfer sample to tray is at 88.7%, below nominal 90% gate.', time: '10:42:32', confidence: '88.7%', tone: 'orange' as Tone }, { type: 'INFO', title: 'Camera stream synchronized', copy: 'CAM-01 is ready for local camera input.', time: '10:42:12', confidence: '—', tone: 'cyan' as Tone }, { type: 'CRITICAL', title: 'Out-of-sequence action', copy: 'Tray secure gesture observed before transfer gate acceptance.', time: '09:58:04', confidence: '64.2%', tone: 'red' as Tone }, { type: 'INFO', title: 'Voice guidance acknowledged', copy: 'Crew cue delivered through local audio channel.', time: '09:57:51', confidence: '—', tone: 'cyan' as Tone }];
  const visible = filter === 'ALL' ? data : data.filter((item) => item.type === filter);
  return <><PageHeader eyebrow="EVENT MANAGEMENT / OPERATOR CUES" title="Alert center" description="Actionable deviations and system notices from the current demonstration run." actions={<button className="button button-ghost" onClick={() => window.alert('All visible alerts acknowledged for this demo run.')}><Check size={14} /> ACKNOWLEDGE ALL</button>} /><div className="grid gap-3 md:grid-cols-4"><KpiCard label="Open alerts" value={`${alerts}`} detail="requires operator review" tone="orange" icon={Bell} /><KpiCard label="Critical" value="01" detail="sequence deviation" tone="red" icon={Siren} /><KpiCard label="Warnings" value="01" detail="confidence threshold" tone="orange" icon={AlertTriangle} /><KpiCard label="Resolved" value="07" detail="this mission run" tone="green" icon={CheckCircle2} /></div><div className="mt-5 panel p-5"><div className="mb-4 flex flex-wrap items-center gap-2"><SectionLabel>ALERT QUEUE</SectionLabel><div className="ml-auto flex gap-1">{['ALL', 'CRITICAL', 'WARNING', 'INFO'].map((x) => <button onClick={() => setFilter(x)} className={`filter-pill ${filter === x ? 'selected' : ''}`} key={x} data-testid={`filter-alert-${x.toLowerCase()}`}>{x}</button>)}</div></div><div className="space-y-2">{visible.map((item, index) => <div className={`alert-row alert-${item.tone}`} key={`${item.title}-${index}`}><div className="alert-icon">{item.type === 'CRITICAL' ? <Siren size={16} /> : item.type === 'WARNING' ? <AlertTriangle size={16} /> : <Info size={16} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-xs">{item.title}</b><StatusBadge tone={item.tone}>{item.type}</StatusBadge></div><p className="mt-1 text-[11px] text-slate-500">{item.copy}</p></div><div className="hidden text-right sm:block"><div className="font-mono-data text-[11px] text-slate-600">{item.time}</div><div className="mt-1 font-mono-data text-[10px] text-slate-400">{item.confidence}</div></div><button className="icon-button" onClick={() => window.alert(`${item.title} acknowledged.`)} aria-label={`Acknowledge ${item.title}`}><Check size={14} /></button></div>)}</div></div></>;
}

function Logs() {
  const { events } = useMission();
  const [search, setSearch] = useState('');
  const liveLogs = events.map((event) => [event.timestamp, 'CAMERA / SEQUENCE', `${event.action} · expected ${event.expected}`, `${event.confidence.toFixed(1)}%`, event.status]);
  const filtered = liveLogs.filter((row) => row.join(' ').toLowerCase().includes(search.toLowerCase()));
  const exportFile = (type: string) => { const content = type === 'CSV' ? `timestamp,source,event,confidence,state\n${liveLogs.map((row) => row.join(',')).join('\n')}` : JSON.stringify(liveLogs.map((row) => ({ timestamp: row[0], source: row[1], event: row[2], confidence: row[3], state: row[4] })), null, 2); const blob = new Blob([content], { type: type === 'CSV' ? 'text/csv' : 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `bas-mission-log.${type.toLowerCase()}`; a.click(); URL.revokeObjectURL(url); };
  return <><PageHeader eyebrow="EVIDENCE / TIMESTAMPED RECORD" title="Mission logs" description="Stable recognition events from the current browser session. No live events are fabricated before the camera runs." actions={<><button className="button button-ghost" onClick={() => exportFile('JSON')} data-testid="button-export-json"><FileJson size={14} /> JSON</button><button className="button button-primary" onClick={() => exportFile('CSV')} data-testid="button-export-csv"><Download size={14} /> EXPORT CSV</button></>} /><div className="panel overflow-hidden"><div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4"><div className="relative flex-1"><SlidersHorizontal className="absolute left-3 top-2.5 text-slate-400" size={14} /><input className="input pl-9" placeholder="Filter events, confidence, state..." value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-filter-logs" /></div><span className="font-mono-data text-[10px] text-slate-500">{liveLogs.length} LIVE EVENTS</span></div><div className="overflow-x-auto"><div className="table-head grid min-w-[700px] grid-cols-[.8fr_.8fr_1.8fr_.7fr_.8fr]"><span>TIMESTAMP</span><span>SOURCE</span><span>EVENT</span><span>CONFIDENCE</span><span>STATE</span></div>{filtered.length ? filtered.map((row, index) => <div className="log-row grid min-w-[700px] grid-cols-[.8fr_.8fr_1.8fr_.7fr_.8fr]" key={`${row[0]}-${index}`} data-testid={`log-row-${index}`}><span className="font-mono-data text-[11px] text-slate-500">{row[0]}</span><span className="text-[10px] font-bold text-cyan-700">{row[1]}</span><span className="text-xs font-semibold">{row[2]}</span><span className="font-mono-data text-[11px] text-slate-600">{row[3]}</span><StatusBadge tone={row[4] === 'ALIGNED' ? 'green' : row[4] === 'OUT OF SEQUENCE' || row[4] === 'LOW CONFIDENCE' ? 'red' : 'orange'}>{row[4]}</StatusBadge></div>) : <div className="p-12 text-center text-xs text-slate-500">No stable camera recognition events yet. Start the live camera to populate the mission log.</div>}</div></div></>;
}

function Analytics() {
  const pie = [{ name: 'Correct', value: 74, color: '#2f9e68' }, { name: 'In review', value: 16, color: '#e89b24' }, { name: 'Incorrect', value: 10, color: '#d6534d' }];
  return <><PageHeader eyebrow="MISSION EVIDENCE / RUN METRICS" title="Analytics" description="Readable signals for confidence, duration and action quality across the simulated mission run." actions={<StatusBadge tone="slate">RUN 0007</StatusBadge>} /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><KpiCard label="Mean confidence" value="92.4" unit="%" detail="↑ 4.2% from prior run" tone="cyan" icon={BarChart3} /><KpiCard label="Median step duration" value="31.4" unit="s" detail="across 4 accepted gates" tone="orange" icon={Timer} /><KpiCard label="Correct actions" value="74" unit="%" detail="protocol adherence score" tone="green" icon={CheckCircle2} /><KpiCard label="Alert frequency" value="0.8" unit="/min" detail="last 15 minute window" tone="red" icon={Bell} /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><div className="panel p-5"><SectionLabel>CONFIDENCE OVER TIME</SectionLabel><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={confidenceData}><CartesianGrid stroke="#e5e9ed" vertical={false} /><XAxis dataKey="time" tick={{ fontSize: 10 }} /><YAxis domain={[50, 100]} tick={{ fontSize: 10 }} /><ChartTooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} /><Line dataKey="confidence" name="Perception" stroke="#0891b2" strokeWidth={2} /><Line dataKey="activity" name="Activity model" stroke="#e89b24" strokeWidth={2} /></LineChart></ResponsiveContainer></div></div><div className="panel p-5"><SectionLabel>ACTION QUALITY</SectionLabel><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" innerRadius={60} outerRadius={88} paddingAngle={3}>{pie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><ChartTooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></div></div></div><div className="mt-5 panel p-5"><SectionLabel>STEP DURATION / EXPECTED VS OBSERVED</SectionLabel><div className="h-[230px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={activityData} barGap={6}><CartesianGrid stroke="#e5e9ed" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><ChartTooltip /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="expected" fill="#b8c5cd" name="Expected (s)" radius={[3, 3, 0, 0]} /><Bar dataKey="actual" fill="#0891b2" name="Observed (s)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div></>;
}

function Edge() {
  const pipelineStages: [string, string, IconType, string][] = [['01', 'CAMERA', Camera, '2ms'], ['02', 'PERCEPTION', ScanFace, '5ms'], ['03', 'TEMPORAL AI', BrainCircuit, '3ms'], ['04', 'GUIDANCE', Mic, '2ms']];
  return <><PageHeader eyebrow="COMPUTE / LOCAL-FIRST OPERATIONS" title="Edge intelligence" description="The mission remains useful when the network is absent: perception, temporal validation and guidance run locally." actions={<StatusBadge tone="green">EDGE-FIRST ACTIVE</StatusBadge>} /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><KpiCard label="CPU load" value="34" unit="%" detail="4 cores allocated" tone="cyan" icon={Cpu} /><KpiCard label="GPU memory" value="2.1" unit="GB" detail="of 4 GB available" tone="orange" icon={Gauge} /><KpiCard label="RAM usage" value="4.8" unit="GB" detail="of 16 GB available" tone="slate" icon={HardDrive} /><KpiCard label="Inference latency" value="12" unit="ms" detail="p50 camera → alert" tone="green" icon={Zap} /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><div className="panel p-5"><div className="mb-5 flex items-center justify-between"><SectionLabel>CAMERA → LOCAL DECISION PIPELINE</SectionLabel><span className="font-mono-data text-[10px] text-emerald-600">12ms TOTAL</span></div><div className="edge-pipeline">{pipelineStages.map(([no, label, Icon, time], index) => <div className="edge-stage" key={label}><div className="edge-stage-icon"><Icon size={18} /></div><span className="font-mono-data text-[10px] text-slate-400">{no}</span><b>{label}</b><small>{time}</small>{index < 3 && <ArrowRight className="edge-arrow" size={17} />}</div>)}</div><div className="mt-5 rounded bg-cyan-50 px-4 py-3 text-xs text-cyan-800"><CloudOff size={14} className="mr-2 inline" /> No cloud round-trip required for a decision or crew cue.</div></div><div className="panel p-5"><SectionLabel>RESOURCE TELEMETRY</SectionLabel><div className="space-y-4">{[['CPU / compute', '34%', '34', 'cyan'], ['GPU memory', '52%', '52', 'orange'], ['RAM allocation', '30%', '30', 'slate'], ['Stream FPS', '24 / 24', '100', 'green']].map(([name, value, width, tone]) => <div key={name}><div className="mb-1 flex justify-between text-xs"><span className="font-bold">{name}</span><span className="font-mono-data text-slate-500">{value}</span></div><div className="confidence-track"><div className={`confidence-fill fill-${tone}`} style={{ width: `${width}%` }} /></div></div>)}</div><div className="mt-5 flex items-center gap-2 rounded border border-slate-200 p-3"><Wifi size={15} className="text-slate-400" /><div><b className="text-xs">Optional network</b><div className="text-[10px] text-slate-500">Connected for telemetry only · decisions stay local</div></div><StatusBadge tone="slate">NOT REQUIRED</StatusBadge></div></div></div><div className="mt-5 grid gap-5 md:grid-cols-2"><div className="panel p-5"><SectionLabel>EDGE-FIRST</SectionLabel><div className="compare-list"><div><CheckCircle2 size={15} className="text-emerald-600" /><span>Low latency crew guidance</span></div><div><CheckCircle2 size={15} className="text-emerald-600" /><span>Works through comms blackout</span></div><div><CheckCircle2 size={15} className="text-emerald-600" /><span>Local data boundary</span></div></div></div><div className="panel p-5 opacity-80"><SectionLabel>CLOUD-DEPENDENT / NOT USED</SectionLabel><div className="compare-list"><div><X size={15} className="text-red-500" /><span>Network round-trip for every frame</span></div><div><X size={15} className="text-red-500" /><span>Remote inference dependency</span></div><div><X size={15} className="text-red-500" /><span>Unbounded telemetry exposure</span></div></div></div></div></>;
}

function Simulation() {
  const { running, setRunning, errorMode, setErrorMode, stepIndex, setStepIndex, alerts, addAlert } = useMission();
  const current = steps[stepIndex];
  const reset = () => { setRunning(false); setErrorMode(false); setStepIndex(0); };
  return <><PageHeader eyebrow="JUDGE MODE / CONTROLLED WALKTHROUGH" title="Simulation controller" description="Drive the full recognition → validation → guidance story with a repeatable, frontend-only experiment run." actions={<StatusBadge tone="orange">PRESENTER MODE</StatusBadge>} /><div className="simulation-hero panel"><div><div className="eyebrow text-orange-700">DEMO SCENARIO / BAS TRANSFER PROTOCOL</div><h2 className="mt-2 text-xl font-extrabold">A crew member transfers a sample into a containment tray.</h2><p className="mt-2 max-w-xl text-sm text-slate-500">Use normal mode for a clean path. Trigger error mode to demonstrate sequence intelligence, local guidance and recovery without a backend.</p></div><div className="flex shrink-0 gap-2"><button className="button button-primary" onClick={() => setRunning(!running)} data-testid="button-start-experiment">{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'PAUSE EXPERIMENT' : 'START EXPERIMENT'}</button><button className="button button-ghost" onClick={reset} data-testid="button-reset-simulation"><RefreshCw size={14} /> RESET</button></div></div><div className="mt-5 grid gap-5 xl:grid-cols-[.85fr_1.15fr]"><div className="space-y-5"><div className="panel p-5"><SectionLabel>RUN CONTROLS</SectionLabel><div className="toggle-row"><div><b className="text-sm">Protocol error mode</b><p>Inject an out-of-sequence tray secure event.</p></div><button className={`switch ${errorMode ? 'switch-on' : ''}`} onClick={() => { setErrorMode(!errorMode); if (!errorMode) addAlert(); }} aria-label="Toggle error mode" data-testid="button-toggle-error-mode"><span /></button></div><div className="toggle-row"><div><b className="text-sm">Automatic step progression</b><p>Advance one gate every seven seconds.</p></div><button className={`switch ${running ? 'switch-on' : ''}`} onClick={() => setRunning(!running)} aria-label="Toggle automatic progression"><span /></button></div><div className="mt-4 rounded bg-slate-50 p-4"><div className="flex justify-between text-xs"><span>RUN PROGRESS</span><b>{Math.round(((stepIndex + 1) / steps.length) * 100)}%</b></div><div className="mt-2 confidence-track h-3"><div className="confidence-fill fill-orange" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div></div></div><div className="panel p-5"><SectionLabel>SIMULATED RESOURCES</SectionLabel><div className="grid grid-cols-3 gap-2"><div className="metric-box"><Cpu size={15} className="text-cyan-600" /><b>34%</b><span>CPU</span></div><div className="metric-box"><Gauge size={15} className="text-orange-600" /><b>24</b><span>FPS</span></div><div className="metric-box"><Zap size={15} className="text-emerald-600" /><b>12ms</b><span>LATENCY</span></div></div></div></div><div className="space-y-5"><div className="panel p-5"><div className="flex items-start justify-between"><div><SectionLabel>CURRENT DEMONSTRATION STATE</SectionLabel><h2 className="text-lg font-extrabold">{errorMode ? 'Violation / recovery required' : current.name}</h2></div><StatusBadge tone={errorMode ? 'red' : running ? 'orange' : 'slate'}>{errorMode ? 'ERROR MODE' : running ? 'RUNNING' : 'PAUSED'}</StatusBadge></div><div className="mt-5 grid grid-cols-3 gap-3"><div className="metric-box"><span className="eyebrow">STEP</span><b>0{stepIndex + 1} / 06</b></div><div className="metric-box"><span className="eyebrow">ACTIVITY</span><b>{errorMode ? 'SECURE' : current.short}</b></div><div className="metric-box"><span className="eyebrow">CONFIDENCE</span><b className={errorMode ? 'text-red-600' : 'text-cyan-700'}>{errorMode ? '64.2%' : `${current.confidence || 0}%`}</b></div></div><div className="mt-5"><SectionLabel>PROTOCOL TIMELINE</SectionLabel><div className="simulation-timeline">{steps.map((step, index) => <button key={step.id} onClick={() => setStepIndex(index)} className={`sim-dot ${index <= stepIndex ? 'sim-done' : ''} ${index === stepIndex ? 'sim-current' : ''}`} data-testid={`button-sim-step-${step.id}`}><span>{index < stepIndex ? <Check size={11} /> : index + 1}</span><small>{step.short}</small></button>)}</div></div></div><div className={`recovery-card ${errorMode ? 'visible' : ''}`}>{errorMode ? <><AlertTriangle size={17} className="text-red-600" /><div className="flex-1"><b className="text-sm">Recovery cue issued</b><p className="text-[11px] text-slate-500">“Return sample to tray, then secure latch.” Sequence gate is holding.</p></div><button className="button button-primary" onClick={() => setErrorMode(false)} data-testid="button-continue-recovery"><Check size={14} /> CONTINUE</button></> : <><CheckCircle2 size={17} className="text-emerald-600" /><div><b className="text-sm">No recovery actions pending</b><p className="text-[11px] text-slate-500">The operator console is ready for the next gate.</p></div></>}</div></div></div></>;
}

function Architecture() {
  const layers: [string, string, IconType][] = [['CAMERA', 'Webcam frames · local timestamp', Camera], ['POSE + HAND LANDMARKS', 'Pose Landmarker + Hand Landmarker', ScanFace], ['ACTION RECOGNITION', 'Body movement + hand geometry', Activity], ['TEMPORAL SMOOTHING', 'Rolling action history · stable label', Timer], ['WORKFLOW DATABASE', 'JAXA source metadata + prototype catalog', FileJson], ['SEQUENCE VALIDATOR', 'Expected state vs detected action', BrainCircuit], ['CONFIDENCE / SAFETY', 'Low confidence holds the workflow', ShieldCheck], ['VOICE + VISUAL GUIDANCE', 'User-controlled local speech and cues', Headphones], ['MISSION LOG', 'Timestamped stable recognition events', FileText], ['OPERATOR / GROUND INTERFACE', 'Review, verify, request guidance', Monitor]];
  return <><PageHeader eyebrow="TECHNICAL BLUEPRINT / SIH26174" title="System architecture" description="The implemented camera-to-guidance pipeline. Raw camera processing is local in this prototype; it is not flight-qualified." actions={<StatusBadge tone="cyan">EDGE PROCESSING</StatusBadge>} /><div className="panel p-6"><div className="architecture-stack">{layers.map(([label, copy, Icon], index) => <div key={label as string} className="architecture-row"><div className={`architecture-layer layer-${index % 6}`}><div className="architecture-icon"><Icon size={18} /></div><div><div className="eyebrow text-slate-500">{label}</div><b>{copy}</b></div><span className="architecture-badge">{index < 8 ? 'LOCAL' : 'OPERATOR'}</span></div>{index < layers.length - 1 && <div className="architecture-arrow"><ArrowDown size={17} /><span>structured signal</span></div>}</div>)}</div></div><div className="mt-5 grid gap-5 md:grid-cols-3"><div className="panel p-5"><Network className="text-cyan-700" size={20} /><h3 className="mt-4 text-sm font-extrabold">One evidence chain</h3><p className="mt-1 text-xs leading-5 text-slate-500">Every stable decision can be traced from camera landmarks to a logged protocol outcome.</p></div><div className="panel p-5"><RouterIcon className="text-orange-600" size={20} /><h3 className="mt-4 text-sm font-extrabold">Edge-first by design</h3><p className="mt-1 text-xs leading-5 text-slate-500">Latency-sensitive guidance remains local and available without a cloud round trip.</p></div><div className="panel p-5"><Sparkles className="text-emerald-600" size={20} /><h3 className="mt-4 text-sm font-extrabold">Source transparency</h3><p className="mt-1 text-xs leading-5 text-slate-500">JAXA lifecycle data and the physical-action prototype are explicitly separated.</p></div></div></>;
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/overview"><Shell><Overview /></Shell></Route><Route path="/live"><Shell><Live /></Shell></Route><Route path="/workflow"><Shell><Workflow /></Shell></Route><Route path="/perception"><Shell><Perception /></Shell></Route><Route path="/activity"><Shell><ActivityPage /></Shell></Route><Route path="/sequence"><Shell><Sequence /></Shell></Route><Route path="/alerts"><Shell><Alerts /></Shell></Route><Route path="/logs"><Shell><Logs /></Shell></Route><Route path="/analytics"><Shell><Analytics /></Shell></Route><Route path="/edge"><Shell><Edge /></Shell></Route><Route path="/simulation"><Shell><Simulation /></Shell></Route><Route path="/architecture"><Shell><Architecture /></Shell></Route><Route><Shell><Overview /></Shell></Route></Switch>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><MissionProvider><Router /></MissionProvider></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
