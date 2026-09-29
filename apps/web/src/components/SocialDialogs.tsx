import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Link2, Shield, Trash2, UserMinus, X } from "lucide-react";
import { houseRolePermissions, type HouseDetails, type HouseInvite, type HouseRole, type Permission, type RoomSettings, type User } from "@lumio/shared";
import { Avatar } from "./Avatar";

const jsonHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function readHouse(apiUrl: string, token: string, houseId: string) { const response = await fetch(`${apiUrl}/api/houses/${houseId}`, { headers: { Authorization: `Bearer ${token}` } }); return response.ok ? (await response.json() as { house: HouseDetails }).house : null; }

export function Dialog({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const container = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.querySelector<HTMLElement>("button, input, select")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (!container.current || document.querySelector(".house-delete-confirm")) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = [...container.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter((el) => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !container.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !container.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section ref={container} className={`dialog social-dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="social-dialog-title"><header><div><h2 id="social-dialog-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button></header>{children}</section></div>;
}

export function ProfileDialog({ apiUrl, token, user, onClose, onSaved }: { apiUrl: string; token: string; user: User; onClose: () => void; onSaved: (user: User) => void }) {
  const [draft, setDraft] = useState({ displayName: user.displayName, avatar: user.avatar ?? "", status: user.status ?? "" }); const [message, setMessage] = useState("");
  const save = async (event: FormEvent) => { event.preventDefault(); const response = await fetch(`${apiUrl}/api/profile`, { method: "PATCH", headers: jsonHeaders(token), body: JSON.stringify(draft) }); const data = await response.json(); if (!response.ok) return setMessage(data.message); onSaved(data.user); onClose(); };
  return <Dialog title="Seu perfil" subtitle="Como você aparece para as pessoas da Casa." onClose={onClose}><form className="social-form" onSubmit={save}><label>Nome<input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} maxLength={32} /></label><label>Avatar por URL<input value={draft.avatar} onChange={(e) => setDraft({ ...draft, avatar: e.target.value })} placeholder="https://…" /></label><label>Status<input value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} maxLength={80} placeholder="Assistindo com a família" /></label>{message ? <p className="form-error">{message}</p> : null}<button className="primary-action">Salvar perfil</button></form></Dialog>;
}

export function InviteDialog({ apiUrl, token, house, onClose, onChanged }: { apiUrl: string; token: string; house: HouseDetails; onClose: () => void; onChanged: (house: HouseDetails) => void }) {
  const [expiresInHours, setExpiry] = useState<1 | 24 | 168>(24);
  const [maxUses, setMaxUses] = useState(1);
  const [invite, setInvite] = useState<HouseInvite | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);
  const allowed = house.permissions.includes("INVITE_CREATE");
  const create = async () => {
    if (creating.current) return;
    creating.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/houses/${house.id}/invites`, { method: "POST", headers: jsonHeaders(token), body: JSON.stringify({ expiresInHours, maxUses, role: "MEMBER" }) });
      if (!response.ok) { setError((await response.json()).message ?? "Não foi possível criar o convite."); return; }
      const data = await response.json() as { invite: HouseInvite };
      setInvite(data.invite);
      const next = await readHouse(apiUrl, token, house.id); if (next) onChanged(next);
    } catch { setError("Sem conexão. Tente novamente."); }
    finally { creating.current = false; setBusy(false); }
  };
  const link = invite ? `${window.location.origin}/invite/${encodeURIComponent(invite.token)}` : "";
  const copy = async (kind: "link" | "code") => {
    try { await navigator.clipboard.writeText(kind === "code" ? invite?.code ?? "" : link); setCopied(kind); setError(""); }
    catch { setError("Não foi possível copiar. Selecione o código ou link manualmente."); }
  };
  const share = async () => {
    if (!navigator.share) return copy("link");
    try { await navigator.share({ title: "Convite para o Lumio", text: "Entre na minha Casa no Lumio", url: link }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) await copy("link"); }
  };
  return <Dialog title={`Convidar para ${house.name}`} subtitle="Link e código são o mesmo convite: validade, usos e revogação compartilhados." onClose={onClose}>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {!allowed ? <p className="empty-note">Somente host e admins podem criar convites.</p> : invite ? <div className="invite-result">
      <strong>Convite pronto</strong>
      {invite.code ? <><label htmlFor="invite-code">Código do convite</label><input id="invite-code" className="invite-code" readOnly value={invite.code} onFocus={(event) => event.target.select()} /><small>Para falar ou digitar na Home em Entrar com convite.</small><button className="primary-action" onClick={() => void copy("code")}><Copy />Copiar código</button></> : <small>Código indisponível neste servidor. Use o link.</small>}
      <label htmlFor="invite-link">Link do convite</label><input id="invite-link" readOnly value={link} onFocus={(event) => event.target.select()} /><small>Para enviar por mensagem.</small>
      <div className="invite-share-actions"><button className="primary-action" onClick={() => void copy("link")}><Link2 />Copiar link</button>{typeof navigator.share === "function" ? <button className="quiet-button" onClick={() => void share()}>Compartilhar</button> : null}</div>
      {copied ? <span role="status">{copied === "code" ? "Código copiado." : "Link copiado."}</span> : null}
      <small>Expira em {expiresInHours === 1 ? "1 hora" : expiresInHours === 24 ? "24 horas" : "7 dias"} · {maxUses} {maxUses === 1 ? "uso" : "usos"}</small>
    </div> : <div className="social-form"><label>Validade<select value={expiresInHours} onChange={(event) => setExpiry(Number(event.target.value) as 1 | 24 | 168)}><option value={1}>1 hora</option><option value={24}>24 horas</option><option value={168}>7 dias</option></select></label><label>Limite de usos<input type="number" min={1} max={100} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label><button className="primary-action" disabled={busy} onClick={() => void create()}>{busy ? "Criando…" : "Criar convite seguro"}</button></div>}
  </Dialog>;
}

const permissionLabels: Record<Permission, string> = { HOUSE_MANAGE: "Gerenciar a Casa", MEMBER_MANAGE: "Gerenciar membros", INVITE_CREATE: "Criar convites", INVITE_REVOKE: "Revogar convites", MEDIA_ADD: "Adicionar mídia", MEDIA_CONTROL: "Controlar reprodução", QUEUE_MANAGE: "Organizar fila", LIBRARY_MANAGE: "Editar biblioteca", PLAYLIST_CREATE: "Criar playlists", PLAYLIST_EDIT: "Editar playlists", PLAYLIST_DELETE: "Excluir playlists", CHAT_SEND: "Conversar", CHAT_MODERATE: "Moderar chat", CALL_JOIN: "Voz da Party", SCREEN_SHARE: "Compartilhar tela" };
const matrices = houseRolePermissions;

function MembershipActions({ apiUrl, token, house, onChanged, onLeft }: { apiUrl: string; token: string; house: HouseDetails; onChanged: (house: HouseDetails) => void; onLeft: () => void }) {
  const [targetId, setTargetId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typedName, setTypedName] = useState("");
  const deleting = useRef(false);
  const closeDelete = () => { if (!deleting.current) { setConfirmDelete(false); setTypedName(""); setError(""); } };
  const deleteHouse = async (event: FormEvent) => {
    event.preventDefault();
    if (deleting.current || typedName !== house.name || house.role !== "HOST") return;
    deleting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/houses/${house.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json().catch(() => ({})) as { message?: string }; setError(data.message ?? "Não foi possível excluir a Casa."); return; }
      onLeft();
    } catch { setError("Sem conexão. A Casa pode não ter sido excluída; atualize antes de tentar novamente."); }
    finally { deleting.current = false; setBusy(false); }
  };
  const act = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(house.role === "HOST" ? `${apiUrl}/api/houses/${house.id}/transfer-host` : `${apiUrl}/api/houses/${house.id}/leave`, { method: "POST", headers: jsonHeaders(token), body: house.role === "HOST" ? JSON.stringify({ targetUserId: targetId }) : undefined });
      if (!response.ok) { setError((await response.json()).message ?? "Não foi possível concluir a ação."); return; }
      if (house.role === "HOST") { const next = await readHouse(apiUrl, token, house.id); if (next) onChanged(next); setConfirm(false); setTargetId(""); }
      else onLeft();
    } catch { setError("Sem conexão. Tente novamente."); }
    finally { setBusy(false); }
  };
  if (confirmDelete) return createPortal(<div className="dialog-backdrop house-delete-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDelete(); }}><section className="dialog social-dialog house-delete-confirm" role="dialog" aria-modal="true" aria-label="Confirmação de exclusão da Casa" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeDelete(); } }}>
    <h3>Excluir Casa permanentemente?</h3>
    <p>Isso apaga a Party, mensagens, fila, biblioteca, playlists e convites desta Casa para todos os membros. Esta ação não pode ser desfeita. As contas dos membros e seus arquivos no Google Drive não serão excluídos.</p>
    <form onSubmit={(event) => void deleteHouse(event)}><label>Digite <strong>{house.name}</strong> para confirmar<input autoFocus autoComplete="off" value={typedName} onChange={(event) => setTypedName(event.target.value)} disabled={busy} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="house-delete-actions"><button type="button" disabled={busy} onClick={closeDelete}>Cancelar</button><button type="submit" className="house-delete-button" disabled={busy || typedName !== house.name}>{busy ? "Excluindo…" : "Excluir Casa permanentemente"}</button></div></form>
  </section></div>, document.body);
  return <div className="membership-actions">
    {house.role === "HOST" ? <><strong>Transferir a Casa</strong><p>Você passará a ser administrador. Só o novo dono poderá transferir a Casa novamente.</p><label>Próximo dono<select value={targetId} onChange={(event) => { setTargetId(event.target.value); setConfirm(false); }}><option value="">Escolha um membro</option>{house.members.filter((member) => member.role !== "HOST").map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName}</option>)}</select></label><button disabled={!targetId || busy} onClick={() => setConfirm(true)}>Transferir Casa</button>{confirm ? <div className="inline-confirm" role="group" aria-label="Confirmar transferência"><span>Confirmar transferência para {house.members.find((member) => member.user.id === targetId)?.user.displayName}?</span><button disabled={busy} onClick={() => void act()}>{busy ? "Transferindo…" : "Confirmar"}</button><button onClick={() => setConfirm(false)}>Cancelar</button></div> : null}</> : <><strong>Sair da Casa</strong><p>Você perderá acesso à Party, à biblioteca e aos convites desta Casa.</p>{confirm ? <div className="inline-confirm" role="group" aria-label="Confirmar saída"><button disabled={busy} onClick={() => void act()}>{busy ? "Saindo…" : "Confirmar saída"}</button><button onClick={() => setConfirm(false)}>Cancelar</button></div> : <button onClick={() => setConfirm(true)}>Sair da Casa</button>}</>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {house.role === "HOST" ? <div className="house-danger-zone"><strong>Zona de perigo</strong><p>Exclui esta Casa e todo o conteúdo compartilhado dela para todos os membros.</p><button className="house-delete-button" onClick={() => { setError(""); setConfirmDelete(true); }}>Excluir Casa…</button></div> : null}
  </div>;
}

