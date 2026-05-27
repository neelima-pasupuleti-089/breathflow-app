"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Gauge,
  HeartPulse,
  LogIn,
  LogOut,
  Mail,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  ThermometerSun,
  UserRound,
  UserRoundCog,
  Waves,
  Wind,
} from "lucide-react";
import styles from "./page.module.css";

type ScenarioId = "balanced" | "environment" | "cardio" | "fatigue";
type CauseId = "stable" | "environment" | "cardio" | "fatigue";
type MetricKey = keyof SensorSnapshot;

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
  height = 48,
  width = 220,
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
          <stop offset="0" stopColor="#1f9d8a" />
          <stop offset="1" stopColor="#2f6fed" />
        </linearGradient>
      </defs>
      <rect x="58" y="35" width="304" height="180" rx="24" fill="#f8fafc" />
      <path
        d="M78 124 C126 84, 174 84, 220 124 S312 164, 356 124"
        fill="none"
        stroke="url(#flowLine)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M93 124 L142 101 L142 147 Z M327 124 L278 101 L278 147 Z"
        fill="#dff7f1"
        stroke="#1f9d8a"
        strokeWidth="4"
      />
      <rect x="172" y="82" width="76" height="84" rx="10" fill="#111827" />
      <rect x="185" y="96" width="50" height="12" rx="4" fill="#55d4c4" />
      <rect x="185" y="118" width="50" height="12" rx="4" fill="#f7b955" />
      <rect x="185" y="140" width="50" height="12" rx="4" fill="#ff6b6b" />
      <circle cx="93" cy="58" r="24" fill="#fff" stroke="#1f9d8a" strokeWidth="5" />
      <circle cx="327" cy="58" r="24" fill="#fff" stroke="#2f6fed" strokeWidth="5" />
      <circle cx="93" cy="192" r="24" fill="#fff" stroke="#ff6b6b" strokeWidth="5" />
      <circle cx="327" cy="192" r="24" fill="#fff" stroke="#f7b955" strokeWidth="5" />
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
            Sign in with your profile to view private readings and receive alerts
            when the fused sensor data detects stress risk.
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
            View my readings
          </button>

          <p className={styles.loginNote}>
            This prototype stores the login profile on this browser. Real multi-user
            passwords can be added later with Supabase or Firebase.
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

export default function Home() {
  const [scenario, setScenario] = useState<ScenarioId>("balanced");
  const [live, setLive] = useState(true);
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
  const [snapshot, setSnapshot] = useState<SensorSnapshot>(() =>
    makeSnapshot("balanced", 0),
  );
  const [history, setHistory] = useState<SensorSnapshot[]>(() =>
    Array.from({ length: 24 }, (_, index) => makeSnapshot("balanced", index)),
  );

  const result = useMemo(() => classifyStress(snapshot), [snapshot]);
  const selectedScenario =
    scenarios.find((item) => item.id === scenario) ?? scenarios[0];

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
      setHistory((items) => [...items.slice(-23), nextSnapshot]);
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
  }, [profile, result.cause, result.confidence, sendHealthAlert, snapshot]);

  const selectScenario = (nextScenario: ScenarioId) => {
    stepRef.current = 0;
    const first = makeSnapshot(nextScenario, 0);
    setScenario(nextScenario);
    setSnapshot(first);
    setHistory(
      Array.from({ length: 24 }, (_, index) => makeSnapshot(nextScenario, index)),
    );
  };

  const updateMetric = (key: MetricKey, value: number) => {
    setLive(false);
    setSnapshot((current) => {
      const next = { ...current, [key]: value };
      setHistory((items) => [...items.slice(-23), next]);
      return next;
    });
  };

  const resetScenario = () => {
    const first = makeSnapshot(scenario, 0);
    stepRef.current = 0;
    setSnapshot(first);
    setHistory(Array.from({ length: 24 }, (_, index) => makeSnapshot(scenario, index)));
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

  const signOut = () => {
    window.localStorage.removeItem("breatheflow-profile");
    setProfile(null);
    setLoginForm(emptyLoginForm);
    setAlertState({
      status: "idle",
      message: "Alerts are waiting for a health risk signal.",
      channels: [],
    });
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

  return (
    <main className={styles.page}>
      <section className={styles.heroBand}>
        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Compact multi-parameter health monitor</p>
            <h1>BreatheFlow</h1>
            <p>
              Respiratory, cardiovascular, and posture signals are fused into one
              stress-cause dashboard for a wearable health-monitoring prototype.
            </p>
            <div className={styles.heroActions}>
              <button
                className={`${styles.controlButton} ${live ? styles.activeControl : ""}`}
                type="button"
                onClick={() => setLive((value) => !value)}
                aria-pressed={live}
                title={live ? "Pause live simulation" : "Resume live simulation"}
              >
                {live ? <Pause size={17} /> : <Play size={17} />}
                <span>{live ? "Live" : "Paused"}</span>
              </button>
              <button
                className={styles.controlButton}
                type="button"
                onClick={resetScenario}
                title="Reset selected scenario"
              >
                <RotateCcw size={17} />
                <span>Reset</span>
              </button>
            </div>
          </div>
          <DeviceDiagram />
        </div>
      </section>

      <section className={styles.profileBand}>
        <div className={styles.profileCard}>
          <span className={styles.profileIcon}>
            <UserRound size={18} aria-hidden="true" />
          </span>
          <div>
            <p>Logged in as</p>
            <strong>{profile.name}</strong>
            <span>{profile.email}</span>
          </div>
          <button type="button" onClick={signOut} title="Sign out">
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
        <AlertPanel alertState={alertState} onSendTest={() => void sendHealthAlert(true)} />
      </section>

      <section className={styles.dashboard}>
        <div className={styles.statusPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Sensor fusion result</p>
              <h2>{result.title}</h2>
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
            <FusionScore
              label="Cardio"
              value={result.scores.cardio}
              tone="cardioBar"
            />
            <FusionScore
              label="Fatigue"
              value={result.scores.fatigue}
              tone="fatigueBar"
            />
          </div>
        </div>

        <div className={styles.wavePanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Live signal trace</p>
              <h2>{selectedScenario.label}</h2>
            </div>
            <Activity size={22} aria-hidden="true" />
          </div>
          <svg className={styles.waveChart} viewBox="0 0 220 48" aria-label="Live sensor chart">
            <path d={chartPath(history, "breathRate")} className={styles.breathLine} />
            <path d={chartPath(history, "heartRate")} className={styles.heartLine} />
            <path d={chartPath(history, "spo2")} className={styles.oxygenLine} />
          </svg>
          <div className={styles.legend}>
            <span><i className={styles.breathDot} /> Breath</span>
            <span><i className={styles.heartDot} /> Heart</span>
            <span><i className={styles.oxygenDot} /> SpO2</span>
          </div>
        </div>
      </section>

      <section className={styles.sensorGrid} aria-label="Current sensor readings">
        {sensorCards.map((card) => (
          <SensorCard key={card.key} card={card} snapshot={snapshot} />
        ))}
      </section>

      <section className={styles.controlsBand}>
        <div className={styles.scenarioPanel}>
          <div>
            <p className={styles.eyebrow}>Demo scenarios</p>
            <h2>Root-cause modes</h2>
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
            <h2>Adjust readings</h2>
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
    </main>
  );
}
