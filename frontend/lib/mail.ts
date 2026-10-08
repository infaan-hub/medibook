/**
 * Email transport — dev parity with Django's console EmailBackend: messages
 * (e.g. password-reset tokens) are printed to the server console instead of
 * being sent. Swap in a real transport for production deployments.
 */
interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const transport = (process.env.EMAIL_TRANSPORT ?? "console").toLowerCase();
  // Intentional: matches `python manage.py runserver` output for reset mails.
  console.log(
    [
      "---------- Mail (EMAIL_TRANSPORT=" + transport + ") ----------",
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      "",
      message.body,
      "-----------------------------------------------------------",
    ].join("\n")
  );
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

/**
 * The login one-time code. Email is the delivery channel that works EVERYWHERE
 * — including iOS Safari tabs, where Apple only allows Web Push inside the
 * installed Home Screen app (and on devices where the user denied push).
 * Sent only AFTER a correct password, so it never reveals whether an account
 * exists.
 */
export function loginOtpMail(
  user: { email: string; first_name: string; username: string },
  code: string,
  expiresInMinutes: number
): MailMessage {
  const shortName = user.first_name || user.username;
  return {
    to: user.email,
    subject: "Your MediBook login code",
    body: [
      `Hello ${shortName},`,
      "",
      "Use this code to sign in to MediBook:",
      "",
      code,
      "",
      `It expires in ${expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    ].join("\n"),
  };
}
