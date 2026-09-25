# ETAPA 18 CONCLUÍDA — PRONTO PARA DEPLOY

Relatório completo de infraestrutura, persistência e preparação do primeiro deploy do Lumio. Atualizado em 25/09/2026. **“Pronto para deploy” significa que existe código e runbook para o proprietário executar o primeiro preview; não significa que há produção publicada, serviço externo configurado ou funcionalidade remota validada.** O pedido original da Etapa 18 proíbe o Codex de realizar o deploy. O proprietário também pediu para fazer o push manualmente. Leia este relatório junto de [DEPLOYMENT_18.md](DEPLOYMENT_18.md), [ENV_FIRST_DEPLOY_18.md](ENV_FIRST_DEPLOY_18.md) e [GOOGLE_OAUTH_SCOPE_AUDIT.md](GOOGLE_OAUTH_SCOPE_AUDIT.md).

## RESUMO

O frontend Vite/React/PWA está preparado para Vercel como site estático; o backend Express/Socket.IO está preparado para Render como **um processo Node long-lived e uma única instância**. PostgreSQL/Prisma substitui arquivos locais e memória como fonte de verdade dos dados que devem sobreviver a restart. Realtime, call, grants/tickets Drive, presença e posição temporal do player continuam efêmeros por desenho. Há migrations, CI, verificações de configuração, testes com PostgreSQL e smoke tests locais. Nenhum serviço Vercel, Render, Resend, TURN ou banco remoto foi criado por este trabalho.

## ESTADO INICIAL

O produto já tinha autenticação, Casa, Party, mídia e Drive, porém os estados tinham dependências de arquivos `.data` e/ou memória do servidor. O PostgreSQL local do Docker foi aberto pelo proprietário, e o runtime com Prisma foi implementado e exercitado. O `.env` local não foi convertido em arquivo de produção. A migração dos dados antigos **não** foi feita automaticamente: contas de `.data/auth-v2.json` e conexões de `.data/google-drive-connections.json` exigiriam decisão explícita; dados de Casa/mídia que existiam somente em memória não podem ser restaurados dali. O banco novo começa vazio.

## DECISÕES DE ARQUITETURA

Frontend estático em Vercel; backend Node em Render; PostgreSQL gerenciado; uma instância; sem Redis, broker, SFU ou Docker obrigatório na hospedagem. O armazenamento persistente usa adapters Prisma que restauram o estado de domínio no boot e gravam as mutações antes de considerá-las concluídas. O desenho reduz mudanças no protocolo cliente, mas requer monitorar a granularidade dos writes e impede escala horizontal sem trabalho adicional. O preview escolhido pelo proprietário é **gratuito e descartável, para poucos amigos**, sem domínio próprio; portanto o fluxo de novos cadastros por e-mail ficará desativado e o acesso será por Google Login com usuários de teste OAuth.

## ARQUITETURA DE PRODUÇÃO

`Vercel/Vite HTTPS → Render/Express HTTPS + Socket.IO WSS → PostgreSQL`. Google Login valida identidade no backend; Google Drive é autorização separada e usa o mesmo backend para OAuth, metadados e streaming; e-mails saem pelo Resend. Cada origem deve ser cadastrada explicitamente. A arquitetura depende de cookies cross-site para nonce Google e ticket de reprodução Drive; browsers que bloqueiam cookies de terceiros podem impedir estes fluxos nas URLs padrão `vercel.app`/`onrender.com`. Isso permanece um risco real, não uma garantia resolvida apenas com `SameSite=None`.

## FRONTEND / VERCEL

O `vercel.json` na raiz define instalação por `npm ci`, build de `@lumio/shared` e `@lumio/web`, saída `apps/web/dist`, rewrite para `index.html` em rotas SPA, headers de segurança e cache curto para service worker/manifest. `VITE_API_URL` e `VITE_SOCKET_URL` são as duas origens HTTPS públicas do backend e são incorporadas ao bundle. Nunca inserir segredo em `VITE_*`. Para o preview Google-only, cadastrar também `VITE_AUTH_SIGNUP_MODE=google-only` e conferir se `/register` mostra a tela de acesso, não cadastro. URLs de preview aleatórias da Vercel não entram automaticamente na allowlist do backend.

