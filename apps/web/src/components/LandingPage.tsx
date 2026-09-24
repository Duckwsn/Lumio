import { useEffect } from "react";
import { ArrowRight, Headphones, Heart, Library, MessageCircle, Mic, MonitorUp, Pause, Play, Plus, Volume2 } from "lucide-react";
import { LumioLogo } from "./LumioLogo";
import { PwaInstallShowcase } from "./PwaExperience";
import "../landing.css";

type Navigate = (path: string) => void;

function Brand() {
  return <span className="landing-brand"><LumioLogo /><strong>Lumio</strong></span>;
}

function PartyDemo() {
  return <section className="landing-party" aria-label="Prévia ilustrativa de uma Party Lumio">
    <p className="sr-only">Uma Party com player compartilhado, Duda, Maya e João presentes, call e fila colaborativa.</p>
    <div className="landing-party-frame" aria-hidden="true">
      <div className="landing-party-top"><div><LumioLogo /><span>Casa da turma</span><span className="landing-party-chevron">/ Party</span></div><span className="landing-live"><i /> 3 na Party</span></div>
      <div className="landing-party-body">
        <div className="landing-demo-stage">
          <div className="landing-demo-art"><div className="landing-demo-horizon" /><div className="landing-demo-orb" /><span>HOJE, 21:08</span><strong>É melhor<br />quando é junto.</strong></div>
          <div className="landing-demo-player"><span className="landing-demo-play"><Pause size={13} fill="currentColor" /></span><div><strong>Noite de sexta</strong><small>Reproduzindo para todo mundo</small></div><Volume2 size={15} /></div>
          <div className="landing-demo-progress"><span /></div>
        </div>
        <aside className="landing-demo-side"><div className="landing-demo-side-title"><strong>Pessoas</strong><span>03</span></div>
          <div className="landing-person"><span className="landing-person-avatar peach speaking">D</span><div><strong>Duda</strong><small>falando agora</small></div><i className="landing-speaking-bars"><b /><b /><b /></i></div>
          <div className="landing-person"><span className="landing-person-avatar lilac">M</span><div><strong>Maya</strong><small>na call</small></div></div>
          <div className="landing-person"><span className="landing-person-avatar blue">J</span><div><strong>João</strong><small>assistindo</small></div></div>
          <div className="landing-demo-next"><span>VEM AÍ</span><strong>Mais uma pra fila</strong><small>Adicionada por Maya</small></div>
        </aside>
      </div>
      <div className="landing-demo-dock"><span><Mic size={16} /></span><span><MessageCircle size={16} /></span><span><Library size={16} /></span><span className="landing-dock-add"><Plus size={15} /> Adicionar mídia</span></div>
    </div>
    <div className="landing-demo-reaction" aria-hidden="true"><Heart size={17} fill="currentColor" /></div>
    <span className="landing-demo-caption">Uma prévia da Party. O encontro de verdade é com a sua turma.</span>
  </section>;
}

function QueuePreview() {
  return <div className="landing-queue-preview" aria-hidden="true"><header><span>FILA DA PARTY</span><small>todo mundo escolhe</small></header><div className="landing-queue-current"><span className="landing-queue-art current"><Play size={18} fill="currentColor" /></span><div><small>TOCANDO AGORA</small><strong>Noite de sexta</strong><span>adicionado por Duda</span></div><i className="landing-queue-wave"><b /><b /><b /><b /></i></div><div className="landing-queue-line"><span className="landing-queue-art second">02</span><div><strong>A próxima é sua</strong><small>adicionada por Maya</small></div><span>03:42</span></div><div className="landing-queue-line"><span className="landing-queue-art third">03</span><div><strong>Mais uma lembrança</strong><small>adicionada por João</small></div><span>04:16</span></div></div>;
}

function HousePreview() {
  return <div className="landing-house-preview" aria-hidden="true"><div className="landing-house-preview-top"><span className="landing-house-emblem"><LumioLogo /></span><div><small>SUA CASA</small><strong>Casa da turma</strong><span>Duda, Maya, João e você</span></div></div><div className="landing-house-list"><div><Library size={17} /><span>Biblioteca</span><small>o que vocês guardaram</small></div><div><Headphones size={17} /><span>Playlists</span><small>feitas juntos</small></div><div><Play size={17} /><span>Histórico</span><small>o que já rolou</small></div></div></div>;
}

