export class EmailSendError extends Error {}

export function renderVerificationEmail(name: string, code: string, minutes: number) {
  const text = `Hi ${name},\n\nYour ConsultEase verification code is ${code}.\nIt expires in ${minutes} minutes.\n\nDidn't request this? Ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;color:#0f2132">
<h2 style="margin:0 0 12px">ConsultEase</h2><p>Hi ${name.replace(/[<>&]/g, "")}, use this code to verify your email:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#e1eff5;padding:16px;border-radius:12px;text-align:center">${code}</p>
<p>It expires in ${minutes} minutes and can be used once.</p><p style="color:#5f6b7a;font-size:13px">Didn't request this? Ignore this email.</p></div>`;
  return { text, html };
}

const esc = (v: string) => v.replace(/[<>&"]/g, "");

/** Swap providers by replacing only this function. Never log the API key or message bodies. */
async function sendBrevo(to: string, name: string, subject: string, html: string, text: string) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new EmailSendError("Email provider not configured");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME ?? "ConsultEase" },
      to: [{ email: to, name }], subject, htmlContent: html, textContent: text,
    }),
  });
  if (!res.ok) {
    const body = typeof res.text === "function" ? await res.text() : "";
    throw new EmailSendError(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function sendVerificationEmail(to: string, name: string, code: string, minutes = 10) {
  const { html, text } = renderVerificationEmail(name, code, minutes);
  await sendBrevo(to, name, "Your ConsultEase verification code", html, text);
}

export type ConsultationRequestInfo = {
  professorName: string; studentName: string; studentEmail: string;
  concern: string; mode: string; when: string; deadline?: string | null; description: string; priority: string;
};

export function renderConsultationRequestEmail(i: ConsultationRequestInfo, link: string) {
  const text = `Hi ${i.professorName},\n\n${i.studentName} (${i.studentEmail}) requested a consultation.\n\nConcern: ${i.concern}\nMode: ${i.mode}\nSchedule: ${i.when}\nDeadline: ${i.deadline ?? "None"}\nPriority: ${i.priority}\n\nDetails:\n${i.description}\n\nReview it here: ${link}`;
  const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#5f6b7a">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f2132">
<h2 style="margin:0 0 12px">ConsultEase</h2><p>Hi ${esc(i.professorName)}, <b>${esc(i.studentName)}</b> (${esc(i.studentEmail)}) requested a consultation.</p>
<table style="font-size:14px">${row("Concern", i.concern)}${row("Mode", i.mode)}${row("Schedule", i.when)}${row("Deadline", i.deadline ?? "None")}${row("Priority", i.priority)}</table>
<p style="background:#e1eff5;padding:12px;border-radius:12px;white-space:pre-wrap">${esc(i.description)}</p>
<p><a href="${link}" style="background:#0f2132;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Review request</a></p></div>`;
  return { text, html };
}

export async function sendConsultationRequestEmail(to: string, info: ConsultationRequestInfo, link: string) {
  const { html, text } = renderConsultationRequestEmail(info, link);
  await sendBrevo(to, info.professorName, `New consultation request from ${esc(info.studentName)}`, html, text);
}

/** Run an email send without ever letting a mail failure break the main action. */
export async function trySend(p: Promise<void>) {
  try { await p; } catch (e: any) { console.error("Email failed:", e?.message); }
}

export type CancellationInfo = {
  recipientName: string;
  actorName: string;                 // who cancelled / declined (the student or professor)
  kind: "CANCELLED" | "RESCHEDULING" | "DECLINED" | "AUTO_CANCELLED";
  title: string; when: string; mode: string; link: string;
};

export function renderCancellationEmail(i: CancellationInfo) {
  const heading = {
    CANCELLED: `${i.actorName} cancelled a consultation`,
    RESCHEDULING: `${i.actorName} is rescheduling a consultation`,
    DECLINED: `${i.actorName} declined your consultation request`,
    AUTO_CANCELLED: "Your consultation was cancelled because check-in closed",
  }[i.kind];
  const note = {
    CANCELLED: "The time slot is now free again.",
    RESCHEDULING: "The original slot is now free. A new request may follow.",
    DECLINED: "You can request another slot from your dashboard.",
    AUTO_CANCELLED: "You did not check in before the grace period ended. You can request a new appointment.",
  }[i.kind];
  const text = `Hi ${i.recipientName},\n\n${heading}.\n\nConsultation: ${i.title}\nSchedule: ${i.when}\nMode: ${i.mode}\n\n${note}\n\nOpen ConsultEase: ${i.link}`;
  const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#5f6b7a">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f2132">
<h2 style="margin:0 0 12px">ConsultEase</h2><p>Hi ${esc(i.recipientName)},</p><p><b>${esc(heading)}.</b></p>
<table style="font-size:14px">${row("Consultation", i.title)}${row("Schedule", i.when)}${row("Mode", i.mode)}</table>
<p>${note}</p><p><a href="${i.link}" style="background:#0f2132;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open ConsultEase</a></p></div>`;
  return { text, html, heading };
}

export async function sendCancellationEmail(to: string, info: CancellationInfo) {
  const { html, text, heading } = renderCancellationEmail(info);
  await sendBrevo(to, info.recipientName, heading, html, text);
}

export type ApprovalInfo = {
  studentName: string; professorName: string; title: string; when: string; mode: string;
  priority: string; queueNumber: number | null; location: string | null; meetingLink: string | null; link: string;
};

export function renderApprovalEmail(i: ApprovalInfo) {
  const place = i.mode === "Online" ? (i.meetingLink ? `Meeting link: ${i.meetingLink}` : "Your professor will share the meeting link.") : (i.location ? `Location: ${i.location}` : "");
  const text = `Hi ${i.studentName},\n\n${i.professorName} approved your consultation request.\n\nConsultation: ${i.title}\nSchedule: ${i.when}\nMode: ${i.mode}\nPriority: ${i.priority}${i.queueNumber ? `\nQueue number: #${i.queueNumber}` : ""}\n${place}\n\nYour QR code for check-in is ready here: ${i.link}`;
  const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#5f6b7a">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;
  const placeHtml = i.mode === "Online"
    ? (i.meetingLink && /^https?:\/\/\S+$/i.test(i.meetingLink) ? `<p>Meeting link: <a href="${esc(i.meetingLink)}">${esc(i.meetingLink)}</a></p>` : "<p>Your professor will share the meeting link.</p>")
    : (i.location ? `<p>Location: <b>${esc(i.location)}</b></p>` : "");
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f2132">
<h2 style="margin:0 0 12px">ConsultEase</h2><p>Hi ${esc(i.studentName)}, <b>${esc(i.professorName)}</b> approved your consultation request.</p>
<table style="font-size:14px">${row("Consultation", i.title)}${row("Schedule", i.when)}${row("Mode", i.mode)}${row("Priority", i.priority)}${i.queueNumber ? row("Queue number", `#${i.queueNumber}`) : ""}</table>
${placeHtml}<p>Your QR code for check-in is ready.</p>
<p><a href="${i.link}" style="background:#0f2132;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">View my QR code</a></p></div>`;
  return { text, html };
}

export async function sendApprovalEmail(to: string, info: ApprovalInfo) {
  const { html, text } = renderApprovalEmail(info);
  await sendBrevo(to, info.studentName, `Approved: ${esc(info.title)} with ${esc(info.professorName)}`, html, text);
}