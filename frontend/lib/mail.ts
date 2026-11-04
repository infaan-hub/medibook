import nodemailer from "nodemailer";

interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "");
  const from = process.env.SMTP_FROM_EMAIL?.trim() || user;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }
  if (!user || !pass || !from) {
    throw new Error("SMTP is not configured. Set SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.body,
  });
}

export function loginVerificationMail(
  user: { email: string; first_name: string; username: string },
  code: string,
  expiresInMinutes: number
): MailMessage {
  const name = user.first_name || user.username;
  return {
    to: user.email,
    subject: "Your MediBook verification code",
    body: [
      `Hello ${name},`,
      "",
      "Use this code to complete your MediBook sign-in:",
      "",
      code,
      "",
      `This code expires in ${expiresInMinutes} minutes. If you did not try to sign in, you can ignore this email.`,
    ].join("\n"),
  };
}

export function passwordResetMail(user: { email: string; first_name: string; username: string }, rawToken: string): MailMessage {
  const hours = Number(process.env.PASSWORD_RESET_TOKEN_HOURS ?? 2);
  const shortName = user.first_name || user.username;
  return {
    to: user.email,
    subject: "Reset your MediBook password",
    body: [
      `Hello ${shortName},`,
      "",
      "Use this code to reset your MediBook password:",
      "",
      rawToken,
      "",
      `It expires in ${hours} hours. If you did not request this, ignore this email.`,
    ].join("\n"),
  };
}
