import { config } from "../config";

export type OutboxMail = { to: string; subject: string; text: string };

/** Mémoire de développement : les tests lisent le lien de vérification ici. */
const outbox: OutboxMail[] = [];

export function readOutbox(): readonly OutboxMail[] {
  return outbox;
}
export function clearOutbox(): void {
  outbox.length = 0;
}

export async function sendMail(mail: OutboxMail): Promise<void> {
  // M1 : transport dev (console + mémoire). SMTP (nodemailer) arrive avec la prod.
  outbox.push(mail);
  if (outbox.length > 100) outbox.shift();
  console.log(`[mailer] → ${mail.to} — ${mail.subject}\n${mail.text}\n`);
}

export function sendVerificationEmail(_userId: string, email: string, token: string): Promise<void> {
  const url = `${config.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: "TiPiment — vérifie ton email",
    text: `Bienvenue ! Ce lien est valable 24 h :\n${url}`,
  });
}

export function sendResetEmail(_userId: string, email: string, token: string): Promise<void> {
  const url = `${config.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: "TiPiment — réinitialisation du mot de passe",
    text: `Lien valable 30 min (si tu ne l'as pas demandé, ignore ce mail) :\n${url}`,
  });
}