## BACKEND / RENDER

Build na raiz: `npm ci && npm run build --workspace @lumio/shared && npm run db:generate --workspace @lumio/server && npm run build --workspace @lumio/server`. Start: `npm run start --workspace @lumio/server`. Health check: `/api/ready`. `PORT` vem do Render. O processo precisa manter conexões WebSocket, WebRTC signaling e streaming; não hospedar as rotas Express como funções serverless Vercel. Confirmar a versão Node 24 selecionada no provedor. O código valida as variáveis essenciais no boot em `NODE_ENV=production` sem imprimir seus valores.

## SINGLE INSTANCE E LIMITAÇÕES DE HORIZONTAL SCALING

Uma instância é requisito, não mera preferência de custo. RoomStore, SocialStore, Socket.IO, presença, signaling, grants/tickets Drive, rate buckets e alguns caches são por processo. Com duas instâncias, clientes poderiam ver estados incompatíveis mesmo usando um banco comum; sticky sessions não consertam todos esses casos. Para escalar, seria preciso redesenhar distribuição de eventos e autoridade de estado, além de avaliar TURN/SFU para calls. Nenhum Redis, broker ou SFU foi adicionado nesta etapa.

## ESTADO PERSISTENTE

No PostgreSQL: `User`, credenciais e identidades externas; tokens de verificação/reset e sessões; Casa/Grupo, membership/papéis, convites e atividade; sala/configurações, fila e revisão, biblioteca, favoritos, playlists, histórico e progresso esparso; conexão Google Drive criptografada. A fila mantém ocorrência própria e ordem, mesmo se o mesmo vídeo aparecer repetido. Histórico representa reproduções, não apenas entradas da fila. A documentação de etapas anteriores foi marcada como histórica quando mencionava memória/arquivo como persistência atual.

## ESTADO EFÊMERO

Presença online, call, voz, screen share, signaling, chats da sessão, playhead/posição temporal, votos de skip, grants/tickets Drive e cache/rate buckets ficam no processo. Ao reiniciar: membros voltam offline até reconectar, call termina, player volta ocioso, grants desaparecem e um item Drive na fila pode exigir nova concessão do proprietário. A fila e sua revisão persistem; **não** se promete retomada exata do frame. Essa separação evita gravar ticks de playback continuamente.

## POSTGRESQL

Schema em `apps/server/prisma/schema.prisma`; migrations PostgreSQL ativas em `apps/server/prisma/migrations`. O histórico SQLite anterior foi arquivado em `apps/server/prisma/sqlite-migrations-archive` e **não** deve ser executado em PostgreSQL. O Compose `infra/compose.postgres.yml` publica Postgres local em `127.0.0.1:5433` e mantém volume próprio. Produção requer URL de banco gerenciado, TLS conforme provedor e backup/restore definido. O plano gratuito escolhido pelo proprietário é descartável; não migrar dados pessoais para ele supondo retenção ou backup.

## PRISMA E ADAPTERS MIGRADOS

`prismaAuthRepository.ts`, `prismaSocialRepository.ts`, `prismaMediaRepository.ts` e `prismaDriveVault.ts` fazem a ponte entre o domínio e PostgreSQL. O boot carrega snapshots e falha se banco/dados necessários não estiverem disponíveis, em vez de cair silenciosamente para arquivo local em produção. Repositórios serializam gravações pertinentes e registram falha de persistência; `/api/ready` pode refletir a falha. Os testes verificam o runtime real, não apenas o schema.

## AUTH PERSISTENCE E SESSION PERSISTENCE

Usuários, hash/salt de senha, identidades Google (`sub`), sessões por hash e tokens de verificação/reset por hash persistem. O navegador ainda guarda bearer token em `localStorage`, uma exposição residual a XSS; CSP ajuda, mas não equivale a sessão HttpOnly. O login Google não autoriza Drive. O modo `AUTH_SIGNUP_MODE=google-only` no backend bloqueia `POST /api/auth/signup` **antes de criar usuário ou enviar e-mail**; não remove login por senha de contas existentes. Ele exige `GOOGLE_CLIENT_ID` na validação de produção. `VITE_AUTH_SIGNUP_MODE` controla a interface, mas a proteção de verdade é no servidor.

