"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Ambulance,
  BellRing,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  HeartPulse,
  History,
  Hospital,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Navigation,
  Pause,
  Phone,
  PhoneCall,
  Play,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  ThermometerSun,
  Trash2,
  UserRound,
  UserRoundCog,
  Waves,
  Wind,
} from "lucide-react";
import styles from "./page.module.css";

type ScenarioId = "balanced" | "environment" | "cardio" | "fatigue";
type CauseId = "stable" | "environment" | "cardio" | "fatigue";
type MetricKey = keyof SensorSnapshot;
type AppSection =
  | "dashboard"
  | "readings"
  | "ai"
  | "emergency"
  | "hospitals"
  | "history"
  | "profile"
  | "settings";
type RiskLevel = "stable" | "caution" | "warning" | "severe";

type SensorSnapshot = {
  breathRate: number;
  tidalVolume: number;
  peakFlow: number;
  heartRate: number;
  spo2: number;
  postureAngle: number;
  motionLoad: number;
  stressIndex: number;
};

type ScenarioConfig = {
  id: ScenarioId;
  label: string;
  shortLabel: string;
  base: SensorSnapshot;
};

type FusionResult = {
  cause: CauseId;
  title: string;
  confidence: number;
  action: string;
  scores: Record<Exclude<CauseId, "stable">, number>;
};

type UserProfile = {
  name: string;
  email: string;
  phone: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
};

type LoginForm = UserProfile & {
  accessCode: string;
};

type AlertState = {
  status: "idle" | "ready" | "sending" | "sent" | "demo" | "error";
  message: string;
  channels: string[];
  timestamp?: string;
};

type UserLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type LocationState = {
  status: "idle" | "locating" | "ready" | "denied" | "error";
  message: string;
  coords?: UserLocation;
};

type EmergencyState = {
  status: "idle" | "sending" | "sent" | "demo" | "calling" | "error";
  message: string;
  reportId?: string;
  timestamp?: string;
  selectedHospitalId: string;
};

type HospitalPartner = {
  id: string;
  name: string;
  type: string;
  phone: string;
  reportEmail: string;
  address: string;
  lat: number;
  lng: number;
  response: string;
  specialties: string[];
};

type HospitalWithDistance = HospitalPartner & {
  distanceKm?: number;
};

type AiGuidance = {
  level: RiskLevel;
  title: string;
  summary: string;
  possibleCause: string;
  immediateSteps: string[];
  hospitalTrigger: string;
};

const scenarios: ScenarioConfig[] = [
  {
    id: "balanced",
    label: "Stable baseline",
    shortLabel: "Stable",
    base: {
      breathRate: 15,
      tidalVolume: 520,
      peakFlow: 360,
      heartRate: 76,
      spo2: 98,
      postureAngle: 7,
      motionLoad: 24,
      stressIndex: 22,
    },
  },
  {
    id: "environment",
    label: "Breathing strain",
    shortLabel: "Airflow",
    base: {
      breathRate: 24,
      tidalVolume: 440,
      peakFlow: 505,
      heartRate: 92,
      spo2: 97,
      postureAngle: 9,
      motionLoad: 32,
      stressIndex: 64,
    },
  },
  {
    id: "cardio",
    label: "Cardio warning",
    shortLabel: "Cardio",
    base: {
      breathRate: 21,
      tidalVolume: 455,
      peakFlow: 390,
      heartRate: 122,
      spo2: 92,
      postureAngle: 8,
      motionLoad: 36,
      stressIndex: 78,
    },
  },
  {
    id: "fatigue",
    label: "Physical fatigue",
    shortLabel: "Fatigue",
    base: {
      breathRate: 19,
      tidalVolume: 500,
      peakFlow: 370,
      heartRate: 101,
      spo2: 96,
      postureAngle: 27,
      motionLoad: 82,
      stressIndex: 70,
    },
  },
];

const metricRanges: Record<MetricKey, { min: number; max: number; unit: string }> = {
  breathRate: { min: 8, max: 32, unit: "rpm" },
  tidalVolume: { min: 260, max: 760, unit: "ml" },
  peakFlow: { min: 220, max: 620, unit: "L/min" },
  heartRate: { min: 48, max: 145, unit: "bpm" },
  spo2: { min: 86, max: 100, unit: "%" },
  postureAngle: { min: 0, max: 38, unit: "deg" },
  motionLoad: { min: 0, max: 100, unit: "%" },
  stressIndex: { min: 0, max: 100, unit: "%" },
};

const sensorCards: Array<{
  key: MetricKey;
  label: string;
  group: string;
  icon: typeof Wind;
}> = [
  { key: "breathRate", label: "Respiration", group: "Micro Venturi", icon: Wind },
  { key: "tidalVolume", label: "Tidal volume", group: "Pressure sensor", icon: Waves },
  { key: "heartRate", label: "Heart rate", group: "MAX30102", icon: HeartPulse },
  { key: "spo2", label: "SpO2", group: "Pulse oximeter", icon: ShieldCheck },
  { key: "postureAngle", label: "Posture tilt", group: "MPU6050 IMU", icon: UserRoundCog },
  { key: "motionLoad", label: "Motion load", group: "IMU fusion", icon: Activity },
];

const navItems: Array<{ id: AppSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "readings", label: "Readings", icon: Gauge },
  { id: "ai", label: "AI Suggestions", icon: BrainCircuit },
  { id: "emergency", label: "Emergency", icon: Siren },
  { id: "hospitals", label: "Hospitals", icon: Hospital },
  { id: "history", label: "History", icon: History },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "settings", label: "Settings", icon: Settings },
];

const configuredHospitalPhone =
  process.env.NEXT_PUBLIC_AFFILIATED_HOSPITAL_PHONE ?? "+910000000000";
const configuredHospitalEmail =
  process.env.NEXT_PUBLIC_AFFILIATED_HOSPITAL_EMAIL ?? "triage@breatheflow.demo";

const hospitalPartners: HospitalPartner[] = [
  {
    id: "triage-desk",
    name: "BreatheFlow Affiliated Triage Desk",
    type: "24x7 emergency coordination",
    phone: configuredHospitalPhone,
    reportEmail: configuredHospitalEmail,
    address: "Hyderabad emergency partner network",
    lat: 17.4483,
    lng: 78.3915,
    response: "6-9 min",
    specialties: ["Emergency triage", "Respiratory review", "Vitals handoff"],
  },
  {
    id: "cardio-wing",
    name: "PulseBridge Cardio Emergency Wing",
    type: "Cardio and oxygen support",
    phone: "+910000000001",
    reportEmail: "cardio@breatheflow.demo",
    address: "Central clinical response zone",
    lat: 17.4239,
    lng: 78.4738,
    response: "8-12 min",
    specialties: ["Heart-rate escalation", "SpO2 review", "Rapid admission"],
  },
  {
    id: "rapid-care",
    name: "MetroCare Rapid Response Unit",
    type: "General emergency care",
    phone: "+910000000002",
    reportEmail: "rapidcare@breatheflow.demo",
    address: "Northwest urgent-care corridor",
    lat: 17.385,
    lng: 78.4867,
    response: "10-14 min",
    specialties: ["Fatigue events", "Fall/posture strain", "On-call doctor"],
  },
];

