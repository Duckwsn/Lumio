# Etapa 19 — QA, E2E e avaliação de Release Candidate

## Resumo executivo e escopo

Auditoria do commit `1d39c97` na branch `master`, com QA local isolado e inspeção não destrutiva do preview hospedado em 25/09/2026. **Status: RC_BLOCKED**: a suíte local está saudável, mas ainda faltam medições reais de sync e áudio entre 2–3 pessoas/redes, validação de screen share, Drive streaming, outros navegadores e restart hospedado. Isso é uma pendência de evidência, não uma conclusão de que esses fluxos falham. Não houve commit, push, deploy nem alteração de Render/Vercel/Google/Resend/PostgreSQL remoto.

Estado inicial: `docs/AUTH_V2.md` já modificado pelo usuário e preservado. Estado final: esse arquivo continua modificado; as demais mudanças estão listadas abaixo. Arquivos de teste temporários em `test-results/` estão ignorados.

## Runtime encontrado no código

- **Web:** React/Vite em `apps/web/src/App.tsx`; bootstrap de sessão bearer no `localStorage`, rotas de landing/login/Home/Casa/Party, Socket.IO para presença/estado, `MediaStage` com adapters YouTube/Drive, PWA com service worker versionado. Google Login e autorização Drive são fluxos OAuth separados.
- **API:** Express e Socket.IO em `apps/server/src/index.ts`; autorização por sessão, membership e permissão; estado autoritativo de fila/mídia; signaling WebRTC. `/api/ready` verifica prontidão. O áudio e vídeo da call trafegam P2P, não por Socket.IO.
- **Persistente em PostgreSQL:** usuários, credenciais/identidades, sessões, Casas, membros/roles/convites, configurações de sala, fila/revisão, biblioteca, favoritos, playlists, histórico/progresso e conexão Drive criptografada. **Efêmero:** presença/participantes conectados, signaling/call/share, chat de sessão, playhead, skip votes, grants/tickets temporários e caches. Os smoke tests de produção/PostgreSQL foram executados somente contra banco local isolado.
- **Drive:** `drive.readonly` + `userinfo.email`; tokens de Drive permanecem no backend criptografados; mídia usa grants/tickets e Range. Preview usa cookies OAuth/playback `HttpOnly; Secure; SameSite=None` quando cross-site HTTPS. Isso não elimina o risco de bloqueio de third-party cookies em determinados navegadores.
- **Call:** `getUserMedia` com echo cancellation/noise suppression/AGC; `RTCPeerConnection` em mesh, perfect negotiation, ICE candidates por signaling, até 3 tentativas de ICE restart; STUN fallback; TURN configurável, sem servidor TURN provisionado nesta etapa. Share captura vídeo via `getDisplayMedia`, sem screen audio.

## Matriz QA (A–T)

`PASS` significa cenário realmente executado; `MANUAL_REQUIRED` indica dependência de conta/dispositivo/ação humana. Um PASS local não equivale a PASS hospedado.