export function LandingPage({ navigate }: { navigate: Navigate }) {
  useEffect(() => { document.title = "Lumio — fiquem juntos, mesmo de longe"; }, []);
  return <div className="landing-v3">
    <a className="skip-link" href="#landing-content">Ir para o conteúdo principal</a>
    <header className="landing-header"><div className="landing-container landing-header-inner"><Brand /><nav aria-label="Acesso"><button type="button" className="landing-header-login" onClick={() => navigate("/login")}>Entrar</button><button type="button" className="landing-button landing-button-small" onClick={() => navigate("/register")}>Criar conta <ArrowRight size={15} /></button></nav></div></header>
    <main id="landing-content">
      <section className="landing-hero-v3 landing-container"><div className="landing-hero-copy"><span className="landing-overline"><i /> UM LUGAR PARA A SUA TURMA</span><h1>Fiquem juntos,<br /><em>mesmo de longe.</em></h1><p>Assista, ouça e converse com todo mundo no mesmo lugar. Uma Party só de vocês.</p><div className="landing-hero-actions"><button type="button" className="landing-button" onClick={() => navigate("/register")}>Criar minha Casa <ArrowRight size={18} /></button><button type="button" className="landing-text-button" onClick={() => navigate("/login")}>Já tenho conta <ArrowRight size={16} /></button></div><div className="landing-hero-note"><span className="landing-note-rule" /> A noite fica melhor quando ninguém fica de fora.</div></div><PartyDemo /></section>
      <section className="landing-promise" aria-label="O que acontece no Lumio"><div className="landing-container"><p>A mesma tela. A mesma música. <span>A mesma conversa.</span></p><div><span>ASSISTIR</span><i /> <span>OUVIR</span><i /> <span>CONVERSAR</span></div></div></section>
      <section className="landing-story landing-container" aria-labelledby="landing-story-title"><div className="landing-section-heading"><span className="landing-index">01 / A PARTY</span><h2 id="landing-story-title">Tudo acontece <em>junto.</em></h2><p>Escolha o que vai tocar. Chame a turma. O resto acontece no mesmo ritmo.</p></div><div className="landing-story-grid"><article className="landing-story-watch"><div className="landing-watch-visual" aria-hidden="true"><span className="landing-watch-glow" /><span className="landing-watch-play"><Play size={25} fill="currentColor" /></span><div className="landing-watch-progress"><i /></div><span className="landing-watch-label">LUMIO PLAYER <span>·</span> EM SINCRONIA</span></div><div><span className="landing-feature-label">ASSISTA</span><h3>O vídeo muda.<br />A Party continua.</h3><p>Dê play, pause ou avance. Todo mundo acompanha no mesmo momento.</p></div></article><article className="landing-story-queue"><QueuePreview /><div><span className="landing-feature-label">OUÇA</span><h3>A próxima música<br />é escolha de todos.</h3><p>Uma fila compartilhada, playlists da Casa e espaço para cada pessoa participar.</p></div></article><article className="landing-story-talk"><div className="landing-talk-visual" aria-hidden="true"><div className="landing-talk-people"><span className="landing-person-avatar peach speaking">D</span><span className="landing-person-avatar lilac">M</span><span className="landing-person-avatar blue">J</span></div><div className="landing-talk-bubble"><MessageCircle size={17} /><span>Essa parte é muito boa</span><Heart size={16} fill="currentColor" /></div><div className="landing-talk-call"><Mic size={16} /><span>Duda está falando</span><i className="landing-speaking-bars"><b /><b /><b /></i></div></div><div><span className="landing-feature-label">CONVERSE</span><h3>Tem sempre alguém<br />do outro lado.</h3><p>Call de voz, chat e reações continuam por perto. Se quiser, compartilhe a tela.</p></div></article></div></section>
      <section className="landing-house-section"><div className="landing-container landing-house-layout"><div className="landing-house-copy"><span className="landing-index">02 / A CASA</span><h2>Uma Casa para<br /><em>o que é de vocês.</em></h2><p>A Party acontece agora. A Casa fica: as pessoas, a biblioteca, as playlists e as noites que já passaram.</p><span className="landing-house-footnote">Privada para o seu grupo. Do jeito de vocês.</span></div><HousePreview /></div></section>
      <section className="landing-providers landing-container" aria-labelledby="landing-providers-title"><div className="landing-section-heading"><span className="landing-index">03 / O QUE TOCA</span><h2 id="landing-providers-title">Traga o que vocês gostam.</h2><p>Descubra algo novo ou abra aquele vídeo que já estava guardado.</p></div><div className="landing-provider-list"><div><span className="landing-provider-number">01</span><strong>YouTube</strong><p>Encontre vídeos e músicas para colocar na Party.</p></div><div><span className="landing-provider-number">02</span><strong>Google Drive</strong><p>Navegue pelos seus vídeos e escolha o que assistir junto.</p></div></div></section>
      <PwaInstallShowcase />
      <section className="landing-final-v3"><div className="landing-container"><span className="landing-index">A PRÓXIMA NOITE COMEÇA AQUI</span><h2>Abre a Casa.<br /><em>O resto vocês decidem.</em></h2><button type="button" className="landing-button" onClick={() => navigate("/register")}>Criar minha Casa <ArrowRight size={18} /></button></div></section>
    </main>
    <footer className="landing-footer"><div className="landing-container"><Brand /><span>Feito para ficar por perto.</span><small>© {new Date().getFullYear()} Lumio</small></div></footer>
  </div>;
}
