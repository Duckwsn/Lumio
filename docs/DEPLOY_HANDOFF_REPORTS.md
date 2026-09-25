# Lumio — pacote de relatórios para revisão pré-deploy

Atualizado em 25/09/2026. **Não representa deploy realizado.** Os documentos históricos preservam decisões e QA das etapas em que foram escritos; alguns parágrafos de persistência ficaram obsoletos com a Etapa 18 e receberam avisos no topo. Este índice destaca o estado atual para evitar conclusões erradas ao encaminhar a outro revisor.

## Etapa 8 — Player + Sync V2

Fonte disponível: [MEDIA_HUB.md](MEDIA_HUB.md), seção “Lumio Player e sincronização”. Não há relatório autônomo da Etapa 8 na pasta `docs`. Playback compartilhado é autoritativo no servidor, com revisão monotônica e `mediaId`/`revision`/`operationId` nos comandos; reconexão e retorno de background solicitam snapshot, sem criar novo comando. Volume/mute são locais. YouTube usa IFrame Player API e Drive um provider separado. Estado de execução/playhead é efêmero após reinício; fila e revisão são persistidas em PostgreSQL no runtime da Etapa 18. Ver `apps/server/src/store.ts` e `apps/web/src/media/MediaProvider.ts`.

## Etapa 9 — Google Drive

Fonte histórica: [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md); auditoria atual de OAuth: [GOOGLE_OAUTH_SCOPE_AUDIT.md](GOOGLE_OAUTH_SCOPE_AUDIT.md). OAuth Drive é separado do Google Login; pede `drive.readonly` e `userinfo.email`, state, PKCE S256 e refresh token. `files.list` navega raiz/pastas existentes; `files.get` lê metadados e `alt=media` transmite MP4/WebM/Ogg com Range pelo backend. O navegador não recebe tokens Google. Cada arquivo usado na Party exige grant do dono; espectadores recebem tickets efêmeros e autorização de sessão. Conexões agora persistem criptografadas em PostgreSQL, grants/tickets não. Uma escolha de vídeo privado para a Party o torna temporariamente acessível aos membros dela via backend — decisão do dono que requer clareza na política de privacidade. Ver `apps/server/src/googleDrive.ts`, `prismaDriveVault.ts` e rotas `/api/google-drive` em `index.ts`.

## Etapa 10 — Auth V2 + Google Login

Fonte histórica: [AUTH_V2.md](AUTH_V2.md). Identidade Lumio por `User.id`; Google por `sub` estável. O servidor valida ID token, audience, assinatura/expiração, nonce e `email_verified`. E-mail coincidente não vincula contas automaticamente; vínculo requer sessão e senha. Login não autoriza Drive. Sessões usam bearer em `localStorage` no navegador e hash no banco; isso continua como risco XSS a revisar, apesar da CSP. A Etapa 18 substituiu arquivo local por PostgreSQL em produção. Ver `apps/server/src/authStore.ts`, `googleIdentity.ts`, `prismaAuthRepository.ts` e `apps/web/src/components/GoogleIdentityButton.tsx`.

## Etapa 12 — Call V4 + Screen Share V2

Fonte: [CALL_V4.md](CALL_V4.md). WebRTC P2P mesh; Socket.IO carrega somente signaling, não áudio/vídeo. Um socket ativo por usuário/Party, sinais antigos são rejeitados após reconexão. Perfect negotiation e tentativas limitadas de ICE restart; compartilhamento único por Party, sem áudio de tela. STUN sozinho não garante conectividade; TURN não foi provisionado e continua necessário em redes restritivas. Custo de upload por cliente cresce aproximadamente com `N−1`; SFU não existe nesta versão. Ver `apps/server/src/callRegistry.ts` e `apps/web/src/App.tsx`.

## Etapa 13 — House + Social/Presence V2

Fonte histórica: [SOCIAL_ARCHITECTURE.md](SOCIAL_ARCHITECTURE.md). Casa delimita membership/roles (`HOST`, `ADMIN`, `MEMBER`), convites e autorização. Há uma Party principal por Casa. Convites usam token aleatório e hash persistido; host não pode sair sem transferir posse. Presença e call permanecem efêmeras e voltam offline no boot; Casas, membros, papéis, convites e atividade usam PostgreSQL em Etapa 18. Uma única instância continua obrigatória. Ver `apps/server/src/socialStore.ts`, `authorization.ts`, `prismaSocialRepository.ts`.

## Etapa 14 — Media Experience V3