| Área | Resultado | Evidência e lacuna |
|---|---|---|
| A Auth | PASS local; MANUAL_REQUIRED hospedado | Testes de signup/verify/login/logout/reset; E2E local com senha descartável. Usuário fez Google Login hospedado; automação não repetiu o OAuth. |
| B House | PASS local | E2E criou Casa; teste de API e socket validou membership/convites. Hospedado abriu Casa existente sem modificar dados. |
| C Party | PASS local/inspeção hospedada | Party abriu com player/dock/drawers; uma pessoa online na sessão hospedada. |
| D Player | PASS parcial; MANUAL_REQUIRED | Controles/renderização presentes; reprodução real com 2 pessoas e adapters não foram medidos nesta rodada. |
| E Sync | PASS protocolo local; MANUAL_REQUIRED hospedado | Três sockets reais receberam mídia/play/pause/seek; sem medição WAN nem aplicação do player remoto. |
| F Queue | PASS parcial | Dois clientes adicionaram itens simultaneamente à fila local, sem perder nenhum; snapshot de reconexão preservou os três. Hospedado mostrou fila existente. Reorder/remove conflitantes ainda exigem teste humano. |
| G YouTube | PASS busca hospedada; MANUAL_REQUIRED playback | Busca retornou 8 resultados no preview; não alteramos a fila nem reproduzimos no ambiente hospedado. |
| H Google Drive | PASS navegação hospedada; MANUAL_REQUIRED streaming | Conexão existente abriu Meu Drive e subpasta; não abrimos/compartilhamos arquivos privados nem testamos streaming/Range ao vivo. |
| I Chat | PASS local; MANUAL_REQUIRED hospedado | Mensagem propagada entre sockets locais; hospedado exibiu histórico da sessão sem envio novo. |
| J Presence | PASS local e leitura hospedada | Snapshot local com 3 participantes; UI hospedada mostrou 1 online e 1 offline. |
| K Call | MANUAL_REQUIRED | Diagnóstico opt-in criado; uma única conta humana impediu RTT/jitter/loss reais com par remoto. |
| L Screen share | MANUAL_REQUIRED | Código auditado; não há validação humana com dois browsers nesta rodada. |
| M Mobile | PASS renderização local; MANUAL_REQUIRED dispositivo | E2E passou por viewport retrato/paisagem; fullscreen/cinema e teclado em aparelho físico pendentes. |
| N PWA | PASS parcial; MANUAL_REQUIRED instalação | Manifest e ícones conferidos em E2E; SW exclui API/auth/OAuth/Drive/Range do cache. Instalação/standalone/update em aparelho pendentes. |
| O Reconnect | PASS local; MANUAL_REQUIRED rede real | Terceiro socket reconectou e obteve fila/revisão. Offline prolongado/sleep/cold start não simulados. |
| P Restart/persistência | PASS local; MANUAL_REQUIRED hospedado | Smoke de fluxo PostgreSQL local; não reiniciamos Render. |
| Q Security regression | PASS suíte local | 401/403, convite/replay, sessão/socket, logs sem secrets, smoke de config/CORS; browser-cookie matrix pendente. |
| R Error states | PASS parcial | Verificações automatizadas de entradas inválidas; estados visuais sob falha da API/ICE não auditados integralmente. |
| S Performance | PASS medição local parcial | Bootstrap/propagação loopback medidos; sem conclusão sobre latência WAN, iframe ou call. |
| T Cross-browser | MANUAL_REQUIRED | E2E Chromium. Firefox/WebKit/Safari e browsers móveis não validados. |

## Testes automatizados e E2E