## HOUSE, MEMBERSHIP E INVITE PERSISTENCE

Casas, membros, papéis `HOST`/`ADMIN`/`MEMBER`, convites com token em hash, limites de uso/revogação e atividade persistem. Permissões de host/admin continuam no domínio e nas rotas, não apenas no frontend. Presence não é escrita como online após restart. Convites são limitados por uso e verificados contra a Casa; as operações concorrentes têm proteção no processo e persistência transacional conforme o adapter.

## QUEUE PERSISTENCE

Room settings, modo, fila, ocorrência e `queueRevision` são mantidos no banco. O runtime rejeita comandos com revisão desatualizada; uma transação usa atualização condicional da revisão antes de regravar o snapshot. Depois do restart, a fila volta, mas o playback não reinicia sozinho no ponto anterior. Isso é semântica deliberada, não falha de migração.

## LIBRARY / FAVORITES / PLAYLISTS / HISTORY

Biblioteca da Casa, favoritos, playlists com ordem, histórico e progresso esparso são restaurados e gravados. `MediaItem` normaliza identidade por provider + ID; registros de mídia sem referências ainda não são podados automaticamente. O adapter de mídia reescreve o snapshot da Casa dentro de transação em cada mutação; adequado para a primeira Casa pequena, mas uma fonte de amplificação de writes e lock/latência ao crescer. O histórico por Casa é limitado no snapshot. Há testes de concorrência/revisão e restart.

## GOOGLE DRIVE CONNECTION PERSISTENCE E TOKEN ENCRYPTION

Conexões Drive persistem no PostgreSQL com refresh/access tokens criptografados por AES-256-GCM; `GOOGLE_TOKEN_ENCRYPTION_KEY` fica somente no ambiente do backend, nunca no banco/Git/frontend. A chave requer 64 caracteres hexadecimais (32 bytes). Trocá-la ou perdê-la sem migração de recriptografia impede ler tokens já guardados. Cada conexão é vinculada a usuário Lumio; Google Login e Drive continuam fluxos de consentimento diferentes. Para navegar pastas existentes e transmitir vídeos, o escopo atual `drive.readonly` é necessário e **restrito**; consulte a auditoria de scopes antes de qualquer mudança.

## DRIVE GRANTS / TICKETS

Grant de um arquivo para uma Party é temporário e do proprietário conectado; ticket de reprodução é opaco, limitado a arquivo/Party/usuário/sessão, expira e é verificado de novo no stream. O backend busca o arquivo no Google e repassa Range/HEAD, sem entregar token OAuth ao navegador. Grante/ticket não persistem e desaparecem após restart. Arquivo privado colocado na Party fica acessível aos membros ativos daquela Party pelo proxy durante a concessão; isso precisa constar de avisos de privacidade para usuários. Streaming via backend também consome egress do host.

## DATABASE MIGRATIONS, INDEXES, TRANSACTIONS E CONCURRENCY

`npm run db:migrate:deploy --workspace @lumio/server` aplica migrations versionadas; não rodar `migrate dev` no deploy e não aplicar migrations em cada startup. Testado replay em banco vazio isolado. Índices/unicidades cobrem identidade Google, membership, mídia por provider/ID, itens/ordem de playlist, favoritos, sessões/tokens por usuário ou expiração e histórico por sala/data. A revisão condicional da sala e transações protegem persistência da fila/snapshot; o desenho **não** substitui testes de carga e concorrência em várias instâncias, que não são suportadas. Antes de cada migration hospedada, verificar alvo, backup/snapshot e plano de restore; um banco gratuito sem backup não satisfaz esse requisito de produção durável.

## DOCKER AUDIT, DECISION E LOCAL POSTGRES

