import { OAuth2Client } from "google-auth-library";
import type { GoogleIdentity } from "./authStore.js";

export class GoogleIdentityService {
  constructor(private readonly clientId = process.env.GOOGLE_CLIENT_ID ?? "", private readonly client: Pick<OAuth2Client, "verifyIdToken"> = new OAuth2Client()) {}
  isConfigured() { return Boolean(this.clientId); }
  publicClientId() { return this.clientId; }
  async verify(credential: string, nonce: string): Promise<GoogleIdentity> {
    if (!this.clientId || !credential || !nonce) throw new Error("Google Login indisponível.");
    const ticket = await this.client.verifyIdToken({ idToken: credential, audience: this.clientId });
    const claims = ticket.getPayload();
    if (!claims || !claims.sub || !claims.email || claims.email_verified !== true || claims.nonce !== nonce) throw new Error("Identidade Google inválida.");
    return { sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture?.startsWith("https://") ? claims.picture : undefined };
  }
}