const emptyLoginForm: LoginForm = {
  name: "",
  email: "",
  phone: "",
  emailAlerts: true,
  smsAlerts: false,
  accessCode: "",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const wave = (step: number, offset: number, size: number) =>
  Math.sin((step + offset) / size) + Math.cos((step + offset * 2) / (size + 2));

function makeSnapshot(scenario: ScenarioId, step: number): SensorSnapshot {
  const config = scenarios.find((item) => item.id === scenario) ?? scenarios[0];
  const base = config.base;

  return {
    breathRate: Math.round(
      clamp(base.breathRate + wave(step, 1, 2.8) * 1.7, 8, 32),
    ),
    tidalVolume: Math.round(
      clamp(base.tidalVolume + wave(step, 3, 3.2) * 34, 260, 760),
    ),
    peakFlow: Math.round(
      clamp(base.peakFlow + wave(step, 5, 2.4) * 28, 220, 620),
    ),
    heartRate: Math.round(
      clamp(base.heartRate + wave(step, 7, 3.8) * 5, 48, 145),
    ),
    spo2: Number(clamp(base.spo2 + wave(step, 4, 4.5) * 0.7, 86, 100).toFixed(1)),
    postureAngle: Math.round(
      clamp(base.postureAngle + wave(step, 8, 5) * 2.5, 0, 38),
    ),
    motionLoad: Math.round(
      clamp(base.motionLoad + wave(step, 6, 2.6) * 8, 0, 100),
    ),
    stressIndex: Math.round(
      clamp(base.stressIndex + wave(step, 2, 3.5) * 7, 0, 100),
    ),
  };
}

function classifyStress(snapshot: SensorSnapshot): FusionResult {
  const environment = clamp(
    18 +
      Math.max(0, snapshot.breathRate - 17) * 5.8 +
      Math.max(0, snapshot.peakFlow - 390) * 0.17 +
      Math.max(0, 500 - snapshot.tidalVolume) * 0.08 +
      snapshot.stressIndex * 0.25,
    0,
    100,
  );
  const cardio = clamp(
    14 +
      Math.max(0, snapshot.heartRate - 92) * 2.1 +
      Math.max(0, 96 - snapshot.spo2) * 10 +
      snapshot.stressIndex * 0.22,
    0,
    100,
  );
  const fatigue = clamp(
    12 +
      snapshot.postureAngle * 2.2 +
      snapshot.motionLoad * 0.62 +
      Math.max(0, snapshot.heartRate - 86) * 0.45,
    0,
    100,
  );

  const scores = {
    environment: Math.round(environment),
    cardio: Math.round(cardio),
    fatigue: Math.round(fatigue),
  };
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] as [
    Exclude<CauseId, "stable">,
    number,
  ];

  if (winner[1] < 48) {
    return {
      cause: "stable",
      title: "Stable condition",
      confidence: 91,
      action: "Continue monitoring",
      scores,
    };
  }

  const copy: Record<Exclude<CauseId, "stable">, { title: string; action: string }> = {
    environment: {
      title: "Environmental stress",
      action: "Check airflow, heat, dust, or breathing load",
    },
    cardio: {
      title: "Cardiovascular warning",
      action: "Rest and verify heart rate plus oxygen level",
    },
    fatigue: {
      title: "Physical fatigue",
      action: "Correct posture and reduce muscular strain",
    },
  };

  return {
    cause: winner[0],
    title: copy[winner[0]].title,
    confidence: Math.round(clamp(winner[1] + 10, 62, 96)),
    action: copy[winner[0]].action,
    scores,
  };
}

function metricPercent(key: MetricKey, value: number) {
  const range = metricRanges[key];
  return clamp(((value - range.min) / (range.max - range.min)) * 100, 0, 100);
}