Docker Desktop foi autorizado e utilizado apenas para Postgres local/teste; o backend Render continua Node nativo. Não há Dockerfile de aplicação porque não era necessário para esse hosting. O volume do Compose preserva o banco entre `up`/`down` comuns; **não usar `down -v`** como rotina. O banco local `lumio_test` é alvo exclusivo dos smoke/tests que escrevem dados; `lumio_dev` é o banco de desenvolvimento. Esses comandos rejeitam alvo de teste incorreto conforme seus scripts.

## ENVIRONMENT CONFIGURATION, REQUIRED PRODUCTION ENV E SECRETS

Obrigatórias no backend de produção: `NODE_ENV=production`, `PERSISTENCE_MODE=postgres`, `DATABASE_URL`, `CLIENT_ORIGIN`, `APP_PUBLIC_URL`, `API_PUBLIC_URL`, `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY`. Para preview Google-only, acrescentar `AUTH_SIGNUP_MODE=google-only` e `GOOGLE_CLIENT_ID`. Para Drive: `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` exato e `GOOGLE_TOKEN_ENCRYPTION_KEY`; o client ID já é requerido. `YOUTUBE_API_KEY` habilita busca; TURN usa `RTC_TURN_URLS`, `RTC_TURN_USERNAME`, `RTC_TURN_CREDENTIAL`; STUN é configurável. No frontend: `VITE_API_URL`, `VITE_SOCKET_URL`, e, no preview, `VITE_AUTH_SIGNUP_MODE=google-only`. Variáveis `VITE_*` são públicas. Nunca copiar `.env` local para Git/provedores indiscriminadamente. `LUMIO_PRODUCTION_SMOKE=1` é exclusivo de teste local e **não** deve ser definido em Render.

## CORS, COOKIES, CSRF, CSP, HTTPS / WSS E TRUST PROXY

`CLIENT_ORIGIN` é allowlist de origens exatas com credenciais, não `*`. URL pública do app e da API devem ser origens HTTPS em produção. Cookies de nonce Google e reprodução Drive são `HttpOnly; Secure; SameSite=None` quando necessário no contexto cross-site; local usa política mais estrita. CORS sozinho não é defesa CSRF: state/PKCE/nonce e verificação de Origin são preservados nos fluxos sensíveis. O backend define headers de segurança; o HTML frontend gera CSP com as origens `VITE_*`, e Vercel acrescenta headers de proteção. O Express confia em **um** proxy em produção. Socket.IO deve usar WSS via proxy Render; certificar em teste hospedado, inclusive reconexão. Cookies de terceiros podem ser bloqueados em parte dos navegadores; não há correção garantida sem domínios sob o mesmo site/ajuste arquitetural.

## GOOGLE LOGIN PRODUCTION CONFIG

Cadastrar manualmente, no cliente OAuth Web, a origem JavaScript HTTPS da Vercel. O login valida ID token/audience/nonce/sub/e-mail verificado e não liga contas só por e-mail coincidente. Em consentimento `External/Testing`, adicionar o e-mail de **cada amigo** como usuário de teste antes de convidá-lo. Sem domínio próprio, manter esse preview restrito; não publicizar o app OAuth nem alegar verificação Google. `openid`, `email`, `profile` são os scopes básicos de identidade, sem Drive. Testar popup/nonce num navegador real após publicar.

## GOOGLE DRIVE PRODUCTION CONFIG

Registrar manualmente `https://SUA-API/api/google-drive/oauth/callback` como redirect URI exata e habilitar Drive API no projeto. Drive solicita `drive.readonly` + `userinfo.email`; o primeiro é restrito e preserva `files.list` em `root`/pastas existentes e `files.get?alt=media` com Range. `drive.file` não é substituto sem mudar o produto para Picker/seleção arquivo a arquivo; `drive.metadata.readonly` não basta para vídeo. Em `External/Testing`, refresh token pode expirar em sete dias, exigindo reconexão. Para público aberto, verificação de scope restrito e possível avaliação de segurança Google são ações manuais futuras; nenhuma delas foi feita automaticamente.

## EMAIL PRODUCTION CONFIG

