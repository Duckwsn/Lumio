import fs from "node:fs";
import path from "node:path";

type EmailPurpose = "verify" | "reset";

/** Development outbox is a local, git-ignored test transport, never a production provider. */
export class EmailService {
  readonly provider = process.env.EMAIL_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "dev-file");
  private readonly publicUrl = process.env.APP_PUBLIC_URL ?? "http://localhost:5173";
  constructor(private readonly outbox = path.resolve(process.cwd(), "../../.data/dev-mailbox.jsonl")) {
    if (!new URL(this.publicUrl).origin || !["resend", "dev-file"].includes(this.provider)) throw new Error("Configure EMAIL_PROVIDER e APP_PUBLIC_URL.");
    if (process.env.NODE_ENV === "production" && (this.provider !== "resend" || !this.publicUrl.startsWith("https://"))) throw new Error("Produção exige e-mail real e APP_PUBLIC_URL HTTPS.");
    if (this.provider === "resend" && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) throw new Error("Configure RESEND_API_KEY e EMAIL_FROM no servidor.");
  }
  async send(to: string, purpose: EmailPurpose, token: string) {
    const relative = purpose === "verify" ? "/verify-email" : "/reset-password";
    const url = new URL(relative, this.publicUrl);
    url.hash = new URLSearchParams({ token }).toString();
    const subject = purpose === "verify" ? "Confirme seu e-mail no Lumio" : "Redefina sua senha no Lumio";
    const text = `${purpose === "verify" ? "Confirme seu e-mail para concluir o cadastro" : "Redefina sua senha"}: ${url.toString()}\n\nSe não solicitou, ignore esta mensagem.`;
    if (this.provider === "dev-file") {
      fs.mkdirSync(path.dirname(this.outbox), { recursive: true });
      fs.appendFileSync(this.outbox, JSON.stringify({ to, subject, text, createdAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
      return;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("O provedor de e-mail recusou a entrega.");
  }
}
