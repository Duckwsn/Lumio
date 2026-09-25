# Lumio — preparação de infraestrutura (Etapa 18)

Este documento é um runbook para o **primeiro deploy manual**, não um registro de deploy realizado. A Etapa 19 fará QA no ambiente hospedado. Não colocar segredos em Git, Vercel `VITE_*`, screenshots ou tickets.

Antes de mexer no OAuth ou nas variáveis, ler [auditoria de scopes Google](GOOGLE_OAUTH_SCOPE_AUDIT.md) e [guia do `.env` local e primeiro deploy](ENV_FIRST_DEPLOY_18.md). O explorador atual de pastas existentes do Meu Drive exige `drive.readonly`, classificado pelo Google como restrito; isso tem implicações de verificação e avaliação de segurança para acesso público.

## Arquitetura e limites

- Vercel publica somente o build estático Vite/PWA (`apps/web/dist`). Sem backend serverless.
- Node 24 está fixado na raiz (`.node-version` e `engines`) e no CI; conferir a versão efetiva em ambos os provedores.
- Render executa `apps/server/dist/index.js` como processo Node long-lived, **uma instância**. Socket.IO, presença, sinalização WebRTC, grants/tickets Drive, rate buckets e caches ficam em memória nessa instância.
- PostgreSQL é a fonte de verdade para User, senha/hash, identidade externa, sessão e tokens de verificação/reset; Casa, membros, papéis, convites com hash, atividade da Casa; sala/settings, fila/revisão, biblioteca, favoritos, playlists, histórico e progresso esparso; conexão Drive criptografada. Chat continua histórico de sessão em memória, conforme implementação atual.
- O playhead, o voto de skip, a call, speaking e a presença são efêmeros. Após restart a fila volta com a revisão preservada, mas o player começa ocioso; membros começam offline e reconectam. Grante/ticket Drive deve ser renovado — item do Drive pode exigir que o proprietário o adicione de novo.
- **Não escalar horizontalmente** sem redesenhar o estado realtime. Sticky session não resolve presença, signaling ou grants entre processos. Não há Redis, broker ou SFU nesta etapa.
- `apps/server/prisma/sqlite-migrations-archive` preserva o histórico SQLite anterior para consulta. As migrations ativas em `apps/server/prisma/migrations` são PostgreSQL e constroem um banco vazio. Não aplicar o histórico SQLite em Postgres.

## Matriz de ambiente