`EMAIL_PROVIDER=dev-file` é rejeitado em produção; o backend requer `resend` e credenciais. O proprietário tem API key Resend, mas **não tem domínio verificado**. Para este preview descartável, `EMAIL_FROM=Lumio <onboarding@resend.dev>` permite entrega de teste somente ao e-mail da própria conta Resend, não aos amigos; por isso novo cadastro e-mail/senha será bloqueado por `AUTH_SIGNUP_MODE=google-only`. Verificação/reset por e-mail para outros destinatários **não está disponível** nesse cenário. Não prometer “verificação completa de e-mail” a amigos antes de verificar um domínio remetente. Não inserir a API key em documentos ou conversas.

## TURN / STUN

STUN configurável ajuda a descobrir caminhos diretos; TURN é relay quando NAT/firewall bloqueia P2P. Nenhum serviço TURN foi provisionado. Mesmo que Party/chat/sync funcionem, call/screen share entre amigos de redes diferentes podem falhar. Testar duas redes reais; se falhar, escolher provedor TURN, cadastrar credenciais somente no backend e repetir teste. WebRTC mesh envia aproximadamente `N−1` streams por participante e não escala como SFU.

## SOCKET.IO PRODUCTION

Cliente usa origem `VITE_SOCKET_URL`, backend aceita origem `CLIENT_ORIGIN` e autentica entrada/ação por sessão e membership. Com somente uma instância, as estruturas realtime seguem coerentes. Ao reconectar, o cliente deve obter snapshot e refazer presença; não presumir que a call anterior sobreviveu. Render gratuito pode adormecer após inatividade e causar reconexão demorada; essa é limitação do preview escolhido.

## HEALTH, READINESS E GRACEFUL SHUTDOWN

`GET /api/health` responde vida do processo. `GET /api/ready` testa banco com `SELECT 1` e também estado de falha dos adapters; pode retornar 503 durante falha/shutdown. Render deve apontar health check para `/api/ready`. `SIGTERM`/`SIGINT` param aceitação de novas conexões, fecham Socket.IO/servidor e Prisma. Readiness não consulta Google/Resend/TURN; 200 não significa que integrações externas funcionam.

## LOGGING, PWA PRODUCTION E SPA ROUTING

Logs registram categorias/IDs e devem continuar sem tokens, cookies, URLs OAuth completas ou segredos; revisar logs reais na hospedagem. Service worker e manifest versionados são gerados/servidos como arquivos estáticos; cacheiam apenas shell público e assets seguros, não API privada, OAuth, stream/Range ou Drive. `vercel.json` reescreve rotas profundas para `index.html`; testar diretamente `/house/...` e `/invite/...` por refresh. Instalação PWA exige HTTPS e navegador compatível; retestar em dispositivo real, incluindo fullscreen móvel em paisagem.

## BACKUPS E COST/RISK NOTES

Para produção durável, escolher retenção, frequência, restauração testada e responsável pelos backups PostgreSQL. O plano gratuito Render Postgres expira após 30 dias e não fornece backups; o Web Service gratuito pode dormir após 15 minutos sem tráfego. Isso serve somente para o **preview descartável** autorizado pelo proprietário. Registrar risco de perda de contas/House/Drive quando o banco expirar, e não chamar esse ambiente de produção estável. Também monitorar limites de DB/conexões, streaming/egress Drive, cota YouTube, Resend, Vercel, Render e TURN. Chave Drive requer plano próprio de backup/rotação: backup do banco sem chave não restaura conexões, e chave sem banco tampouco.

## CI

`.github/workflows/ci.yml` sobe Postgres isolado, aplica migrations, roda typecheck, lint, testes, build e smoke tests locais. CI não publica serviços, não cria projeto OAuth e não aplica migration no banco hospedado. Confirmar o resultado após o **push manual** do proprietário e proteger branch antes de habilitar auto-deploy. O commit local presente não equivale a push nem a workflow aprovado no GitHub.

## DEPLOYMENT RUNBOOK

