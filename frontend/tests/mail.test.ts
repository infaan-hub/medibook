import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: smtp.createTransport },
}));

import { loginVerificationMail, sendMail } from "@/lib/mail";

beforeEach(() => {
  vi.resetAllMocks();
  smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
  vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_USER", "sender@example.com");
  vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");
  vi.stubEnv("SMTP_FROM_EMAIL", "sender@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SMTP mail delivery", () => {
  it("sends through SMTP with Gmail credentials and a normalized app password", async () => {
    const message = {
      to: "patient@example.com",
      subject: "Verification",
      body: "Your code is 123456.",
    };

    await sendMail(message);

    expect(smtp.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: { user: "sender@example.com", pass: "abcdefghijklmnop" },
    });
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: "sender@example.com",
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
  });

  it("fails explicitly when SMTP credentials are missing", async () => {
    vi.stubEnv("SMTP_PASS", "");

    await expect(
      sendMail({ to: "patient@example.com", subject: "Verification", body: "123456" })
    ).rejects.toThrow("SMTP is not configured");
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });

  it("builds a verification email with its code and expiration", () => {
    const message = loginVerificationMail(
      { email: "patient@example.com", first_name: "Patient", username: "patient" },
      "123456",
      5
    );

    expect(message).toMatchObject({
      to: "patient@example.com",
      subject: "Your MediBook verification code",
    });
    expect(message.body).toContain("Hello Patient,");
    expect(message.body).toContain("123456");
    expect(message.body).toContain("expires in 5 minutes");
  });
});
