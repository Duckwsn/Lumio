import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Gamepad2, Link2, Plus, Monitor, Play, Users } from "lucide-react";
import { houseRolePermissions, type HouseDetails, type HouseSummary, type User } from "@lumio/shared";
import { Avatar } from "./Avatar";
import { LumioLogo } from "./LumioLogo";
import { Dialog, HouseSettingsDialog, InviteDialog } from "./SocialDialogs";

export function HomePage({ user, houses, error, onRetry, onOpenHouse, onCreate, onInvite, onAccount, onLogout, apiUrl = "", token = "", connected = true }: {
  user: User; houses: HouseSummary[]; error?: string; onRetry: () => void;
  onOpenHouse: (house: HouseSummary) => void; onCreate: (name: string) => Promise<void>;
  onInvite: (value: string) => boolean; onAccount: () => void; onLogout: () => void; apiUrl?: string; token?: string; connected?: boolean;
}) {
  const [form, setForm] = useState<"create" | "invite" | null>(null);
  const [value, setValue] = useState(""); const [formError, setFormError] = useState(""); const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<{ id: string; kind: "house" | "invite" } | null>(null);
  const [details, setDetails] = useState<HouseDetails | null>(null);
  const [panelError, setPanelError] = useState(""); const [attempt, setAttempt] = useState(0);
  const selected = houses.find((h) => h.id === panel?.id);
  useEffect(() => { document.title = "Suas Casas — Lumio"; }, []);
  useEffect(() => {
    if (!panel || !selected) { setDetails(null); return; }
    const controller = new AbortController(); setPanelError("");
    void fetch(`${apiUrl}/api/houses/${encodeURIComponent(panel.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); const data = await response.json() as { house: HouseDetails }; if (!controller.signal.aborted) setDetails(data.house); })
      .catch(() => { if (!controller.signal.aborted) setPanelError("Não foi possível carregar a Casa."); });
    return () => controller.abort();
  }, [panel?.id, selected, apiUrl, token, attempt]);
  const openPanel = (house: HouseSummary, kind: "house" | "invite") => { setDetails(null); setPanelError(""); setPanel({ id: house.id, kind }); };
  const openForm = (next: "create" | "invite") => { setValue(""); setFormError(""); setForm(next); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (form === "invite") { if (!onInvite(value)) setFormError("Confira o link ou código do convite."); return; }
    setBusy(true); setFormError("");
    try { await onCreate(value); } catch (error) { setFormError(error instanceof Error ? error.message : "Não foi possível criar a Casa. Confira sua conexão."); }
    finally { setBusy(false); }
  };
  return <main className="home-page houses-v2">
    <header className="entry-header"><span className="entry-wordmark"><LumioLogo /><strong>Lumio</strong></span><div className="home-account"><Avatar name={user.displayName} src={user.avatar} color={user.color} /><div><strong title={user.displayName}>{user.displayName}</strong><button onClick={onAccount}>Conta</button><button onClick={onLogout}>Sair</button></div></div></header>
    <section className="home-content"><header><p>Olá, {user.displayName.split(" ")[0]}.</p><h1>{houses.length ? "Suas Casas" : "Você ainda não faz parte de uma Casa."}</h1></header>
      {!connected ? <p className="home-presence-pending" role="status">Atualizando presença… Exibindo o último estado recebido.</p> : null}
      {error ? <div className="home-error" role="alert"><p>{error}</p><button onClick={onRetry}>Tentar novamente</button></div> : null}
      {houses.length ? <div className={`house-grid ${houses.length === 1 ? "one-house" : ""}`}>{houses.map((house) => {
        const active = house.partyCount > 0, activity = house.partyActivity;
        const Icon = activity?.type === "game" ? Gamepad2 : activity?.type === "screen" ? Monitor : Play;
        return <article className={`house-card-v2 ${active ? "occupied" : ""}`} key={house.id} aria-label={house.name}>
          <header><Avatar name={house.name} src={house.avatar} color="#78a98c" className="house-card-avatar" /><div><h2 title={house.name}>{house.name}</h2><p>{house.onlineCount} {house.onlineCount === 1 ? "membro online" : "membros online"}</p></div></header>
          <div className="house-member-preview" aria-label="Pessoas da Casa">{house.memberPreview?.map((member) => <span key={member.id} title={`${member.displayName} · ${member.inParty ? "Na Party" : member.presence === "OFFLINE" ? "Offline" : "Online"}`}><Avatar name={member.displayName} src={member.avatar} color={member.color} /><small>{member.displayName.split(" ")[0]}</small><span className="sr-only">{member.inParty ? "Na Party" : member.presence === "OFFLINE" ? "Offline" : "Online"}</span></span>)}{house.memberCount > 3 ? <span className="house-more-members" aria-label={`Mais ${house.memberCount - 3} membros`}>+{house.memberCount - 3}</span> : null}</div>
          <div className="house-party-summary"><strong>{active ? `${house.partyCount} ${house.partyCount === 1 ? "pessoa" : "pessoas"} na Party` : "Ninguém na Party agora"}</strong>{active ? <p title={activity?.label}><Icon aria-hidden="true" />{activity?.label ?? "Na Party"}</p> : <p>Abra a Party para reunir a Casa.</p>}</div>
          <button className={active ? "entry-primary" : "quiet-button house-open-idle"} onClick={() => onOpenHouse(house)} aria-label={`${active ? "Entrar na Party" : "Abrir Party"} · ${house.name}`}>{active ? "Entrar na Party" : "Abrir Party"}<ArrowRight /></button>
          <footer><button onClick={() => openPanel(house, "house")}><Users />Casa e membros</button>{houseRolePermissions[house.role].includes("INVITE_CREATE") ? <button onClick={() => openPanel(house, "invite")}><Link2 />Convidar pessoas</button> : null}</footer>
        </article>;
      })}</div> : !error ? <div className="home-empty"><LumioLogo className="home-empty-mark" /><p>Crie uma Casa ou entre com o convite dos seus amigos.</p><button className="entry-primary" onClick={() => openForm("create")}><Plus /> Criar Casa</button><button className="quiet-button" onClick={() => openForm("invite")}><Link2 /> Entrar com convite</button></div> : null}
      {houses.length ? <div className="home-next-actions"><button className="create-house-inline" onClick={() => openForm("create")}><Plus />Criar outra Casa</button><button className="create-house-inline" onClick={() => openForm("invite")}><Link2 />Entrar com convite</button></div> : null}
    </section>
    {form ? <Dialog title={form === "create" ? "Criar Casa" : "Entrar com convite"} subtitle={form === "create" ? "Escolha um nome para sua Casa." : "Cole o link ou código que você recebeu."} onClose={() => { if (!busy) setForm(null); }}><form className="social-form" onSubmit={(event) => void submit(event)}><label htmlFor="home-form-value">{form === "create" ? "Nome da Casa" : "Link ou código"}<input id="home-form-value" autoFocus value={value} onChange={(event) => { setValue(event.target.value); setFormError(""); }} maxLength={form === "create" ? 48 : 2048} autoComplete="off" placeholder={form === "create" ? "Noite dos amigos" : "ABCDE-FGHJK ou link do convite"} /></label>{formError ? <p role="alert" className="form-error">{formError}</p> : null}<button className="entry-primary" disabled={busy || value.trim().length < (form === "create" ? 2 : 1)}>{busy ? "Criando…" : form === "create" ? "Criar e entrar" : "Abrir convite"}</button></form></Dialog> : null}
    {panel && selected ? details?.id === selected.id && !panelError ? panel.kind === "invite" ? <InviteDialog apiUrl={apiUrl} token={token} house={details} onClose={() => setPanel(null)} onChanged={setDetails} /> : <HouseSettingsDialog apiUrl={apiUrl} token={token} house={details} currentUserId={user.id} onClose={() => setPanel(null)} onChanged={(next) => { setDetails(next); onRetry(); }} onLeft={() => { setPanel(null); onRetry(); }} /> : <Dialog title="Carregar Casa" subtitle={selected.name} onClose={() => setPanel(null)}><p role="status">{panelError || "Carregando Casa…"}</p>{panelError ? <button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</button> : null}</Dialog> : null}
  </main>;
}