O procedimento detalhado com comandos está em [DEPLOYMENT_18.md](DEPLOYMENT_18.md); o mapa de variáveis está em [ENV_FIRST_DEPLOY_18.md](ENV_FIRST_DEPLOY_18.md). Ordem segura para o primeiro preview: revisar mudanças/segredos locais; push manual; criar banco remoto vazio; criar serviço Render sem liberar tráfego/auto-deploy até ambiente e migration estarem prontos; configurar env; aplicar migrations no alvo exato; validar `/api/ready`; criar Vercel; ajustar URLs de ambos; cadastrar origem/callback/testadores Google; testar em browsers; só então convidar amigos. Se alguma plataforma não oferecer pre-deploy no plano escolhido, aplicar migration de ambiente confiável com acesso TLS **antes** de iniciar tráfego. Não executar migration por requisição/startup.

## VERCEL CHECKLIST

- [ ] Projeto Git com raiz do repositório; `vercel.json` reconhecido; Node 24 verificado.
- [ ] `VITE_API_URL` e `VITE_SOCKET_URL` = origem HTTPS real do Render; `VITE_AUTH_SIGNUP_MODE=google-only` para preview.
- [ ] Build estático e rotas profundas, manifest, ícones e service worker testados.
- [ ] Nenhuma variável secreta em `VITE_*`; somente origem aprovada colocada em `CLIENT_ORIGIN`.

## RENDER CHECKLIST

- [ ] Serviço **Web Service / Node**, uma instância, sem autoscale; build/start/health path conforme acima.
- [ ] `NODE_ENV=production`, `PERSISTENCE_MODE=postgres`, URL DB privada/TLS, origens HTTPS reais e Resend definidos.
- [ ] `AUTH_SIGNUP_MODE=google-only` e `GOOGLE_CLIENT_ID` para preview; Drive somente com conjunto completo de secrets.
- [ ] `LUMIO_PRODUCTION_SMOKE` ausente; `PORT` da plataforma; logs sem secrets; WebSocket habilitado.

## POSTGRES CHECKLIST

- [ ] Banco remoto **vazio** e separado do `lumio_dev`/`lumio_test` locais; credenciais nunca em Git.
- [ ] Backup/restore ou aceite explícito de descarte no plano gratuito; limites/expiração anotados.
- [ ] `db:migrate:deploy` no alvo confirmado **uma vez por release antes de tráfego**; verificar tabelas/readiness.

## GOOGLE CHECKLIST

- [ ] Drive API habilitada; origem Vercel e callback Render cadastrados exatamente no cliente Web.
- [ ] Cada amigo adicionado como testador External/Testing; scopes da auditoria mantidos, sem ampliação.
- [ ] Testar Google Login e Drive separadamente; registrar limite de token 7 dias e status de verificação.

## EMAIL CHECKLIST

- [ ] API key Resend e `EMAIL_FROM` no Render; sem segredo no frontend/Git.
- [ ] Para preview sem domínio, usar remetente de teste somente para proprietário e **bloquear signup por e-mail**.
- [ ] Para e-mail público no futuro: domínio próprio verificado, entrega real, reenvio, reset e erros testados.

## TURN CHECKLIST

- [ ] Não afirmar que STUN garante call; testar redes diferentes.
- [ ] Se necessário, selecionar TURN, configurar URLs/usuário/credencial no backend e validar relay.

## FIRST DEPLOY CHECKLIST

- [ ] Revisão manual do diff e histórico de segredos; push feito **pelo proprietário**; CI verde.
- [ ] Banco, migration, Render, Vercel, Google e Resend de teste configurados na ordem acima.
- [ ] Sem publicização do OAuth nem convite amplo; registrar URLs reais fora de relatórios que contenham segredos.

## POST-DEPLOY SMOKE TEST CHECKLIST

- [ ] `/api/health` 200 e `/api/ready` 200; frontend carrega por HTTPS sem mixed content.
- [ ] Google Login com testador, criação de Casa, convite, entrada de outro usuário, Party/chat/sync.
- [ ] Biblioteca/playlist/fila após refresh e restart; Drive conectar, navegar pastas, Range playback; WSS/reconexão.
- [ ] Call/screen share em redes distintas; PWA/rotas profundas/mobile; emails só para destinatário permitido.
- [ ] Inspecionar erros/logs/CORS/cookies e recursos que não funcionarem antes de chamar o preview concluído.