export function HouseSettingsDialog({ apiUrl, token, house, currentUserId, roomSettings, onRoomSettings, onClose, onChanged, onLeft }: { apiUrl: string; token: string; house: HouseDetails; currentUserId: string; roomSettings?: RoomSettings; onRoomSettings?: (settings: RoomSettings) => void; onClose: () => void; onChanged: (house: HouseDetails) => void; onLeft: () => void }) {
  const [tab, setTab] = useState<"general" | "members" | "permissions" | "invites">("general"); const [name, setName] = useState(house.name); const [avatar, setAvatar] = useState(house.avatar ?? ""); const [confirmId, setConfirmId] = useState(""); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const mutate = async (suffix: string, method: string, body?: object) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/houses/${house.id}${suffix}`, { method, headers: jsonHeaders(token), body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error((await response.json()).message ?? "Não foi possível atualizar a Casa.");
      const next = await readHouse(apiUrl, token, house.id);
      if (!next) throw new Error("A ação foi enviada, mas não foi possível atualizar a Casa. Confira antes de tentar novamente.");
      onChanged(next); return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Sem conexão. Confira o estado antes de tentar novamente."); return false; }
    finally { pending.current = false; setBusy(false); }
  };
  const saveGeneral = () => mutate("", "PATCH", { name, avatar });
  const changeRole = (userId: string, role: HouseRole) => mutate(`/members/${userId}`, "PATCH", { role });
  const remove = async (userId: string) => { if (await mutate(`/members/${userId}`, "DELETE")) setConfirmId(""); };
  const revoke = (id: string) => mutate(`/invites/${id}`, "DELETE");
  return <Dialog title={`Casa e membros · ${house.name}`} subtitle="Administre a identidade, as pessoas e o acesso à Casa." onClose={onClose} wide><p className="house-details-presence">{house.memberCount} membros · {house.onlineCount} online · {house.partyCount} na Party</p><div className="settings-tabs">{([['general','Geral'],['members','Membros'],['permissions','Permissões'],['invites','Convites']] as const).filter(([id]) => id !== "invites" || house.permissions.includes("INVITE_REVOKE")).map(([id,label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}{tab === "general" ? <div className="social-form"><label>Nome da Casa<input maxLength={48} disabled={busy || !house.permissions.includes("HOUSE_MANAGE")} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Avatar por URL<input disabled={busy || !house.permissions.includes("HOUSE_MANAGE")} value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" /></label>{roomSettings && onRoomSettings ? <label className="settings-check playback-setting"><input disabled={!house.permissions.includes("HOUSE_MANAGE")} type="checkbox" checked={roomSettings.autoplayNext} onChange={(event) => onRoomSettings({ ...roomSettings, autoplayNext: event.target.checked })} /><span><strong>Reproduzir próximo item automaticamente</strong><small>Quando uma mídia terminar, o próximo item da fila começa automaticamente.</small></span></label> : null}{house.permissions.includes("HOUSE_MANAGE") ? <button className="primary-action" disabled={busy || name.trim().length < 2} onClick={() => void saveGeneral()}>Salvar identidade</button> : null}<MembershipActions apiUrl={apiUrl} token={token} house={house} onChanged={onChanged} onLeft={onLeft} /></div> : null}{tab === "members" ? <ul className="settings-members">{house.members.map((member) => <li key={member.user.id}><Avatar name={member.user.displayName} src={member.user.avatar} color={member.user.color} /><div><strong>{member.user.displayName}{member.user.id === currentUserId ? " (você)" : ""}</strong><small>{member.presence === "OFFLINE" ? "Offline" : member.inParty ? "Na Party" : "Online"}</small></div>{member.role === "HOST" ? <span className="role-badge">Dono</span> : house.permissions.includes("MEMBER_MANAGE") && member.user.id !== currentUserId ? <><select disabled={busy} aria-label={`Papel de ${member.user.displayName}`} value={member.role} onChange={(e) => void changeRole(member.user.id, e.target.value as HouseRole)}><option value="ADMIN">Administrador</option><option value="MEMBER">Membro</option></select>{confirmId === member.user.id ? <span className="inline-confirm"><button disabled={busy} onClick={() => void remove(member.user.id)}>Remover</button><button onClick={() => setConfirmId("")}>Cancelar</button></span> : <button className="icon-button danger" disabled={busy} onClick={() => setConfirmId(member.user.id)} aria-label={`Remover ${member.user.displayName}`}><UserMinus /></button>}</> : <span>{member.role === "ADMIN" ? "Administrador" : "Membro"}</span>}</li>)}</ul> : null}{tab === "permissions" ? <div className="permission-table"><div /><strong>Dono</strong><strong>Administrador</strong><strong>Membro</strong>{(Object.keys(permissionLabels) as Permission[]).map((permission) => <Fragment key={permission}><span>{permissionLabels[permission]}</span>{(["HOST", "ADMIN", "MEMBER"] as HouseRole[]).map((role) => <i key={`${permission}-${role}`}>{matrices[role].includes(permission) ? <Check /> : "—"}</i>)}</Fragment>)}</div> : null}{tab === "invites" ? <ul className="invite-list">{house.invites.length ? house.invites.map((invite) => <li key={invite.id}><Shield /><div><strong>{invite.uses}/{invite.maxUses} usos</strong><small>Expira {new Date(invite.expiresAt).toLocaleString("pt-BR")}</small></div>{house.permissions.includes("INVITE_REVOKE") ? <button className="icon-button danger" onClick={() => void revoke(invite.id)} aria-label="Revogar convite"><Trash2 /></button> : null}</li>) : <li className="empty-note">Nenhum convite ativo.</li>}</ul> : null}</Dialog>;
}