Baseline antes das mudanças: `npm run db:generate --workspace @lumio/server`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run smoke:production --workspace @lumio/server` e `npm run smoke:postgres-flow --workspace @lumio/server` passaram, com `LUMIO_TEST_DATABASE_URL` apontando para **PostgreSQL local**. Total baseline: **73** testes descobertos (61 servidor, 8 web, 4 service worker); **4 testes PostgreSQL condicionais foram pulados** por não receberem `LUMIO_TEST_DATABASE_URL` no processo da suíte, mas o smoke PostgreSQL separado passou. O typecheck inicial sem `db:generate` falhou por Prisma Client local não gerado; repetido na ordem usada pelo CI, passou. Não é uma falha do código fonte.

O novo `e2e/party.spec.ts` usa Playwright/Chromium, backend file-mode e portas/dados temporários. Exercita landing → login com conta local descartável e e-mail de desenvolvimento → restauração de sessão → Home → criar Casa → Party → fila/chat/Media Hub → refresh/deep route → viewports retrato/paisagem → manifest → logout/proteção de rota. **Não** simula Google OAuth nem Drive OAuth.

`apps/server/src/security.integration.test.ts` foi ampliado para três clientes Socket.IO reais: entrada/presença, chat, duas adições concorrentes à fila sem perda, seleção de mídia, pause/seek/play e snapshot ao reconectar. Não usa mocks de Socket.IO. A nova rotina `rtc/diagnostics.ts` tem teste unitário. Resultado final de regressão: ver seção “Comandos e resultados” abaixo.

## Sync — evidência e hipótese delimitada

Fluxo verificado: ação do cliente inclui `operationId`, `mediaId`, `revision`, posição → servidor valida socket, membership/permissão e revisão → atualiza estado autoritativo e emite `media:sync` → clientes ignoram revisões antigas e reconciliam adapter. O YouTube usa IFrame API; seek corretivo depende de limiares de drift (~2,5 s; ~1,25 s em force), portanto pequenas diferenças visuais podem não ser corrigidas de imediato por desenho. `operationId` é recebido, mas **não há deduplicação server-side comprovada**; não se observou duplicação neste teste.

No teste local de três sockets, ação → recebimento remoto para pause/seek/play ficou em **0,5 / 0,5 / 0,6 ms** e **1,1 / 4,5 / 2,0 ms** nas execuções direcionadas, e **2,1 / 2,3 / 2,7 ms** e **3,4 / 4,5 / 4,6 ms** nas suítes completas (loopback, quatro execuções pequenas). Isso mede somente Socket.IO/estado no processo local; não mede WAN, tempo de persistência PostgreSQL, inicialização/buffering do YouTube/Drive nem aplicação efetiva pelo player. Assim, não há causa raiz demonstrada para a pequena latência relatada pelos usuários e **nenhuma correção especulativa de sync foi feita**. Para separar rede/processamento/player, ainda é necessário um teste hospedado com timestamps t0 (ação), t1/t2 (servidor) e t3/t4 (cliente/player) em 2–3 sessões, sem expor credenciais. O servidor persiste antes do broadcast em certos fluxos como `play`/troca de mídia, possível componente de atraso que precisa de medição no PostgreSQL hospedado antes de otimizar.

## Call, ICE, TURN e screen share

O código já usava `getStats()` a cada 8 s para qualidade agregada por RTT/perda. Adicionado diagnóstico **opt-in** `sessionStorage.setItem('lumio:qa:rtc','1')`, seguido de reload, que emite `lumio:rtc:qa` no console apenas durante call ativa; contém tipo de candidato local/remoto, protocolo, codec, RTT, pacotes, perda, jitter e atraso médio do jitter buffer quando o browser fornece os campos. Não coleta IP, identificador de peer, token ou dispositivo. Para desligar: `sessionStorage.removeItem('lumio:qa:rtc')` e reload. O console é local ao browser, não um SaaS/log remoto; recomenda-se compartilhar apenas números, não o console completo. A métrica não é latência de áudio boca→ouvido, e packet loss é contagem acumulada. **RTT/jitter/loss/ICE reais: indisponíveis nesta rodada**, pois só uma conta estava disponível. Não é possível declarar host/srflx/relay escolhido nem atribuir a latência contínua ao signaling.

**TURN: sem decisão de provisionamento.** Suporte configurável preservado; necessidade `TURN_RECOMMENDED`/`TURN_REQUIRED_FOR_1_0` depende de candidates, RTT, perda e falhas reais em redes distintas. Screen share (um por Party, vídeo sem áudio) não foi acionado no preview; exigirá dois participantes para validar entrada durante share, parada, queda de sharer, retorno à mídia e manutenção de call/chat/fila.

## Segurança, PWA, performance e limites

- A sessão bearer em `localStorage` é risco residual aceito no preview; não foi migrada. CSP atual e exclusões do SW foram conferidas. Testes locais verificam que credenciais/tokens não aparecem nos logs de servidor. Não foi realizada auditoria completa de XSS nem pentest.
- Google Login e Drive OAuth são independentes. O browser autenticado provou que uma sessão Google já existente abre Home/Party. O consentimento/refresh Google ao vivo, `email_verified`, nonce e challenge dependem dos testes de API existentes e roteiro manual. Nenhuma configuração OAuth foi alterada.
- Drive root/subpasta hospedados funcionaram, sem expor nomes de arquivos/conta no relatório. Range/tickets/grants/refresh/encriptação têm testes locais, mas o fluxo completo de outro participante consumindo arquivo privado precisa de validação humana autorizada.
- O SW cacheia somente shell/assets estáticos seguros; requisições `Authorization`, `Range`, `/api/`, `socket.io`, OAuth e Google Drive são excluídas. Manifest/icons observados; installability/standalone/offline deep route/update não validados em dispositivo real.
- `/api/ready` hospedado retornou `{ "ready": true }` em 25/09/2026. Isso não prova ausência de cold starts posteriores. Bootstrap local p50/p95 variou de **2,0/6,2 ms** a **5,8/20,5 ms** (`n=30` por execução, loopback), sem conclusão para Render/Vercel.
- Preview Vercel → Render cruza sites. Código aplica nonce/playback cookies `HttpOnly; Secure; SameSite=None` em HTTPS, mas bloqueio de third-party cookies em Safari/Firefox/Chrome configurado permanece `MANUAL_REQUIRED`.

## Achados, correções e risco para 1.0

| Severidade | Achado | Ação/estado |
|---|---|---|
| MINOR | Após logout, acessar `/app` sem sessão mostra a landing mantendo `/app` na URL. Conteúdo autenticado não apareceu no E2E. | Documentado; ajuste de rota pode ser feito separadamente se desejado. |
| KNOWN_LIMITATION | Uma conta não permite medir WebRTC P2P nem sync WAN/humano. | Diagnóstico opt-in e roteiro manual criados; gate permanece bloqueado. |
| KNOWN_LIMITATION | Render gratuito pode dormir; mesh P2P escala mal; ausência de TURN pode restringir certas redes; bearer em localStorage e cookies cross-site têm riscos conhecidos. | Sem migração/infra especulativa. |

Nenhum BLOCKER/CRITICAL reproduzido no ambiente local ou na inspeção hospedada restrita. A classificação **RC_BLOCKED** deriva da falta de validação dos fluxos centrais multiusuário/call, não da descoberta de vazamento ou perda de dados. Corrigida a cobertura de testes: E2E crítico, teste de 3 sockets e diagnóstico RTC; não foi alterada a arquitetura de produção.

## Roteiro manual hospedado (uma pessoa controla as contas; sem enviar credenciais)

Use duas contas distintas e, quando possível, três; duas redes diferentes são mais informativas para call. Não envie tokens, URLs com grants/tickets ou prints de arquivos privados. Registre participantes, browsers, redes, mesma rede ou não, atraso percebido e se constante/intermitente.

- [ ] Google Login e logout/login; criar/entrar em Casa; convite com segunda conta.
- [ ] Party com 2 e 3 pessoas: presença, chat, reações, refresh, fechar aba, retornar e reconectar.
- [ ] YouTube: busca, fila simultânea A/B, play/pause/seek/troca de mídia, fim→próxima e reconexão; anotar atraso em cada ação.
- [ ] Google Drive: consentimento, Meu Drive/pastas/paginação, vídeo, Range/seek/cancelamento, outro participante, owner desconectando e revogação; sem publicar arquivo privado.
- [ ] Call com 2 e 3 pessoas: mute/unmute/deafen, speaking detection, seleção de dispositivo, saída, aba fechada, refresh; capturar apenas resumo `lumio:rtc:qa` de cada par (candidate types, RTT, jitter, loss, jitter buffer).
- [ ] Screen share: iniciar/parar, entrada tardia, sharer fecha aba, segunda tentativa de share, call/chat/fila continuam.
- [ ] Mobile Android/Chrome retrato e paisagem: player, chat, fila, Media Hub, dock, cinema, fullscreen paisagem e saída; Safari/iOS se disponível.
- [ ] PWA: instalar, abrir standalone, refresh/deep route, update; verificar ausência de cache privado.
- [ ] Antes de reiniciar Render, anotar Casa/membros/roles/convites/configuração/fila/biblioteca/favoritos/playlists/histórico/progresso/Drive; **o usuário** reinicia o backend; após `/api/ready`, conferir persistência e reset esperado de chat/presença/call/playhead/grants.
- [ ] Testar Chrome, Firefox e Safari/WebKit quando disponíveis, sobretudo Google/Drive OAuth cross-site, autoplay, mic/screen share e cookies.

## Comandos, arquivos e gate

Comandos usados: `git status`, `git diff`, `git rev-parse`; `npm run db:generate --workspace @lumio/server`; `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`; `npm run smoke:production --workspace @lumio/server`; `npm run smoke:postgres-flow --workspace @lumio/server` (smokes com banco local isolado); `npm install --save-dev @playwright/test`; `npx playwright install chromium`; `npm run test:e2e`; `npm exec --workspace @lumio/server -- tsx --test src/security.integration.test.ts`; `GET /api/ready` hospedado. Para repetir smoke, configure **somente** `LUMIO_TEST_DATABASE_URL` para banco local descartável, nunca remoto.

Arquivos alterados pelo agente: `.gitignore`, `package.json`, `package-lock.json`, `playwright.config.ts`, `e2e/party.spec.ts`, `apps/server/src/security.integration.test.ts`, `apps/web/src/App.tsx`, `apps/web/src/rtc/diagnostics.ts`, `apps/web/src/rtc/diagnostics.test.ts`, este relatório. `docs/AUTH_V2.md` permanece alteração pré-existente do usuário. Regressão após mudanças: typecheck, lint, build e Playwright E2E **passaram**; `npm test` descobriu **74 testes** (61 servidor, 9 web, 4 SW): **70 passaram, 4 PostgreSQL condicionais pularam, 0 falharam**. O E2E Chromium passou **1/1**. Os smoke tests local/PG passaram no baseline, sem alterações de código de persistência posteriores.

**Gate: RC_BLOCKED** até execução do roteiro manual essencial (principalmente sync/call/share com 2–3 contas e redes), coleta de métricas RTC e validação de Drive streaming/cookies/restart. Depois, corrigir somente defeitos reproduzidos, repetir regressões e reavaliar o gate. Deploy: **não realizado**. Próximo marco potencial: Etapa 20, somente após QA humano e novo gate.