## RESTART PERSISTENCE TEST

Teste local com processo compilado e banco `lumio_test` cobriu usuário/auth/sessão, Casa/convite, fila, biblioteca, playlist, histórico/progresso e cofre Drive após reinício. Para hospedagem, repetir com o serviço Render: dados persistentes devem voltar; presença/call/grants não. **Esse teste hospedado ainda não foi feito.**

## DATABASE FAILURE TEST

Readiness local foi observada 200 → 503 → 200 com Postgres parado/reiniciado. Isso mostra fail-closed da API para persistência, não garante recuperação de toda operação interrompida nem comportamento da rede gerenciada. Repetir em staging se o provedor permitir um teste seguro; não derrubar banco compartilhado de amigos sem aviso.

## AUTH, DRIVE, WEBSOCKET, SECURITY, PERFORMANCE, LANDING E PWA REGRESSION

Auth: testes de verificação/reset/replay e modo Google-only passaram; fluxo Google real hospedado não foi testado. Drive: adapter/restart e isolamento de tickets testados; OAuth/Range real hospedados não. WebSocket: testes locais de domínio/presença e smoke local; WSS entre provedores não. Security: validação de env, CORS, bloqueio de signup, hash, autorização e testes existentes; não é auditoria pentest. Performance: baseline local da [Etapa 17](PERFORMANCE_RESILIENCE_17.md), sem números de produção. Landing: build e testes estáticos passaram, mas visual remoto não. PWA: quatro testes de service worker passaram, instalação em celular HTTPS não. **Nenhum desses itens deve ser marcado como QA completo da Etapa 19.**

## TYPECHECK, LINT, TESTS E BUILD

Na validação mais recente desta entrega, `npm run typecheck` passou; `npm run lint` passou; `npm test` passou com **61 testes do servidor + 8 do frontend + 4 do service worker = 73**; `npm run build` passou. Inclui teste novo de HTTP que verifica que o modo Google-only retorna 403, não cria conta e não gera e-mail de desenvolvimento. A execução local usa código/ambiente locais; repetir após push no CI e após a configuração hospedada.

## PRODUCTION-LIKE LOCAL TEST

`npm run smoke:production --workspace @lumio/server` exercita boot compilado com validação de produção simulada, readiness e CORS; `npm run smoke:postgres-flow --workspace @lumio/server` percorre fluxo HTTP de dados persistentes e restart. Ambos passaram novamente nesta entrega com banco local isolado. São simuladores de produção, **não** substituem Google/Resend/TURN reais ou HTTPS/WSS público. O modo Google-only foi testado por integração HTTP local adicional.

## BUGS ENCONTRADOS E CORRIGIDOS

Foram eliminadas dependências de `.data` como fonte de verdade em produção e falhas silenciosas de configuração essencial por meio dos adapters e validação de env. Um teste de integração antigo herdava `PERSISTENCE_MODE=postgres` do `.env` do usuário e falhava ao iniciar servidor isolado; o processo filho agora força modo arquivo nesse teste específico, enquanto testes PostgreSQL continuam separados e explícitos. No preview, a chave Resend sem domínio levaria novos cadastros a ficarem pendentes sem e-mail para os amigos; o bloqueio server-side de signup e a interface Google-only previnem esse estado. Nenhuma alegação de correção de cookies de terceiros é feita.

## LIMITAÇÕES, DÍVIDA TÉCNICA E RISCOS PARA O PRIMEIRO DEPLOY

Instância única, memória para realtime/chat/grants, regravação integral de mídia por mutação, bearer em `localStorage`, rate limit por processo, ausência de TURN, ausência de restore remoto testado, ausência de domínio próprio, refresh token de app Google Testing possivelmente de sete dias, scope Drive restrito não verificado, e cookies cross-site potencialmente bloqueados. O plano gratuito do banco tem expiração/sem backup e Render gratuito dorme. WebSocket, OAuth, Drive streaming, PWA e call só serão comprovados no ambiente real. Definir política de retenção/logs e de acesso a vídeo Drive antes de uso público. O preview entre amigos não é lançamento Lumio 1.0.

