export const runtime = "nodejs";

type AlertProfile = {
  name?: string;
  email?: string;
  phone?: string;
  emailAlerts?: boolean;
  smsAlerts?: boolean;
};

type AlertResult = {
  title?: string;
  cause?: string;
  confidence?: number;
  action?: string;
};

type AlertSnapshot = {
  breathRate?: number;
  heartRate?: number;
  spo2?: number;
  postureAngle?: number;
  motionLoad?: number;
  stressIndex?: number;
};

type AlertRequest = {
  profile?: AlertProfile;
  result?: AlertResult;
  snapshot?: AlertSnapshot;
  manual?: boolean;
  generatedAt?: string;
};

type DeliveryResult = {
  channel: "email" | "sms";
  status: "sent" | "demo" | "error" | "skipped";
  detail: string;
};

const appName = "BreatheFlow";

function sanitizeText(value: unknown, fallback = "Unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatAlertText(body: AlertRequest) {
  const profile = body.profile ?? {};
  const result = body.result ?? {};
  const snapshot = body.snapshot ?? {};
  const patientName = sanitizeText(profile.name, "Patient");
  const title = sanitizeText(result.title, "Health risk alert");
  const action = sanitizeText(result.action, "Review the readings immediately");
  const confidence =
    typeof result.confidence === "number" ? `${result.confidence}%` : "Not available";

  return [
    `${appName} alert for ${patientName}`,
    `Status: ${title}`,
    `Confidence: ${confidence}`,
    `Recommended action: ${action}`,
    "",
    `Heart rate: ${snapshot.heartRate ?? "NA"} bpm`,
    `SpO2: ${snapshot.spo2 ?? "NA"}%`,
    `Breath rate: ${snapshot.breathRate ?? "NA"} rpm`,
    `Posture tilt: ${snapshot.postureAngle ?? "NA"} deg`,
    `Motion load: ${snapshot.motionLoad ?? "NA"}%`,
    `Stress index: ${snapshot.stressIndex ?? "NA"}%`,
    "",
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

async function sendEmail(to: string, subject: string, text: string): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "BreatheFlow <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      channel: "email",
      status: "demo",
      detail: "Email alert prepared. Add RESEND_API_KEY on Vercel to send real mail.",
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
      channel: "email",
      status: "error",
      detail: `Email failed: ${JSON.stringify(payload)}`,
    };
  }

  return {
    channel: "email",
    status: "sent",
    detail: "Email alert sent.",
  };
}

async function sendSms(to: string, text: string): Promise<DeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    return {
      channel: "sms",
      status: "demo",
      detail:
        "SMS alert prepared. Add Twilio environment variables on Vercel to send real SMS.",
    };
  }

  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: text.slice(0, 700),
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  if (!response.ok) {
    const payload = await readJson(response);
    return {
      channel: "sms",
      status: "error",
      detail: `SMS failed: ${JSON.stringify(payload)}`,
    };
  }

  return {
    channel: "sms",
    status: "sent",
    detail: "SMS alert sent.",
  };
}

export async function POST(request: Request) {
  let body: AlertRequest;

  try {
    body = (await request.json()) as AlertRequest;
  } catch {
    return Response.json(
      { ok: false, mode: "error", message: "Invalid alert request.", channels: [] },
      { status: 400 },
    );
  }

  const profile = body.profile ?? {};
  const result = body.result ?? {};
  const subject = `${appName}: ${sanitizeText(result.title, "Health risk alert")}`;
  const text = formatAlertText(body);
  const deliveries: DeliveryResult[] = [];

  if (profile.emailAlerts) {
    const email = sanitizeText(profile.email, "");
    deliveries.push(
      email
        ? await sendEmail(email, subject, text)
        : { channel: "email", status: "skipped", detail: "No email address provided." },
    );
  }

  if (profile.smsAlerts) {
    const phone = sanitizeText(profile.phone, "");
    deliveries.push(
      phone
        ? await sendSms(phone, text)
        : { channel: "sms", status: "skipped", detail: "No phone number provided." },
    );
  }

  if (deliveries.length === 0) {
    return Response.json({
      ok: true,
      mode: "demo",
      message: "Health alert generated in the app. No notification channel selected.",
      channels: [],
      deliveries,
    });
  }

  const sent = deliveries.filter((delivery) => delivery.status === "sent");
  const demo = deliveries.filter((delivery) => delivery.status === "demo");
  const failed = deliveries.filter((delivery) => delivery.status === "error");
  const channels = deliveries
    .filter((delivery) => delivery.status !== "skipped")
    .map((delivery) => delivery.channel);

  if (sent.length > 0) {
    return Response.json({
      ok: true,
      mode: "sent",
      message: "Health alert sent successfully.",
      channels,
      deliveries,
    });
  }

  if (demo.length > 0 && failed.length === 0) {
    return Response.json({
      ok: true,
      mode: "demo",
      message: "Demo alert generated. Add email/SMS keys in Vercel for real delivery.",
      channels,
      deliveries,
    });
  }

  return Response.json(
    {
      ok: false,
      mode: "error",
      message: "Health alert could not be delivered.",
      channels,
      deliveries,
    },
    { status: 502 },
  );
}
