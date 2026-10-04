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