## ARQUIVOS ALTERADOS E DOCUMENTAÇÃO

Infra/configuração: `.node-version`, `package.json`, `vercel.json`, `infra/compose.postgres.yml`, `.github/workflows/ci.yml`, `.env.example`. Backend: schema/migrations Prisma, adapters de auth/social/mídia/Drive, validação de produção, `index.ts`, testes e scripts de smoke. Frontend: env de API/socket e modo Google-only em `App.tsx`, `EntryExperience.tsx`, `LandingPage.tsx`, além do build/PWA. Documentos: [runbook](DEPLOYMENT_18.md), [variáveis](ENV_FIRST_DEPLOY_18.md), [scopes](GOOGLE_OAUTH_SCOPE_AUDIT.md), [índice de relatórios](DEPLOY_HANDOFF_REPORTS.md) e este relatório. Para nomes/linhas finais, usar `git show --stat HEAD` e `git status` no checkout atual; este relatório não pressupõe que todo arquivo alterado esteja no mesmo commit.

## GIT STATUS

Em 25/09/2026, o commit local mais recente observado foi `1567beb Lumio 0.9.8` na branch `master`; havia edições documentais/teste ainda não commitadas durante a preparação deste pacote. **Não houve push, PR ou deploy por este agente nesta continuação.** O proprietário pediu explicitamente para fazer o push. Antes de publicar, revisar `git status`, `git diff`, arquivos não rastreados e o histórico por possíveis segredos; `.env` e `.data` locais não devem entrar no Git. Não confundir commit local com sincronização no GitHub.

## AÇÕES MANUAIS NECESSÁRIAS

1. Revisar mudanças/segredos e fazer commit/push **manualmente**; conferir CI no GitHub.
2. Criar PostgreSQL gerenciado **descartável**, obter URL privada e anotar data de expiração; não migrar dados pessoais sem consentir com perda.
3. Criar Render Web Service Node (uma instância), cadastrar variáveis sem segredo no repositório e URL do banco; aplicar migrations antes de tráfego; confirmar `/api/ready`.
4. Criar projeto Vercel da raiz, cadastrar URLs da API/socket e flag Google-only; conferir HTTPS/rotas.
5. Preencher URLs reais de frontend/backend no Render e cadastrar origem/callback/testadores no Google Cloud; preservar scopes auditados. Não alterar/publicizar projeto OAuth automaticamente.
6. Cadastrar API key Resend no Render e remetente de teste permitido; aceitar que só o proprietário receberá e-mail sem domínio. Convidar amigos só por Google Login.
7. Escolher/configurar TURN se calls em redes reais precisarem de relay.
8. Executar checklist de smoke hospedado, incluindo restart, Drive, WSS, mobile/PWA e duas contas; registrar falhas para a Etapa 19.

O passo a passo de cliques/comandos e variáveis está nos dois runbooks ligados no início. Nunca enviar `DATABASE_URL`, Resend API key, Google client secret, chave Drive ou credenciais TURN por chat.

## NÃO REALIZADO

Deploy **não realizado**; produção hospedada **não criada**; secrets reais **não configurados nos provedores**; Google Cloud/OAuth **não alterado nem publicizado automaticamente**; e-mail real **não enviado neste trabalho**; TURN **não provisionado**; migração de dados locais antigos **não feita**; backup/restore remoto **não testado**; QA hospedado da Etapa 19 **não executado**; Lumio 1.0 **não lançado**.

## PREPARAÇÃO PARA ETAPA 19

A Etapa 19 começa **somente depois** que o proprietário concluir o primeiro deploy manual e fornecer URLs públicas, sem secrets. O próximo trabalho será QA/E2E/release candidate no ambiente real, especialmente OAuth Google Login e Drive, cookies entre domínios, Range, persistência após restart, WSS, call/TURN e PWA móvel. Se o preview gratuito apresentar perda de dados ou limitações de e-mail/OAuth, isso deve ser tratado como risco aceito do ambiente descartável, não como sinal de produção pronta.