Fonte histórica: [MEDIA_HUB.md](MEDIA_HUB.md). Biblioteca, favoritos, playlists, histórico e fila são conceitos distintos. Fila tem ocorrências próprias e revisão otimista; repetir mídia na fila é permitido. Histórico registra playback real, não simples inclusão ou seek. Itens Drive dependem de grants ativos. Em Etapa 18 esses dados passam a PostgreSQL; a gravação ainda reescreve um snapshot da Casa por mutação, adequado apenas para escala inicial pequena. Ver `apps/server/src/store.ts`, `prismaMediaRepository.ts`, `apps/web/src/components/MediaHub.tsx`.

## Etapas 15, 15.1, 15.2 — Mobile, responsividade, marca e PWA

Não há relatório autônomo dessas etapas em `docs`. O estado inspecionável está em `apps/web/src/App.tsx`, estilos, `apps/web/src/components/MediaStage.tsx`, `apps/web/src/components/PwaExperience.tsx`, `apps/web/pwa/sw.js` e assets em `apps/web/public`. O PWA usa manifest, ícones e service worker versionado; cacheia shell público, não API autenticada/Drive/OAuth/Range. Fullscreen móvel foi desenhado para paisagem. Instalação e viewport devem ser retestadas em aparelho real e domínio HTTPS depois do deploy; este pacote não afirma QA remoto dessas etapas.

## Etapa 16 — Security + Privacy Hardening

Fonte histórica: [AUTH_V2.md](AUTH_V2.md), seção “Verificação e recuperação”, mais [DEPLOYMENT_18.md](DEPLOYMENT_18.md). Cadastro e-mail/senha é não verificado até token de uso único; reset revoga sessões. Senhas são scrypt com salt; tokens de sessão/verificação/reset em hash. Rotas/sockets checam sessão, membership e papéis; CORS é allowlist de origens. Nonce Google e ticket Drive usam cookie HttpOnly (`SameSite=None; Secure` em produção, `Strict` no local). Há rate limiting por processo, headers/CSP e validação de input. **Limites:** bearer ainda em `localStorage`, rate limit não distribuído, cookies de terceiros podem ser bloqueados entre Vercel/Render, não há avaliação de segurança pública nem política de privacidade publicada. O modo de preview `AUTH_SIGNUP_MODE=google-only` bloqueia novos cadastros por e-mail antes da criação; não amplia privilégios.

## Etapas 16.1 e 16.2 — UI Cleanup e Landing V3

Não há relatório autônomo dessas etapas em `docs`. A implementação atual está em `apps/web/src/components/LandingPage.tsx`, `AccountPage.tsx` e `apps/web/src/App.tsx`. A landing tem CTAs de entrada/criação, demonstração visual de Party, seções de Casa/mídia/PWA e responsividade; o menu de conta dá acesso ao perfil/logout. No preview Google-only, CTAs apontam para `/login` e a tela informa que cadastros por e-mail estão pausados. Um QA visual real no domínio hospedado ainda é necessário.

## Etapa 17 — Performance + Resilience + Observability

Documento existente, não duplicado: [PERFORMANCE_RESILIENCE_17.md](PERFORMANCE_RESILIENCE_17.md). Inclui linha de base local, falhas, correções e limites. Não interpretar medidas loopback como métricas de produção.

## Etapa 18 — Infrastructure + Production e primeiro preview

**Documento completo e atual**: [ETAPA_18_REPORT.md](ETAPA_18_REPORT.md). Runbook operacional: [DEPLOYMENT_18.md](DEPLOYMENT_18.md); variáveis: [ENV_FIRST_DEPLOY_18.md](ENV_FIRST_DEPLOY_18.md). Essa etapa adicionou PostgreSQL runtime, adapters, migrations, CI, configuração Vercel/Render, smoke tests e limites de produção. O primeiro preview gratuito/descartável ainda não foi criado. O proprietário escolheu fazer o commit/push manualmente; nenhum serviço hospedado ou secret foi configurado por este agente.

## Leitura rápida para o revisor externo

1. Comece por `ETAPA_18_REPORT.md` para não assumir que a persistência ainda é em memória.
2. Leia `GOOGLE_OAUTH_SCOPE_AUDIT.md` antes de sugerir trocar `drive.readonly` por `drive.file`.
3. Leia `ENV_FIRST_DEPLOY_18.md` para distinguir `.env` local de variáveis Render/Vercel e entender a limitação do Resend sem domínio.
4. Use os relatórios históricos acima como evidência de desenho/QA daquela versão; o código atual e os testes são a fonte final para o estado presente.
