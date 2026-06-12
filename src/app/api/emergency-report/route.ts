export const runtime = "nodejs";

type EmergencyProfile = {
  name?: string;
  email?: string;
  phone?: string;
};

type EmergencyResult = {
  title?: string;
  cause?: string;
  confidence?: number;
  action?: string;
};

type EmergencySnapshot = {
  breathRate?: number;
  heartRate?: number;
  spo2?: number;
  postureAngle?: number;
  motionLoad?: number;
  stressIndex?: number;
};

type EmergencyHospital = {
  name?: string;
  phone?: string;
  reportEmail?: string;
  address?: string;
  response?: string;
};

type EmergencyLocation = {
  lat?: number;
  lng?: number;
  accuracy?: number;
};

type EmergencyReportRequest = {
  reportId?: string;
  profile?: EmergencyProfile;
  result?: EmergencyResult;
  snapshot?: EmergencySnapshot;
  hospital?: EmergencyHospital;
  location?: EmergencyLocation;
  generatedAt?: string;
};

function sanitizeText(value: unknown, fallback = "Unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatEmergencyReport(body: EmergencyReportRequest) {
  const profile = body.profile ?? {};
  const result = body.result ?? {};
  const snapshot = body.snapshot ?? {};
  const hospital = body.hospital ?? {};
  const location = body.location ?? {};

  return [
    `BreatheFlow emergency report: ${sanitizeText(body.reportId, "BF-DEMO")}`,
    "",
    `Patient: ${sanitizeText(profile.name, "Patient")}`,
    `Email: ${sanitizeText(profile.email, "NA")}`,
    `Phone: ${sanitizeText(profile.phone, "NA")}`,
    "",
    `Status: ${sanitizeText(result.title, "Health risk alert")}`,
    `Cause: ${sanitizeText(result.cause, "NA")}`,
    `Confidence: ${typeof result.confidence === "number" ? `${result.confidence}%` : "NA"}`,
    `Recommended action: ${sanitizeText(result.action, "Review immediately")}`,
    "",
    `Heart rate: ${snapshot.heartRate ?? "NA"} bpm`,
    `SpO2: ${snapshot.spo2 ?? "NA"}%`,
    `Breath rate: ${snapshot.breathRate ?? "NA"} rpm`,
    `Posture tilt: ${snapshot.postureAngle ?? "NA"} deg`,
    `Motion load: ${snapshot.motionLoad ?? "NA"}%`,
    `Stress index: ${snapshot.stressIndex ?? "NA"}%`,
    "",
    `Hospital: ${sanitizeText(hospital.name, "Affiliated hospital")}`,
    `Hospital phone: ${sanitizeText(hospital.phone, "NA")}`,
    `Hospital address: ${sanitizeText(hospital.address, "NA")}`,
    `Expected response: ${sanitizeText(hospital.response, "NA")}`,
    "",
    typeof location.lat === "number" && typeof location.lng === "number"
      ? `Location: ${location.lat}, ${location.lng} (${Math.round(location.accuracy ?? 0)} m accuracy)`
      : "Location: not shared",
    `Generated: ${body.generatedAt ?? new Date().toISOString()}`,
  ].join("\n");
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function sendHospitalEmail(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "BreatheFlow <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      status: "demo" as const,
      detail: "Emergency report prepared. Add RESEND_API_KEY on Vercel for real hospital email.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "breatheflow-app/1.0",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const payload = await readJson(response);
    return {
      status: "error" as const,
      detail: `Hospital report failed: ${JSON.stringify(payload)}`,
    };
  }

  return {
    status: "sent" as const,
    detail: "Emergency report sent to affiliated hospital.",
  };
}

export async function POST(request: Request) {
  let body: EmergencyReportRequest;

  try {
    body = (await request.json()) as EmergencyReportRequest;
  } catch {
    return Response.json(
      { ok: false, mode: "error", message: "Invalid emergency report request." },
      { status: 400 },
    );
  }

  const configuredEmail = process.env.HOSPITAL_REPORT_EMAIL;
  const hospitalEmail = sanitizeText(body.hospital?.reportEmail, "");
  const reportEmail = configuredEmail || hospitalEmail;
  const reportId = sanitizeText(body.reportId, `BF-${Date.now().toString(36).toUpperCase()}`);
  const text = formatEmergencyReport({ ...body, reportId });
  const subject = `BreatheFlow emergency handoff ${reportId}`;

  if (!reportEmail || reportEmail.endsWith(".demo")) {
    return Response.json({
      ok: true,
      mode: "demo",
      message:
        "Emergency report generated in demo mode. Configure HOSPITAL_REPORT_EMAIL for real delivery.",
      reportId,
    });
  }

  const delivery = await sendHospitalEmail(reportEmail, subject, text);

  if (delivery.status === "error") {
    return Response.json(
      {
        ok: false,
        mode: "error",
        message: delivery.detail,
        reportId,
      },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    mode: delivery.status,
    message: delivery.detail,
    reportId,
  });
}