| Nome | Local | Teste/CI | Produção |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` ou omitido | `test` ou smoke `production` | `production` |
| `PERSISTENCE_MODE` | `postgres` recomendado; modo arquivo legado ainda funciona se omitido | `postgres` | `postgres` obrigatório |
| `DATABASE_URL` | PostgreSQL do Compose, porta 5433 | banco separado `lumio_test` | URL privada/SSL do provedor gerenciado |
| `CLIENT_ORIGIN`, `APP_PUBLIC_URL` | URL do Vite | origem HTTPS fictícia no smoke | origem HTTPS exata do frontend |
| `API_PUBLIC_URL` | URL local do backend | origem HTTPS fictícia no smoke | origem HTTPS exata do Render/API |
| `EMAIL_PROVIDER` | `dev-file` | `dev-file` ou Resend simulado | `resend` obrigatório |
| `VITE_API_URL`, `VITE_SOCKET_URL` | origem local do backend | origem de teste | origem HTTPS pública do backend, **sem segredo** |
| `LUMIO_PRODUCTION_SMOKE` | omitir | `1` apenas no teste local | **nunca definir** |

Demais variáveis: `SESSION_TTL_DAYS` (1–30), `EMAIL_FROM`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `YOUTUBE_API_KEY`, `RTC_STUN_URLS`, `RTC_TURN_URLS`, `RTC_TURN_USERNAME`, `RTC_TURN_CREDENTIAL`. A chave do Drive é hexadecimal de 32 bytes (64 caracteres) e **não** vai ao banco. Perder ou trocar essa chave sem plano impede descriptografar conexões existentes. `EMAIL_FROM` deve usar domínio verificado no provedor. Credenciais TURN estáticas são suportadas; emissão temporária pode ser adicionada quando houver provedor específico.

## Desenvolvimento e verificação local

1. Abrir Docker Desktop e iniciar apenas o banco local: `docker compose -f infra/compose.postgres.yml up -d`. O volume `infra_lumio_postgres_dev` é persistente; **não** executar `down -v` como rotina.
2. Copiar os nomes de `.env.example` para seu `.env` privado e configurar `PERSISTENCE_MODE=postgres` e `DATABASE_URL` local. O `.env` existente não foi alterado automaticamente. O modo arquivo legado continua disponível para a sessão local atual, mas não deve ir para produção.
3. `npm ci`; `npm run db:generate --workspace @lumio/server`; `npm run db:migrate:dev --workspace @lumio/server -- --name nome_da_migration` para alterações de schema. Para aplicar migrations já versionadas: `npm run db:migrate:deploy --workspace @lumio/server`.
4. `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`. Os testes PostgreSQL só executam com `LUMIO_TEST_DATABASE_URL` apontando para um banco isolado chamado `lumio_test`; não usar DB de desenvolvimento ou produção. O CI cria seu próprio `lumio_test`.
5. Com o build pronto e Postgres local ativo, `npm run smoke:production --workspace @lumio/server` verifica boot compilado, `/api/ready` e CORS sem chamar Google/Resend reais. `npm run smoke:postgres-flow --workspace @lumio/server` percorre HTTP cadastro/confirmacão/login/Casa/convite/biblioteca/playlist/fila, reinicia o processo e lê os dados novamente. Ambos recusam banco que não seja `lumio_test` local.

O Compose serve **somente** para desenvolvimento/teste; o backend Render é Node nativo. Dockerfile de aplicação não foi introduzido porque adicionaria operação sem benefício necessário. Se o Docker Desktop não estiver ativo, os testes PostgreSQL locais não rodam; os testes unitários permanecem disponíveis.

## Primeiro deploy — ordem manual

1. Para produção durável, escolher região e plano de PostgreSQL gerenciado com backups e restore documentados. **Exceção escolhida pelo proprietário para o primeiro preview:** Render Postgres gratuito, descartável, expira após 30 dias e não tem backup; não migrar dados pessoais que se queira preservar. Proximidade com Render reduz latência. Registrar limites de conexões/armazenamento e custo. Criar banco vazio; obter `DATABASE_URL` **sem colar o valor no repositório**. Usar SSL conforme o provedor exige. Não assumir parâmetros de pool ou `DIRECT_URL` sem verificar o provedor.
2. Preparar serviço **Web Service / Node** no Render a partir da raiz do monorepo, mas manter o deploy inicial sob aprovação manual até que banco, migrations e variáveis estejam prontos. Para produção durável, escolher plano sempre ativo compatível com WebSocket; **o preview escolhido pode usar Web Service gratuito**, aceitando que dormirá após inatividade e interromperá sessões/reconexão até acordar. Sempre uma instância, sem autoscale. Build command: `npm ci && npm run build --workspace @lumio/shared && npm run db:generate --workspace @lumio/server && npm run build --workspace @lumio/server`. Start command: `npm run start --workspace @lumio/server`. Health path `/api/ready`. O processo escuta `PORT` fornecida pelo Render; não fixar porta 4000 hospedada.
3. Cadastrar no Render, no mínimo: `NODE_ENV=production`, `PERSISTENCE_MODE=postgres`, `DATABASE_URL`, `CLIENT_ORIGIN`, `APP_PUBLIC_URL`, `API_PUBLIC_URL`, `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY`. Para o preview Google-only, definir também `AUTH_SIGNUP_MODE=google-only` e `GOOGLE_CLIENT_ID`; na Vercel, `VITE_AUTH_SIGNUP_MODE=google-only`. Sem domínio próprio verificado no Resend, `EMAIL_FROM=Lumio <onboarding@resend.dev>` é **apenas para enviar ao endereço do proprietário da conta Resend**, não aos amigos. Para Drive acrescentar `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`. `YOUTUBE_API_KEY` e TURN conforme recursos habilitados. Não cadastrar `LUMIO_PRODUCTION_SMOKE`.
4. **Antes** de servir tráfego, com backup/snapshot do banco, executar uma única vez por release: `npm run db:migrate:deploy --workspace @lumio/server` em ambiente com o `DATABASE_URL` correto. Em plano Render que ofereça pre-deploy, configurar esse comando como pre-deploy; ele roda após o build e antes do start, fora das instâncias web. Conferir o log e o plano de rollback/restore antes de promover. Se pre-deploy não estiver disponível, aplicar migrations de um ambiente confiável com acesso ao banco **antes de liberar o deploy inicial**; para URL externa, exigir TLS. Não executar migration em cada startup nem criar serviço com auto-deploy habilitado antes dessa etapa.
5. Obter a origem HTTPS real do backend; usar esse valor em `API_PUBLIC_URL` e no frontend. Para bootstrap, URLs temporárias da plataforma são aceitáveis; depois atualizar ambos os serviços com origens definitivas e redeploy controlado. Não inventar URLs antes de recebê-las.
6. Criar projeto Vercel com root do repositório (não `apps/web` isolado). `vercel.json` fixa build, output, SPA fallback e headers. Cadastrar **apenas** `VITE_API_URL` e `VITE_SOCKET_URL` como origens HTTPS do backend. Build no Vercel falha se essas URLs faltarem ou forem HTTP. Confirmar rota profunda `/house/...`, `/invite/...`, manifest, ícones e `/sw.js` servidos corretamente.
7. Obter origem HTTPS real do frontend; atualizar `CLIENT_ORIGIN` (lista restrita) e `APP_PUBLIC_URL` no backend. Não usar `*` com credentials. Evitar previews Vercel automaticamente autorizados; cadastrar apenas origens de preview explicitamente aprovadas.
8. Google Cloud: cadastrar a **origem JavaScript do frontend** para Google Login e a URI exata `${API_PUBLIC_URL}/api/google-drive/oauth/callback` para OAuth Drive. Login e Drive são fluxos separados; scopes Drive não devem ser exigidos para entrar. Se a tela de consentimento estiver em Testing, incluir usuários de teste aprovados. Não marcar o app como verificado sem concluir o processo Google.
9. Para produção durável com cadastro por e-mail, configurar Resend/domínio remetente verificado e testar cadastro, reenvio, reset e entrega sem expor tokens. **Neste primeiro preview sem domínio**, não habilitar cadastro por e-mail para amigos: manter `AUTH_SIGNUP_MODE=google-only` e adicionar cada amigo como testador OAuth no Google Cloud. `EMAIL_PROVIDER=dev-file` é rejeitado em produção.
10. Configurar STUN e, para usuários remotos/NATs restritivos, um serviço TURN escolhido manualmente. Definir URLs, usuário e credencial TURN no backend. **Nenhum serviço TURN foi criado aqui.** Sem TURN, algumas calls/screen shares falharão entre redes diferentes.
11. Verificar `GET /api/health` (processo vivo), `GET /api/ready` (DB acessível), login, Casa/convite, Party/chat, fila, biblioteca, playlist, Google Login, Drive e stream Range, WebSocket/WSS, call, mobile e PWA. A Etapa 19 exige essa QA real; smoke local não é teste de produção.

## Segurança operacional

- Tokens de sessão e verificação são armazenados apenas como hashes. Cofre Drive usa AES-256-GCM por conexão no PostgreSQL; chave em segredo do backend. Grants/tickets permanecem efêmeros. Não registrar URL de OAuth, cookie, corpo de requisição ou token nos logs.
- Frontend e backend em domínios distintos usam cookie de nonce/ticket `SameSite=None; Secure` em produção e `credentials: include` onde exigido. Navegadores que bloqueiam cookies de terceiros podem impedir Google Login/stream Drive nas URLs padrão Vercel/Render; domínios próprios sob o mesmo site são a opção recomendada e precisam de QA real. CORS não é proteção contra CSRF isoladamente; desafio nonce e validação de `Origin` continuam ativos.
- O Express confia em um salto de proxy somente em produção (ingress Render). Validar headers encaminhados e IP/rate limit no primeiro deploy. CSP do HTML é gerada no build com as origens `VITE_*`; os headers Vercel adicionais incluem proteção contra MIME sniffing e framing. Não adicionar curingas indiscriminados ao `connect-src`/`frame-src`.
- PWA guarda somente shell público versionado. API autenticada, Drive, OAuth e Range não entram no service worker cache. `/sw.js` e manifest são servidos sem cache prolongado.
- `.env`, `.data`, certificados e arquivos de credencial são ignorados. Verificar histórico Git antes de publicar; se um segredo já foi commitado, rotacionar no provedor — apagar o arquivo não basta. Não usar `git push`/autodeploy até revisão manual.
- Backups devem vir do provedor PostgreSQL. Definir retenção, frequência, teste de restore e responsabilidade; não afirmar que backup funciona sem restore verificado. Fazer snapshot antes de cada migration. Planejar rotação da chave Drive com recriptografia assistida; troca simples quebra conexões.

## Monitoramento, custo e limitações

- Render logs contêm IDs de requisição e categorias, sem valores de segredos; alertar em `/api/ready` 503, crash loops, erros DB e volume anormal de streaming Drive. Readiness testa DB, não Google nem e-mail. SIGTERM fecha Socket.IO, streams e Prisma.
- Vigiar conexão/armazenamento Postgres, tráfego/egress de streaming Drive, minutos e instância Render, build/transferência Vercel, cota YouTube, Resend e TURN. Streaming por proxy pode custar banda; limites e preços variam por plano.
- Persistência de mídia usa transação com revisão otimista, mas regrava o snapshot da Casa (fila, biblioteca, playlists e até 300 históricos) a cada mutação. Adequado para primeiro deploy pequeno; medir p95/volume e decompor por operação antes de escalar. Dados `MediaItem` órfãos ainda não são podados automaticamente; planejar retenção baseada em referências.
- Os arquivos `.data/auth-v2.json` e `.data/google-drive-connections.json` locais **não** são importados automaticamente. Eles podem conter contas de desenvolvimento e uma conexão pessoal; decidir explicitamente antes do deploy se precisam ser preservados. Casas/mídias anteriores estavam em memória e não podem ser recuperados de disco. Nunca apontar uma migration/importação para produção sem backup, revisão dos registros e consentimento do proprietário.
- CI (`.github/workflows/ci.yml`) verifica typecheck, lint, testes, replay de migrations em Postgres isolado, build e smoke local. Não faz deploy nem cria infraestrutura. Proteger a branch, exigir CI e revisão humana antes de liberar Vercel/Render.

## Estado desta etapa

Validado localmente: migrations em banco vazio `lumio_test`, testes de restart para Auth/Casa/convite/fila/biblioteca/playlist/histórico/progresso/cofre Drive, smoke do backend compilado e do fluxo HTTP com restart, CORS, readiness 200→503→200 quando o container local foi parado e reiniciado, typecheck, lint, tests e build. **Nenhum serviço hospedado foi criado e nenhum deploy foi realizado.** QA HTTPS/WSS real, entrega Resend, Google OAuth de produção, TURN e restore de backup ficam para a implantação manual e Etapa 19.

Referências: [Vite SPA no Vercel](https://vercel.com/docs/frameworks/frontend/vite), [configuração `vercel.json`](https://vercel.com/docs/project-configuration/vercel-json), [deploy/pre-deploy Render](https://render.com/docs/deploys), [conexões PostgreSQL Render](https://render.com/docs/postgresql-creating-connecting), [health checks Render](https://render.com/docs/health-checks), [migrations Prisma v6](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-migrations-from-a-local-environment).