function chartPath(
  history: SensorSnapshot[],
  key: MetricKey,
  height = 58,
  width = 300,
) {
  if (history.length === 0) return "";
  return history
    .map((point, index) => {
      const x = (index / Math.max(history.length - 1, 1)) * width;
      const y = height - (metricPercent(key, point[key]) / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "B") + (parts[1]?.[0] ?? "F");
}

function getRiskLevel(result: FusionResult, snapshot: SensorSnapshot): RiskLevel {
  if (
    result.cause === "cardio" &&
    (result.confidence >= 86 || snapshot.spo2 <= 92 || snapshot.heartRate >= 120)
  ) {
    return "severe";
  }
  if (result.confidence >= 88 || snapshot.stressIndex >= 82) return "severe";
  if (result.cause !== "stable" && result.confidence >= 76) return "warning";
  if (result.cause !== "stable") return "caution";
  return "stable";
}

function getAiGuidance(result: FusionResult, snapshot: SensorSnapshot): AiGuidance {
  const level = getRiskLevel(result, snapshot);

  if (result.cause === "environment") {
    return {
      level,
      title: level === "severe" ? "Breathing strain needs urgent review" : "Breathing load detected",
      summary:
        "The respiratory signal is contributing more strongly than heart or posture readings.",
      possibleCause:
        "Possible cause: heat, dust exposure, poor airflow, or increased breathing load.",
      immediateSteps: [
        "Move to a cleaner and cooler place.",
        "Sit upright and reduce physical activity for a few minutes.",
        "Recheck breath rate and peak flow after resting.",
      ],
      hospitalTrigger:
        "Escalate if breath rate stays high, breathing feels difficult, or SpO2 drops.",
    };
  }

  if (result.cause === "cardio") {
    return {
      level,
      title: level === "severe" ? "Cardio warning is high priority" : "Heart and oxygen pattern needs attention",
      summary:
        "Heart rate and oxygen readings are currently the strongest risk signals.",
      possibleCause:
        "Possible cause: cardiovascular stress, low oxygen trend, panic response, or overexertion.",
      immediateSteps: [
        "Stop activity and sit in a stable position.",
        "Ask a nearby person to stay with the user.",
        "Use Emergency Assist if symptoms continue or readings worsen.",
      ],
      hospitalTrigger:
        "Escalate immediately for chest pain, faintness, SpO2 near 92%, or very high heart rate.",
    };
  }

  if (result.cause === "fatigue") {
    return {
      level,
      title: "Physical fatigue and posture strain detected",
      summary:
        "Posture angle and motion load suggest body strain rather than a purely breathing or cardio event.",
      possibleCause:
        "Possible cause: prolonged activity, poor posture, muscle fatigue, or instability.",
      immediateSteps: [
        "Pause movement and correct posture.",
        "Hydrate and rest before resuming activity.",
        "Watch for dizziness, imbalance, or repeated posture warnings.",
      ],
      hospitalTrigger:
        "Escalate if posture instability is combined with high heart rate or breathing strain.",
    };
  }

  return {
    level: "stable",
    title: "Readings are stable",
    summary:
      "The fused sensor pattern is within the safe demonstration range right now.",
    possibleCause:
      "No abnormal stress cause is currently dominant in the sensor fusion result.",
    immediateSteps: [
      "Keep the wearable fitted correctly.",
      "Review history if symptoms do not match the dashboard.",
      "Continue routine monitoring during the demo.",
    ],
    hospitalTrigger:
      "Emergency Assist remains available if the user feels unwell despite stable readings.",
  };
}

function distanceKm(from: UserLocation, hospital: HospitalPartner) {
  const earthRadiusKm = 6371;
  const dLat = ((hospital.lat - from.lat) * Math.PI) / 180;
  const dLng = ((hospital.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (hospital.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function reportText(
  profile: UserProfile,
  result: FusionResult,
  snapshot: SensorSnapshot,
  hospital: HospitalWithDistance,
  location?: UserLocation,
) {
  return [
    `Patient: ${profile.name}`,
    `Status: ${result.title}`,
    `Confidence: ${result.confidence}%`,
    `Action: ${result.action}`,
    `Heart rate: ${snapshot.heartRate} bpm`,
    `SpO2: ${snapshot.spo2}%`,
    `Breath rate: ${snapshot.breathRate} rpm`,
    `Stress index: ${snapshot.stressIndex}%`,
    `Hospital: ${hospital.name}`,
    location
      ? `Location: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
      : "Location: not shared",
  ].join("\n");
}

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function SensorCard({
  card,
  snapshot,
}: {
  card: (typeof sensorCards)[number];
  snapshot: SensorSnapshot;
}) {
  const Icon = card.icon;
  const value = snapshot[card.key];
  const range = metricRanges[card.key];
  const percent = metricPercent(card.key, value);

  return (
    <article className={styles.sensorCard}>
      <div className={styles.sensorTopline}>
        <span className={styles.sensorIcon}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <span>{card.group}</span>
      </div>
      <div className={styles.sensorValueRow}>
        <div>
          <p>{card.label}</p>
          <strong>
            {value}
            <span>{range.unit}</span>
          </strong>
        </div>
        <Gauge size={20} aria-hidden="true" />
      </div>
      <div className={styles.meter} aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </article>
  );
}

function FusionScore({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={styles.scoreRow}>
      <span>{label}</span>
      <div className={styles.scoreTrack} aria-hidden="true">
        <span className={styles[tone]} style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}

function DeviceDiagram() {
  return (
    <svg
      className={styles.deviceDiagram}
      viewBox="0 0 420 250"
      role="img"
      aria-label="BreatheFlow wearable sensor architecture"
    >
      <defs>
        <linearGradient id="flowLine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#17a78b" />
          <stop offset="1" stopColor="#356fe8" />
        </linearGradient>
      </defs>
      <rect x="58" y="35" width="304" height="180" rx="24" fill="#f8fafc" />
      <path
        d="M78 124 C126 84, 174 84, 220 124 S312 164, 356 124"
        fill="none"
        stroke="url(#flowLine)"
        strokeLinecap="round"
        strokeWidth="12"
      />
      <path
        d="M93 124 L142 101 L142 147 Z M327 124 L278 101 L278 147 Z"
        fill="#dff7f1"
        stroke="#17a78b"
        strokeWidth="4"
      />
      <rect x="172" y="82" width="76" height="84" rx="10" fill="#101a27" />
      <rect x="185" y="96" width="50" height="12" rx="4" fill="#55d4c4" />
      <rect x="185" y="118" width="50" height="12" rx="4" fill="#f6b94e" />
      <rect x="185" y="140" width="50" height="12" rx="4" fill="#ef5d5d" />
      <circle cx="93" cy="58" r="24" fill="#fff" stroke="#17a78b" strokeWidth="5" />
      <circle cx="327" cy="58" r="24" fill="#fff" stroke="#356fe8" strokeWidth="5" />
      <circle cx="93" cy="192" r="24" fill="#fff" stroke="#ef5d5d" strokeWidth="5" />
      <circle cx="327" cy="192" r="24" fill="#fff" stroke="#f6b94e" strokeWidth="5" />
      <text x="210" y="62" textAnchor="middle" className={styles.svgLabel}>
        ESP32-S3
      </text>
      <text x="93" y="64" textAnchor="middle" className={styles.svgLabel}>
        Venturi
      </text>
      <text x="327" y="64" textAnchor="middle" className={styles.svgLabel}>
        SpO2
      </text>
      <text x="93" y="198" textAnchor="middle" className={styles.svgLabel}>
        HR
      </text>
      <text x="327" y="198" textAnchor="middle" className={styles.svgLabel}>
        IMU
      </text>
    </svg>
  );
}

function LoginScreen({
  form,
  onChange,
  onSubmit,
}: {
  form: LoginForm;
  onChange: (form: LoginForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className={`${styles.page} ${styles.loginPage}`}>
      <section className={styles.loginShell}>
        <div className={styles.loginIntro}>
          <p className={styles.kicker}>Personal health access</p>
          <h1>BreatheFlow</h1>
          <p>
            Sensor fusion dashboard for private readings, AI guidance, alerts, and
            emergency hospital handoff.
          </p>
          <DeviceDiagram />
        </div>

        <form className={styles.loginCard} onSubmit={onSubmit}>
          <div>
            <p className={styles.eyebrow}>Login required</p>
            <h2>Patient profile</h2>
          </div>

          <label className={styles.fieldLabel}>
            Full name
            <input
              required
              type="text"
              value={form.name}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              placeholder="Enter your name"
            />
          </label>

          <label className={styles.fieldLabel}>
            Email address
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => onChange({ ...form, email: event.target.value })}
              placeholder="name@example.com"
            />
          </label>

          <label className={styles.fieldLabel}>
            Phone number
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => onChange({ ...form, phone: event.target.value })}
              placeholder="+91 9876543210"
            />
          </label>

          <label className={styles.fieldLabel}>
            Access code
            <input
              required
              minLength={4}
              type="password"
              value={form.accessCode}
              onChange={(event) =>
                onChange({ ...form, accessCode: event.target.value })
              }
              placeholder="Any 4+ digit demo code"
            />
          </label>

          <div className={styles.toggleGrid} aria-label="Alert channels">
            <label>
              <input
                type="checkbox"
                checked={form.emailAlerts}
                onChange={(event) =>
                  onChange({ ...form, emailAlerts: event.target.checked })
                }
              />
              <Mail size={16} aria-hidden="true" />
              Email alerts
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.smsAlerts}
                onChange={(event) =>
                  onChange({ ...form, smsAlerts: event.target.checked })
                }
              />
              <Phone size={16} aria-hidden="true" />
              SMS alerts
            </label>
          </div>

          <button className={styles.loginButton} type="submit">
            <LogIn size={18} aria-hidden="true" />
            View dashboard
          </button>

          <p className={styles.loginNote}>
            Demo access is local to this browser. Production login can be connected to
            Supabase or Firebase later.
          </p>
        </form>
      </section>
    </main>
  );
}

function AlertPanel({
  alertState,
  onSendTest,
}: {
  alertState: AlertState;
  onSendTest: () => void;
}) {
  const Icon =
    alertState.status === "sent" || alertState.status === "demo"
      ? CheckCircle2
      : alertState.status === "error"
        ? AlertTriangle
        : BellRing;

  return (
    <div className={`${styles.alertPanel} ${styles[alertState.status]}`}>
      <div className={styles.alertIcon}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <strong>{alertState.message}</strong>
        {alertState.channels.length > 0 ? (
          <span>Channels: {alertState.channels.join(", ")}</span>
        ) : null}
        {alertState.timestamp ? <span>{alertState.timestamp}</span> : null}
      </div>
      <button type="button" onClick={onSendTest} title="Send a test health alert">
        <Send size={16} aria-hidden="true" />
        <span>Test alert</span>
      </button>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className={styles.sectionAction}>{action}</div> : null}
    </div>
  );
}

export default function Home() {
  const [scenario, setScenario] = useState<ScenarioId>("balanced");
  const [live, setLive] = useState(true);
  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const stepRef = useRef(0);
  const alertKeyRef = useRef("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loginForm, setLoginForm] = useState<LoginForm>(emptyLoginForm);
  const [alertState, setAlertState] = useState<AlertState>({
    status: "idle",
    message: "Alerts are waiting for a health risk signal.",
    channels: [],
  });
  const [locationState, setLocationState] = useState<LocationState>({
    status: "idle",
    message: "Location has not been shared yet.",
  });
  const [emergencyState, setEmergencyState] = useState<EmergencyState>({
    status: "idle",
    message: "Emergency handoff is ready when needed.",
    selectedHospitalId: hospitalPartners[0].id,
  });
  const [snapshot, setSnapshot] = useState<SensorSnapshot>(() =>
    makeSnapshot("balanced", 0),
  );
  const [historySnapshots, setHistorySnapshots] = useState<SensorSnapshot[]>(() =>
    Array.from({ length: 24 }, (_, index) => makeSnapshot("balanced", index)),
  );

  const result = useMemo(() => classifyStress(snapshot), [snapshot]);
  const selectedScenario =
    scenarios.find((item) => item.id === scenario) ?? scenarios[0];
  const guidance = useMemo(() => getAiGuidance(result, snapshot), [result, snapshot]);
  const isSevere = guidance.level === "severe";

  const hospitalsWithDistance = useMemo<HospitalWithDistance[]>(() => {
    if (!locationState.coords) return hospitalPartners;
    return hospitalPartners
      .map((hospital) => ({
        ...hospital,
        distanceKm: distanceKm(locationState.coords as UserLocation, hospital),
      }))
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }, [locationState.coords]);

  const selectedHospital =
    hospitalsWithDistance.find((item) => item.id === emergencyState.selectedHospitalId) ??
    hospitalsWithDistance[0];

  const activityLog = useMemo(
    () => {
      const visibleItems = historySnapshots.slice(-7);
      const offset = historySnapshots.length - visibleItems.length;

      return visibleItems.map((item, index) => {
        const itemResult = classifyStress(item);
        const minutesAgo = (visibleItems.length - 1 - index) * 2;
        return {
          id: `${itemResult.cause}-${offset + index}-${item.heartRate}`,
          sourceIndex: offset + index,
          time: minutesAgo === 0 ? "Now" : `${minutesAgo} min ago`,
          result: itemResult,
          snapshot: item,
        };
      });
    },
    [historySnapshots],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedProfile = window.localStorage.getItem("breatheflow-profile");
      if (savedProfile) {
        try {
          const parsedProfile = JSON.parse(savedProfile) as UserProfile;
          setProfile(parsedProfile);
          setLoginForm({ ...parsedProfile, accessCode: "" });
          setAlertState({
            status: "ready",
            message: `Alert monitoring is active for ${parsedProfile.name}.`,
            channels: [
              parsedProfile.emailAlerts ? "email" : "",
              parsedProfile.smsAlerts ? "sms" : "",
            ].filter(Boolean),
          });
        } catch {
          window.localStorage.removeItem("breatheflow-profile");
        }
      }
      setProfileLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!live) return;

    const interval = window.setInterval(() => {
      stepRef.current += 1;
      const nextSnapshot = makeSnapshot(scenario, stepRef.current);
      setSnapshot(nextSnapshot);
      setHistorySnapshots((items) => [...items.slice(-23), nextSnapshot]);
    }, 1200);

    return () => window.clearInterval(interval);
  }, [live, scenario]);

  const sendHealthAlert = useCallback(async (manual = false) => {
    if (!profile) return;

    setAlertState({
      status: "sending",
      message: manual ? "Sending test alert..." : "Sending health risk alert...",
      channels: [
        profile.emailAlerts ? "email" : "",
        profile.smsAlerts ? "sms" : "",
      ].filter(Boolean),
    });

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          result,
          snapshot,
          manual,
          generatedAt: new Date().toISOString(),
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        mode: "sent" | "demo" | "error";
        message: string;
        channels?: string[];
      };

      setAlertState({
        status: payload.ok ? payload.mode : "error",
        message: payload.message,
        channels: payload.channels ?? [],
        timestamp: new Date().toLocaleString(),
      });
    } catch {
      setAlertState({
        status: "error",
        message: "Alert service could not be reached.",
        channels: [],
        timestamp: new Date().toLocaleString(),
      });
    }
  }, [profile, result, snapshot]);

  useEffect(() => {
    if (!profile || result.cause === "stable" || result.confidence < 70) return;

    const alertKey = `${result.cause}-${Math.floor(Date.now() / 60000)}`;
    if (alertKeyRef.current === alertKey) return;
    alertKeyRef.current = alertKey;

    void sendHealthAlert(false);
  }, [profile, result.cause, result.confidence, sendHealthAlert]);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationState({
        status: "error",
        message: "Location is not available on this device.",
      });
      return;
    }

    setLocationState({
      status: "locating",
      message: "Requesting location permission...",
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState({
          status: "ready",
          message: "Location linked to emergency handoff.",
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        });
      },
      (error) => {
        setLocationState({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "error",
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location permission was denied."
              : "Location could not be detected.",
        });
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    );
  }, []);

  const selectScenario = (nextScenario: ScenarioId) => {
    stepRef.current = 0;
    const first = makeSnapshot(nextScenario, 0);
    setScenario(nextScenario);
    setSnapshot(first);
    setHistorySnapshots(
      Array.from({ length: 24 }, (_, index) => makeSnapshot(nextScenario, index)),
    );
  };

  const updateMetric = (key: MetricKey, value: number) => {
    setLive(false);
    setSnapshot((current) => {
      const next = { ...current, [key]: value };
      setHistorySnapshots((items) => [...items.slice(-23), next]);
      return next;
    });
  };

  const resetScenario = () => {
    const first = makeSnapshot(scenario, 0);
    stepRef.current = 0;
    setSnapshot(first);
    setHistorySnapshots(
      Array.from({ length: 24 }, (_, index) => makeSnapshot(scenario, index)),
    );
  };

  const deleteHistoryPoint = (sourceIndex: number) => {
    setHistorySnapshots((items) => {
      const nextItems = items.filter((_, index) => index !== sourceIndex);
      return nextItems.length > 0 ? nextItems : [snapshot];
    });
  };

  const clearHistory = () => {
    setHistorySnapshots([snapshot]);
  };

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextProfile: UserProfile = {
      name: loginForm.name.trim(),
      email: loginForm.email.trim(),
      phone: loginForm.phone.trim(),
      emailAlerts: loginForm.emailAlerts,
      smsAlerts: loginForm.smsAlerts,
    };

    if (nextProfile.smsAlerts && !nextProfile.phone) {
      setAlertState({
        status: "error",
        message: "Add a phone number to enable SMS alerts.",
        channels: [],
      });
      return;
    }

    window.localStorage.setItem("breatheflow-profile", JSON.stringify(nextProfile));
    setProfile(nextProfile);
    setAlertState({
      status: "ready",
      message: `Alert monitoring is active for ${nextProfile.name}.`,
      channels: [
        nextProfile.emailAlerts ? "email" : "",
        nextProfile.smsAlerts ? "sms" : "",
      ].filter(Boolean),
    });
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextProfile: UserProfile = {
      name: loginForm.name.trim(),
      email: loginForm.email.trim(),
      phone: loginForm.phone.trim(),
      emailAlerts: loginForm.emailAlerts,
      smsAlerts: loginForm.smsAlerts,
    };
    window.localStorage.setItem("breatheflow-profile", JSON.stringify(nextProfile));
    setProfile(nextProfile);
    setAlertState({
      status: "ready",
      message: `Alert monitoring is active for ${nextProfile.name}.`,
      channels: [
        nextProfile.emailAlerts ? "email" : "",
        nextProfile.smsAlerts ? "sms" : "",
      ].filter(Boolean),
      timestamp: new Date().toLocaleString(),
    });
  };

  const signOut = () => {
    window.localStorage.removeItem("breatheflow-profile");
    setProfile(null);
    setLoginForm(emptyLoginForm);
    setAlertState({
      status: "idle",
      message: "Alerts are waiting for a health risk signal.",
      channels: [],
    });
    setActiveSection("dashboard");
  };

  const sendEmergencyReportAndCall = async () => {
    if (!profile || !selectedHospital) return;

    const reportId = `BF-${Date.now().toString(36).toUpperCase()}`;
    setEmergencyState((current) => ({
      ...current,
      status: "sending",
      reportId,
      message: "Sending health report to affiliated hospital...",
    }));

    try {
      const response = await fetch("/api/emergency-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          profile,
          result,
          snapshot,
          hospital: selectedHospital,
          location: locationState.coords,
          generatedAt: new Date().toISOString(),
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        mode: "sent" | "demo" | "error";
        message: string;
      };

      if (!payload.ok) {
        setEmergencyState((current) => ({
          ...current,
          status: "error",
          reportId,
          message: payload.message,
          timestamp: new Date().toLocaleString(),
        }));
        return;
      }

      setEmergencyState((current) => ({
        ...current,
        status: payload.mode === "sent" ? "sent" : "demo",
        reportId,
        message: `${payload.message} Opening hospital call option...`,
        timestamp: new Date().toLocaleString(),
      }));

      window.setTimeout(() => {
        setEmergencyState((current) => ({
          ...current,
          status: "calling",
          message: `Calling ${selectedHospital.name}.`,
        }));
        window.location.href = phoneHref(selectedHospital.phone);
      }, 650);
    } catch {
      setEmergencyState((current) => ({
        ...current,
        status: "error",
        reportId,
        message: "Emergency report service could not be reached.",
        timestamp: new Date().toLocaleString(),
      }));
    }
  };

  if (!profileLoaded) {
    return (
      <main className={`${styles.page} ${styles.loginPage}`}>
        <section className={styles.loadingPanel}>Loading BreatheFlow...</section>
      </main>
    );
  }

  if (!profile) {
    return (
      <LoginScreen
        form={loginForm}
        onChange={setLoginForm}
        onSubmit={submitLogin}
      />
    );
  }

  const dashboardSection = (
    <>
      <SectionHeader
        eyebrow="Live patient dashboard"
        title="Private readings stay focused until a sidebar section is opened."
        description="The default view shows only the active health status, signal trace, AI summary, alerts, and emergency readiness."
        action={
          <div className={styles.headerActions}>
            <button
              className={`${styles.iconButton} ${live ? styles.activeControl : ""}`}
              type="button"
              onClick={() => setLive((value) => !value)}
              title={live ? "Pause live simulation" : "Resume live simulation"}
              aria-pressed={live}
            >
              {live ? <Pause size={17} /> : <Play size={17} />}
              <span>{live ? "Live" : "Paused"}</span>
            </button>
            <button
              className={styles.iconButton}
              type="button"
              onClick={resetScenario}
              title="Reset selected scenario"
            >
              <RotateCcw size={17} />
              <span>Reset</span>
            </button>
          </div>
        }
      />

      <section className={styles.overviewGrid}>
        <article className={`${styles.statusPanel} ${styles[`${guidance.level}Risk`]}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Sensor fusion result</p>
              <h3>{result.title}</h3>
            </div>
            <span className={`${styles.statusPill} ${styles[result.cause]}`}>
              {result.confidence}% confidence
            </span>
          </div>
          <p className={styles.actionLine}>
            <BellRing size={18} aria-hidden="true" />
            {result.action}
          </p>
          <div className={styles.scoreGrid}>
            <FusionScore
              label="Environmental"
              value={result.scores.environment}
              tone="environmentBar"
            />
            <FusionScore label="Cardio" value={result.scores.cardio} tone="cardioBar" />
            <FusionScore label="Fatigue" value={result.scores.fatigue} tone="fatigueBar" />
          </div>
        </article>

        <article className={styles.wavePanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Live signal trace</p>
              <h3>{selectedScenario.label}</h3>
            </div>
            <Activity size={22} aria-hidden="true" />
          </div>
          <svg className={styles.waveChart} viewBox="0 0 300 58" aria-label="Live sensor chart">
            <path d={chartPath(historySnapshots, "breathRate")} className={styles.breathLine} />
            <path d={chartPath(historySnapshots, "heartRate")} className={styles.heartLine} />
            <path d={chartPath(historySnapshots, "spo2")} className={styles.oxygenLine} />
          </svg>
          <div className={styles.legend}>
            <span><i className={styles.breathDot} /> Breath</span>
            <span><i className={styles.heartDot} /> Heart</span>
            <span><i className={styles.oxygenDot} /> SpO2</span>
          </div>
        </article>

        <article className={styles.aiPreview}>
          <div className={styles.previewIcon}>
            <Bot size={20} aria-hidden="true" />
          </div>
          <div>
            <p className={styles.eyebrow}>AI guidance</p>
            <h3>{guidance.title}</h3>
            <p>{guidance.summary}</p>
          </div>
          <button type="button" onClick={() => setActiveSection("ai")}>
            Open AI Suggestions
          </button>
        </article>

        <article className={`${styles.emergencyPreview} ${isSevere ? styles.severePanel : ""}`}>
          <div className={styles.previewIcon}>
            <Siren size={20} aria-hidden="true" />
          </div>
          <div>
            <p className={styles.eyebrow}>Emergency assist</p>
            <h3>{isSevere ? "Hospital handoff recommended" : "Hospital handoff ready"}</h3>
            <p>{selectedHospital.name}</p>
          </div>
          <button type="button" onClick={() => setActiveSection("emergency")}>
            Emergency Assist
          </button>
        </article>
      </section>

      <section className={styles.alertAndVitals}>
        <AlertPanel alertState={alertState} onSendTest={() => void sendHealthAlert(true)} />
        <div className={styles.vitalsStrip}>
          {(["heartRate", "spo2", "breathRate", "stressIndex"] as MetricKey[]).map((key) => {
            const range = metricRanges[key];
            return (
              <div key={key}>
                <span>
                  {key === "spo2"
                    ? "SpO2"
                    : key.replace(/([A-Z])/g, " $1").toLowerCase()}
                </span>
                <strong>
                  {snapshot[key]}
                  <small>{range.unit}</small>
                </strong>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );

  const readingsSection = (
    <>
      <SectionHeader
        eyebrow="Readings lab"
        title="Sensor streams and demo controls"
        description="Micro Venturi, MAX30102, and MPU6050 values can be reviewed or adjusted for prototype demonstration."
      />

      <section className={styles.sensorGrid} aria-label="Current sensor readings">
        {sensorCards.map((card) => (
          <SensorCard key={card.key} card={card} snapshot={snapshot} />
        ))}
      </section>

      <section className={styles.controlsBand}>
        <div className={styles.scenarioPanel}>
          <div>
            <p className={styles.eyebrow}>Demo scenarios</p>
            <h3>Root-cause modes</h3>
          </div>
          <div className={styles.segmentedControl} role="group" aria-label="Scenario">
            {scenarios.map((item) => {
              const Icon =
                item.id === "environment"
                  ? ThermometerSun
                  : item.id === "cardio"
                    ? HeartPulse
                    : item.id === "fatigue"
                      ? UserRoundCog
                      : ShieldCheck;

              return (
                <button
                  key={item.id}
                  className={item.id === scenario ? styles.selectedSegment : ""}
                  type="button"
                  onClick={() => selectScenario(item.id)}
                  aria-pressed={item.id === scenario}
                  title={item.label}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.labPanel}>
          <div>
            <p className={styles.eyebrow}>Manual lab</p>
            <h3>Adjust readings</h3>
          </div>
          <div className={styles.sliderGrid}>
            {(
              [
                "breathRate",
                "heartRate",
                "spo2",
                "postureAngle",
                "motionLoad",
                "stressIndex",
              ] as MetricKey[]
            ).map((key) => {
              const range = metricRanges[key];
              return (
                <label key={key} className={styles.sliderLabel}>
                  <span>
                    {key === "spo2"
                      ? "SpO2"
                      : key.replace(/([A-Z])/g, " $1").toLowerCase()}
                    <strong>
                      {snapshot[key]} {range.unit}
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={range.min}
                    max={range.max}
                    value={snapshot[key]}
                    onChange={(event) => updateMetric(key, Number(event.target.value))}
                  />
                </label>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );

  const aiSection = (
    <>
      <SectionHeader
        eyebrow="AI suggestion box"
        title="Context-aware guidance appears when readings become abnormal."
        description="The prototype turns fused signals into explainable next steps and escalation rules."
        action={
          result.cause !== "stable" ? (
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => setActiveSection("emergency")}
            >
              <Siren size={17} aria-hidden="true" />
              Emergency Assist
            </button>
          ) : null
        }
      />

      <section className={styles.aiGrid}>
        <article className={`${styles.aiMainCard} ${styles[`${guidance.level}Risk`]}`}>
          <div className={styles.aiHeader}>
            <span className={styles.aiOrb}>
              <BrainCircuit size={26} aria-hidden="true" />
            </span>
            <div>
              <p className={styles.eyebrow}>AI assessment</p>
              <h3>{guidance.title}</h3>
            </div>
          </div>
          <p className={styles.aiSummary}>{guidance.summary}</p>
          <div className={styles.causeBox}>
            <strong>{guidance.possibleCause}</strong>
            <span>{guidance.hospitalTrigger}</span>
          </div>
        </article>

        <article className={styles.stepsCard}>
          <p className={styles.eyebrow}>Suggested next steps</p>
          <div className={styles.stepList}>
            {guidance.immediateSteps.map((step, index) => (
              <div key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );

  const emergencySection = (
    <>
      <SectionHeader
        eyebrow="Emergency hospital handoff"
        title="Location, report, and hospital call stay in one controlled flow."
        description="The user can share location, send the current health report, and open the affiliated hospital call option."
      />

      <section className={styles.emergencyGrid}>
        <article className={styles.emergencyCard}>
          <div className={styles.emergencyTitle}>
            <span className={`${styles.emergencyIcon} ${isSevere ? styles.pulseIcon : ""}`}>
              <Ambulance size={24} aria-hidden="true" />
            </span>
            <div>
              <p className={styles.eyebrow}>Health state</p>
              <h3>{result.title}</h3>
            </div>
          </div>
          <p className={styles.emergencyMessage}>{guidance.hospitalTrigger}</p>
          <div className={styles.emergencyStats}>
            <div>
              <span>HR</span>
              <strong>{snapshot.heartRate} bpm</strong>
            </div>
            <div>
              <span>SpO2</span>
              <strong>{snapshot.spo2}%</strong>
            </div>
            <div>
              <span>Stress</span>
              <strong>{snapshot.stressIndex}%</strong>
            </div>
          </div>
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() => void sendEmergencyReportAndCall()}
          >
            <PhoneCall size={18} aria-hidden="true" />
            Send Report & Call Hospital
          </button>
          <p className={styles.smallNote}>
            Prototype uses one user action before sharing report or opening the call.
          </p>
        </article>

        <article className={styles.locationCard}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Location tracking</p>
              <h3>{locationState.status === "ready" ? "Location active" : "Location permission"}</h3>
            </div>
            <MapPin size={22} aria-hidden="true" />
          </div>
          <p>{locationState.message}</p>
          {locationState.coords ? (
            <div className={styles.locationMeta}>
              <span>{locationState.coords.lat.toFixed(5)}</span>
              <span>{locationState.coords.lng.toFixed(5)}</span>
              <span>{Math.round(locationState.coords.accuracy ?? 0)} m accuracy</span>
            </div>
          ) : null}
          <button className={styles.secondaryButton} type="button" onClick={requestLocation}>
            <Navigation size={17} aria-hidden="true" />
            Detect Location
          </button>
        </article>

        <article className={styles.hospitalFocus}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Nearest affiliated hospital</p>
              <h3>{selectedHospital.name}</h3>
            </div>
            <Hospital size={22} aria-hidden="true" />
          </div>
          <p>{selectedHospital.type}</p>
          <div className={styles.hospitalFacts}>
            <span>{selectedHospital.response}</span>
            <span>
              {selectedHospital.distanceKm
                ? `${selectedHospital.distanceKm.toFixed(1)} km away`
                : "Distance after location"}
            </span>
          </div>
          <div className={styles.specialtyTags}>
            {selectedHospital.specialties.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <a className={styles.secondaryButton} href={phoneHref(selectedHospital.phone)}>
            <PhoneCall size={17} aria-hidden="true" />
            Call Only
          </a>
        </article>

        <article className={styles.reportCard}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Report preview</p>
              <h3>{emergencyState.reportId ?? "Ready to generate"}</h3>
            </div>
            <FileText size={22} aria-hidden="true" />
          </div>
          <pre>{reportText(profile, result, snapshot, selectedHospital, locationState.coords)}</pre>
          <div className={`${styles.reportStatus} ${styles[emergencyState.status]}`}>
            {emergencyState.message}
            {emergencyState.timestamp ? <span>{emergencyState.timestamp}</span> : null}
          </div>
        </article>
      </section>
    </>
  );

  const hospitalsSection = (
    <>
      <SectionHeader
        eyebrow="Affiliated hospital network"
        title="The app can choose the closest configured hospital after location access."
        description="For submission, these are prototype partners. Real deployment would replace them with verified hospital contacts."
        action={
          <button className={styles.secondaryButton} type="button" onClick={requestLocation}>
            <MapPin size={17} aria-hidden="true" />
            Update Location
          </button>
        }
      />

      <section className={styles.hospitalGrid}>
        {hospitalsWithDistance.map((hospital) => (
          <article
            className={`${styles.hospitalCard} ${
              hospital.id === selectedHospital.id ? styles.selectedHospital : ""
            }`}
            key={hospital.id}
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>{hospital.type}</p>
                <h3>{hospital.name}</h3>
              </div>
              <Hospital size={22} aria-hidden="true" />
            </div>
            <p>{hospital.address}</p>
            <div className={styles.hospitalFacts}>
              <span>{hospital.response}</span>
              <span>
                {hospital.distanceKm
                  ? `${hospital.distanceKm.toFixed(1)} km`
                  : "location pending"}
              </span>
            </div>
            <div className={styles.specialtyTags}>
              {hospital.specialties.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className={styles.cardActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() =>
                  setEmergencyState((current) => ({
                    ...current,
                    selectedHospitalId: hospital.id,
                    message: `${hospital.name} selected for emergency handoff.`,
                  }))
                }
              >
                Select
              </button>
              <a className={styles.iconLink} href={phoneHref(hospital.phone)}>
                <PhoneCall size={16} aria-hidden="true" />
                Call
              </a>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const historySection = (
    <>
      <SectionHeader
        eyebrow="Health timeline"
        title="Recent fused states stay useful without making the app overloaded."
        description="Keep the timeline for explanation, then delete individual entries or clear the session when it gets crowded."
        action={
          <button
            className={styles.deleteButton}
            type="button"
            onClick={clearHistory}
            disabled={historySnapshots.length <= 1}
          >
            <Trash2 size={16} aria-hidden="true" />
            Clear history
          </button>
        }
      />

      <section className={styles.timeline}>
        {activityLog.map((event) => (
          <article key={event.id} className={styles.timelineItem}>
            <span className={`${styles.timelineDot} ${styles[event.result.cause]}`} />
            <div>
              <p>{event.time}</p>
              <h3>{event.result.title}</h3>
              <span>
                HR {event.snapshot.heartRate} bpm, SpO2 {event.snapshot.spo2}%, stress{" "}
                {event.snapshot.stressIndex}%
              </span>
            </div>
            <strong>{event.result.confidence}%</strong>
            <button
              className={styles.rowDeleteButton}
              type="button"
              onClick={() => deleteHistoryPoint(event.sourceIndex)}
              title="Delete this history entry"
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </article>
        ))}
      </section>
    </>
  );

  const profileSection = (
    <>
      <SectionHeader
        eyebrow="Patient profile"
        title="Profile, contact routing, and alert preferences"
        description="The profile now feels like a health workspace instead of a plain form."
      />

      <section className={styles.profileDashboard}>
        <article className={styles.profileHeroCard}>
          <div className={styles.profileAvatarLarge}>{getInitials(profile.name)}</div>
          <div className={styles.profileHeroText}>
            <p className={styles.eyebrow}>Active patient workspace</p>
            <h3>{profile.name}</h3>
            <span>{profile.email}</span>
          </div>
          <div className={styles.profileBadges}>
            <span>Private dashboard</span>
            <span>{profile.emailAlerts || profile.smsAlerts ? "Alerts active" : "Alerts off"}</span>
          </div>
          <div className={styles.profileStats}>
            <div>
              <small>Current status</small>
              <strong>{result.title}</strong>
            </div>
            <div>
              <small>Risk level</small>
              <strong>{guidance.level}</strong>
            </div>
            <div>
              <small>Hospital route</small>
              <strong>{selectedHospital.response}</strong>
            </div>
          </div>
        </article>

        <form className={styles.profileForm} onSubmit={saveProfile}>
          <div className={styles.formHeader}>
            <UserRoundCog size={22} aria-hidden="true" />
            <div>
              <h3>Contact details</h3>
              <p>Used for alert routing and emergency handoff reports.</p>
            </div>
          </div>
          <label className={styles.fieldLabel}>
            Full name
            <input
              required
              type="text"
              value={loginForm.name}
              onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })}
            />
          </label>
          <label className={styles.fieldLabel}>
            Email address
            <input
              required
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
            />
          </label>
          <label className={styles.fieldLabel}>
            Phone number
            <input
              type="tel"
              value={loginForm.phone}
              onChange={(event) => setLoginForm({ ...loginForm, phone: event.target.value })}
            />
          </label>
          <div className={styles.toggleGrid}>
            <label>
              <input
                type="checkbox"
                checked={loginForm.emailAlerts}
                onChange={(event) =>
                  setLoginForm({ ...loginForm, emailAlerts: event.target.checked })
                }
              />
              <Mail size={16} aria-hidden="true" />
              Email alerts
            </label>
            <label>
              <input
                type="checkbox"
                checked={loginForm.smsAlerts}
                onChange={(event) =>
                  setLoginForm({ ...loginForm, smsAlerts: event.target.checked })
                }
              />
              <Phone size={16} aria-hidden="true" />
              SMS alerts
            </label>
          </div>
          <button className={styles.loginButton} type="submit">
            Save profile
          </button>
        </form>

        <article className={styles.profileRouteCard}>
          <div className={styles.formHeader}>
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h3>Notification routing</h3>
              <p>Shows how this profile will be contacted during a risk event.</p>
            </div>
          </div>
          <div className={styles.routeList}>
            <div>
              <Mail size={18} aria-hidden="true" />
              <span>Email channel</span>
              <strong>{profile.emailAlerts ? "Enabled" : "Disabled"}</strong>
            </div>
            <div>
              <Phone size={18} aria-hidden="true" />
              <span>SMS channel</span>
              <strong>{profile.smsAlerts ? "Enabled" : "Disabled"}</strong>
            </div>
            <div>
              <Hospital size={18} aria-hidden="true" />
              <span>Hospital handoff</span>
              <strong>{selectedHospital.name}</strong>
            </div>
          </div>
        </article>
      </section>
    </>
  );

  const settingsSection = (
    <>
      <SectionHeader
        eyebrow="Prototype settings"
        title="Controls, integrations, and safety boundaries"
        description="Settings now show what is live, what is simulated, and what needs real API keys later."
        action={
          <button
            className={styles.deleteButton}
            type="button"
            onClick={clearHistory}
            disabled={historySnapshots.length <= 1}
          >
            <Trash2 size={16} aria-hidden="true" />
            Clear timeline
          </button>
        }
      />

      <section className={styles.settingsSummary}>
        <article>
          <span>Mode</span>
          <strong>Prototype demo</strong>
          <p>Live sensor values are simulated until the ESP32-S3 stream is connected.</p>
        </article>
        <article>
          <span>Alerts</span>
          <strong>{profile.emailAlerts || profile.smsAlerts ? "Enabled" : "Disabled"}</strong>
          <p>Email/SMS routing follows the saved patient profile.</p>
        </article>
        <article>
          <span>Hospital</span>
          <strong>{selectedHospital.name}</strong>
          <p>Emergency handoff can generate a report and open the call action.</p>
        </article>
      </section>

      <section className={styles.settingsGrid}>
        <article className={styles.settingCard}>
          <SlidersHorizontal size={22} aria-hidden="true" />
          <div>
            <h3>Simulation mode</h3>
            <p>Live readings are generated from scenario profiles until ESP32-S3 data is connected.</p>
            <span className={styles.settingStatus}>Active for demo</span>
          </div>
        </article>
        <article className={styles.settingCard}>
          <ClipboardList size={22} aria-hidden="true" />
          <div>
            <h3>Clinical boundary</h3>
            <p>BreatheFlow is a prototype dashboard, not a certified diagnosis system.</p>
            <span className={styles.settingStatus}>Shown in app</span>
          </div>
        </article>
        <article className={styles.settingCard}>
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <h3>Privacy boundary</h3>
            <p>Profile data stays in browser storage unless an alert or emergency report is sent.</p>
            <span className={styles.settingStatus}>Local first</span>
          </div>
        </article>
        <article className={styles.settingCard}>
          <BellRing size={22} aria-hidden="true" />
          <div>
            <h3>Alert delivery</h3>
            <p>Real delivery needs Resend and Twilio environment variables on Vercel.</p>
            <span className={styles.settingStatus}>Demo-ready</span>
          </div>
        </article>
        <article className={styles.settingCard}>
          <MapPin size={22} aria-hidden="true" />
          <div>
            <h3>Location access</h3>
            <p>Location is requested only when the user opens Emergency Assist.</p>
            <span className={styles.settingStatus}>{locationState.status}</span>
          </div>
        </article>
        <article className={styles.settingCard}>
          <History size={22} aria-hidden="true" />
          <div>
            <h3>Timeline control</h3>
            <p>History can now be cleared or individual entries can be deleted.</p>
            <span className={styles.settingStatus}>{historySnapshots.length} entries</span>
          </div>
        </article>
      </section>
    </>
  );

  const sectionContent: Record<AppSection, React.ReactNode> = {
    dashboard: dashboardSection,
    readings: readingsSection,
    ai: aiSection,
    emergency: emergencySection,
    hospitals: hospitalsSection,
    history: historySection,
    profile: profileSection,
    settings: settingsSection,
  };

  return (
    <main className={styles.page}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandBlock}>
            <span className={styles.brandMark}>BF</span>
            <div>
              <strong>BreatheFlow</strong>
              <span>Health Command</span>
            </div>
          </div>

          <nav className={styles.sideNav} aria-label="BreatheFlow sections">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`${styles.navButton} ${
                    activeSection === item.id ? styles.activeNav : ""
                  }`}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className={styles.sidebarProfile}>
            <span>{getInitials(profile.name)}</span>
            <div>
              <strong>{profile.name}</strong>
              <small>{profile.email}</small>
            </div>
          </div>
        </aside>

        <section className={styles.mainShell}>
          <header className={styles.topBar}>
            <div>
              <p className={styles.eyebrow}>Logged in health workspace</p>
              <h1>{navItems.find((item) => item.id === activeSection)?.label}</h1>
            </div>
            <div className={styles.topActions}>
              <button
                className={`${styles.iconButton} ${isSevere ? styles.emergencyHot : ""}`}
                type="button"
                onClick={() => setActiveSection("emergency")}
              >
                <Siren size={17} aria-hidden="true" />
                <span>{isSevere ? "Severe Risk" : "Emergency"}</span>
              </button>
              <button className={styles.iconButton} type="button" onClick={signOut}>
                <LogOut size={17} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          </header>

          <div className={styles.contentArea}>{sectionContent[activeSection]}</div>
        </section>
      </div>
    </main>
  );
}
