import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { GoogleIdentityButton } from "./GoogleIdentityButton";

type Account = { email?: string; hasPassword: boolean; google: { connected: boolean; email?: string }; drive: { configured: boolean; connected: boolean; email?: string } };
export function AccountPage({ apiUrl, token, onBack }: { apiUrl: string; token: string; onBack: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [unlinkPassword, setUnlinkPassword] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [readyToLink, setReadyToLink] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/account`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Não foi possível carregar sua conta.");
      setAccount(await response.json() as Account);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar sua conta."); }
  }, [apiUrl, token]);
  useEffect(() => { document.title = "Conta — Lumio"; void load(); }, [load]);
  const updatePassword = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice("");
    if (newPassword.length < 8 || newPassword !== confirmation) { setError("A nova senha precisa ter ao menos 8 caracteres e coincidir com a confirmação."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/api/account/password`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Não foi possível salvar a senha."); }
      setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setNotice("Senha salva."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a senha."); }
    finally { setBusy(false); }
  };
  const unlink = async () => {
    setError(""); setNotice(""); setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/api/account/google/unlink`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: unlinkPassword }) });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Não foi possível desvincular o Google."); }
      setUnlinkPassword(""); setNotice("Google removido das formas de login. A conexão Drive não foi alterada."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível desvincular o Google."); }
    finally { setBusy(false); }
  };
  return <main className="account-page"><div className="account-wrap"><button className="quiet-button" onClick={onBack}><ArrowLeft size={16} /> Voltar</button><p className="eyebrow">SUA CONTA</p><h1>Formas de entrar. Conexões à parte.</h1><p>Seu perfil e suas Casas continuam no Lumio, independentemente de como você entra.</p>{!account ? <p role="status">Carregando conta…</p> : <>
    <section className="account-section"><h2>Formas de login</h2><div className="account-row"><div><strong>E-mail e senha</strong><small>{account.email ?? "Sem e-mail"} · {account.hasPassword ? "Ativo" : "Senha não definida"}</small></div></div>
      <form className="account-password" onSubmit={(event) => void updatePassword(event)}>{account.hasPassword ? <label>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label> : null}<label>{account.hasPassword ? "Nova senha" : "Definir senha"}<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>Confirmar nova senha<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="primary-action" disabled={busy}>Salvar senha</button></form>
      <div className="account-row"><div><strong>Google</strong><small>{account.google.connected ? `Conectado · ${account.google.email}` : "Não vinculado"}</small></div></div>
      {account.google.connected ? account.hasPassword ? <div className="account-unlink"><label>Confirme sua senha para desvincular Google<input type="password" autoComplete="current-password" value={unlinkPassword} onChange={(event) => setUnlinkPassword(event.target.value)} /></label><button className="danger-action" disabled={busy || !unlinkPassword} onClick={() => void unlink()}>Desvincular Google</button></div> : <p className="account-hint">Defina uma senha antes de remover seu único método de login.</p> : <div className="account-unlink"><label>Confirme sua senha Lumio antes de vincular Google<input type="password" autoComplete="current-password" value={linkPassword} onChange={(event) => { setLinkPassword(event.target.value); setReadyToLink(false); }} /></label>{readyToLink ? <GoogleIdentityButton apiUrl={apiUrl} mode="link" token={token} linkPassword={linkPassword} onLinked={() => { setLinkPassword(""); setReadyToLink(false); setNotice("Conta Google vinculada."); void load(); }} /> : <button className="quiet-button" disabled={!linkPassword} onClick={() => setReadyToLink(true)}>Continuar para Google</button>}</div>}
    </section>
    <section className="account-section"><h2>Conexões de dados</h2><div className="account-row"><div><strong>Google Drive</strong><small>{account.drive.connected ? `Conectado · ${account.drive.email ?? "Conta Google"}` : "Não conectado"}</small></div></div><p className="account-hint">O acesso ao Drive é independente do Google Login. Conecte ou desconecte pelo Media Hub dentro da Party.</p></section>
  </>}{error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p className="account-notice" role="status">{notice}</p> : null}</div></main>;
}
