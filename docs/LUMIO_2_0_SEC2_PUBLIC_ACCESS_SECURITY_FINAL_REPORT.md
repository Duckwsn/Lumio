# LUMIO 2.0 — SEC2 Public Access Security & Hardening

## 1. STATUS

**SEC2 LOCAL PASS — PRODUCTION SECURITY VALIDATION PENDING — READY FOR CONTROLLED RELEASE**

Foram corrigidos os problemas de rate limit encontrados, atualizadas três dependências vulneráveis e adicionados testes de regressão. Não houve deploy, commit, push, migração de banco ou chamada a OAuth público. A aprovação é local; ela não certifica os serviços de produção.

## 2. EXECUTION DATE

2026-10-08, America/Sao_Paulo.

## 3. SCOPE

Auditoria do código atual em autenticação, sessão, autorização por House/Party, HTTP, Socket.IO, convites, Media Hub, Google Identity/Drive, validação, CORS, CSRF, SSRF, headers, limites, armazenamento no browser, PWA, Prisma, dependências e configuração de produção. O escopo preservou o contrato funcional e a arquitetura existente.

## 4. SECURITY BASELINE

O worktree estava limpo no início (`git status --short`, `git diff` e `git diff --stat`). Baseline: typecheck, lint, build e testes passaram; E2E passou 17/17. O `npm audit` inicial identificou `concurrently`/`shell-quote` como crítico e `source-map-js` como alto. O PostgreSQL local não estava acessível; os testes que dependem dele foram pulados.

## 5. ARCHITECTURE INVENTORY

- Browser usa token bearer em `Authorization`; o backend valida sessão e e-mail verificado em HTTP e no handshake Socket.IO.
- `SocialStore` deriva membership e role no servidor. `RoomStore` e os handlers Socket.IO controlam Party, presença, Chat, Call, Queue e playback.
- `GoogleDriveService` acessa endpoints fixos do Google, mantém conexão criptografada, grants por Party e tickets temporários vinculados a cookie nonce.
- Prisma persiste Auth, House e Media; a configuração e os repositórios declaram a execução atual como processo único. Presença e estado realtime são em memória.
- Frontend React usa localStorage para a sessão e preferências. O service worker mantém apenas shell estático e navegação offline.

## 6. THREAT MODEL

| Ator | Limite testado | Resultado |
|---|---|---|
| T1 visitante sem sessão | House e Media privados | Negado; health/readiness, auth entry, config pública do Google e preview por token são os acessos públicos deliberados; busca YouTube exige sessão |
| T2 usuário autenticado | Dados de outra conta/House | Isolados por `userId` e membership |
| T3 membro da House | Ações administrativas | Role/permission reavaliados no servidor |
| T4 membro removido | HTTP, socket atual e reconnect | HTTP negado, socket revogado, reconnect não reentra |
| T5 sessão expirada/revogada | HTTP e eventos socket | `resolveSession` rejeita; logout/reset revoga sessão |
| T6 cliente malicioso | IDs, papéis, payloads, eventos e tamanho | Schemas e autorização server-side; limites de 64 KiB e rate limit |

## 7. ATTACK SURFACE

HTTP inclui `/api/health`, `/api/ready`, `/api/rtc/config`, `/api/rooms/:roomId`, `/api/youtube/search`, `/api/youtube/videos/:videoId`; signup/login, verificação, reset, Google Identity, sessão, account e logout; bootstrap, profile, Houses, invites, membros e transferência de host; Media Hub (library, favorites, playlists, history, progress); Google Drive (status, OAuth start/callback, disconnect, files, resolve e playback ticket/stream). Health/readiness, auth entry, config pública do Google e preview de convite são públicos por desenho; busca YouTube e rotas de recurso exigem sessão, membership, permission ou grant conforme o caso.

Socket.IO: `room:join/leave`, `experience:media:enter/leave`, Chat, presence, queue, room settings/mode, media sync/play/pause/seek/rate/change, skip vote, voice join/leave/signal/speaking e screen start/stop. Eventos recebem token válido no handshake; eventos posteriores revalidam sessão, membership, payload e permission quando aplicável.

## 8. AUTHENTICATION AUDIT

PASS local. Senhas usam scrypt e comparação constante; tokens de sessão, verificação e reset são aleatórios e persistidos como hashes. Signup exige verificação de e-mail antes do uso normal; senha errada/login e recuperação não revelam se o e-mail existe. A criação de House ignora `role`, `isAdmin` e `userId` enviados pelo cliente; a regressão confirma que o criador recebe role derivada do servidor.

## 9. SESSION AUDIT

PASS local. TTL é limitado a 1–30 dias; sessão expirada não é restaurada nem autorizada. Logout revoga a sessão e desconecta sockets com aquele token. Reset de senha revoga sessões anteriores. O teste de integração confirma token antigo inválido após reset; novo teste cobre expiração registrada no armazenamento.

## 10. AUTHORIZATION AUDIT

PASS nas superfícies cobertas. Helpers `requireUser`, `requireHousePermission`, `requireRoomMember` e `requireRoomPermission` fazem a autorização no backend. As permissões vêm do papel persistido em `SocialStore`, não do payload ou estado da interface. Operações administrativas também verificam papel na operação correspondente.

## 11. HOUSE ISOLATION

PASS local. Listagem e detalhes são filtrados pelo usuário; leitura de House alheia retorna 404 e acesso de Media sem membership retorna 403. Convites são capabilities aleatórias, expiráveis, limitadas por uso, revogáveis e não expõem token em listagem/log.

## 12. PARTY ISOLATION

PASS local. `room:join` compara o user ID do payload com a sessão e exige membership da House associada à Party. Requisições a outra Party são ignoradas/rejeitadas e snapshots são enviados somente a sockets autorizados.

## 13. IDOR/BOLA

PASS na matriz executada: House, Party, Media Hub, biblioteca e metadata privada do Drive. A autorização ocorre depois de autenticar e antes do acesso ao recurso. Não foi feita enumeração exaustiva de cada combinação de ID existente; recursos Drive dependem também de grant, membership do proprietário e mídia listada na Party.

## 14. PRIVILEGE ESCALATION

PASS local. Regressões tentam role e `isAdmin` forjados no create, promoção de MEMBER para HOST e criação de convite por MEMBER. As tentativas são ignoradas na criação ou recebem 403 na operação administrativa.

## 15. SOCKET.IO SECURITY

PASS local. Middleware de handshake exige sessão válida e e-mail verificado. Middleware por evento verifica sessão novamente, membership atual, payload de objeto e rate limit. Cada handler valida schema; queue/media/Call/room settings também checam permission. `maxHttpBufferSize` é 64 KiB. Flood control por usuário/evento: Chat 20/min, typing 60/min, voice signal 600/min e demais eventos 120/min.

## 16. RECONNECT SECURITY

PASS local. Há teste de churn de 50 conexões, reconexão legítima e recuperação de snapshot. Remoção de membro revoga o socket existente e impede novo `room:join`; a regressão verifica que Chat não vaza após remoção. Reconnect abuse sustentado em WAN não foi simulado.

## 17. OAUTH

Google Identity valida assinatura/audience pelo cliente oficial, `sub`, e-mail verificado e nonce correspondente. Challenge nonce tem cookie HttpOnly, SameSite e expiração; linking exige sessão e senha atual. Drive OAuth usa state, PKCE S256, callback fixo e state de uso único. Testes são locais/mocados; **PUBLIC OAUTH UNVERIFIED**.

## 18. GOOGLE DRIVE PRIVACY

PASS nos testes locais. Escopo é leitura; tokens são criptografados no vault; nomes privados não são revelados a membros sem autorização. File IDs não autorizam acesso por si: resolve/grant, membership do dono, item listado, cookie nonce e ticket temporário são verificados no streaming. Remoção, disconnect e exclusão revogam grants/tickets ou abortam streams. Google Drive real e contas externas não foram acessados.

## 19. INPUT VALIDATION

PASS local. Rotas usam Zod com limites de strings/arrays/IDs; YouTube IDs têm formato fixo; URL de avatar exige HTTPS; range do Drive é validado e limitado. JSON HTTP e Socket.IO aceitam no máximo 64 KiB. JSON malformado retorna 400 e body excessivo retorna 413 sem stack.

## 20. XSS

PASS para sinks encontrados. Não há `dangerouslySetInnerHTML`, `innerHTML` ou `document.write` em código de produto. Conteúdo de House/activity é renderizado como texto e há testes de saída React escapada. IDs de provider são validados antes de montar iframe. Não foi executado JavaScript de payload; a inspeção usou payloads inertes em renderização local.

## 21. CSRF

PASS para o modelo atual. Sessão autenticada usa bearer header, não cookie ambientável; páginas cross-origin não conseguem montar esse header sem autorização CORS. Cookies existentes são nonce/challenge ou playback ticket, não sessão de aplicação. Ações de playback são GET com capability temporária; não foi necessário adicionar CSRF token genérico.

## 22. SSRF

PASS na superfície pesquisada. Backend não recebe URL arbitrária para buscar: Google Drive usa host/endpoints fixos e IDs validados; YouTube usa endpoints fixos; fetch do Drive recusa redirect. Não foram encontrados preview/imports que façam fetch de URL fornecida pelo usuário.

## 23. CORS

PASS em código. Produção exige origens HTTPS exatas e explícitas; credenciais são habilitadas somente para origens permitidas, sem wildcard. Desenvolvimento permite localhost/127.0.0.1. Request sem Origin é aceito para clientes não-browser, mas isso não substitui bearer, membership ou permissions. Teste com Origin hostil não recebe `Access-Control-Allow-Origin`.

## 24. SECURITY HEADERS

PASS em configuração local; runtime de produção não observado. API envia nosniff, Referrer-Policy, X-Frame-Options, CSP `frame-ancestors 'none'`, Permissions-Policy e `Cache-Control: no-store`. Frontend injeta CSP compatível com YouTube, Google Identity e WebRTC. SEC2 adicionou HSTS de um ano somente no ambiente de produção da API e nas respostas Vercel; configuração publicada precisa ser verificada após deploy futuro.

## 25. RATE LIMITING

PASS local após correções. Auth usa bucket por IP (30/15 min) e e-mail hash (8/15 min), busca YouTube tem limite por usuário, API tem limites por usuário/rota, e socket por usuário/evento. SEC2 adicionou 10 criações de House/min e 10 convites/min por usuário.

Os mapas globais antigos negavam novos pedidos/eventos quando ultrapassavam 20 mil/40 mil entradas. Foram substituídos por `BoundedRateLimiter` LRU, limitado em memória, que preserva bucket ativo e remove identidade fria; a checagem de IP encerra antes de criar buckets de e-mails quando o IP já excedeu o limite. O caminho antigo foi confirmado por inspeção do código; não foi feito flood HTTP de 20 mil pedidos. A regressão testa overflow determinístico com capacidade pequena e limites reais de House/invite.

## 26. RESOURCE EXHAUSTION

SEC2-RSRC-01 corrigido: antes, criação de House e convite não passava por `apiRateLimit`; agora cada usuário tem teto de 10 por minuto. Teste local: 10 aceitos e o 11º recebe 429; para convites, mesmo resultado. Outros limites incluem buffers de 64 KiB, arrays limitados, streams Drive até 4 por viewer e tickets com teto/expiração. Proteção contra DDoS volumétrico pertence ao ingress e não foi validada neste worktree.

## 27. ERROR LEAKAGE

PASS local. Handler global responde erro genérico com request ID; erros de Drive são categorizados; diagnósticos de boot filtram message/name/code/cause/stack/meta. Testes verificam erros do Prisma e body inválido/excessivo sem detalhes internos.

## 28. LOGGING

PASS nos testes. Logs usam route template, método, status, duração, IDs/categorias; não registram body, query, Authorization, sessão, código de convite ou token de reset/verificação. A suíte de integração procura tokens e convites gerados nos logs capturados e não os encontra.

## 29. CLIENT STORAGE

PARTIAL por decisão arquitetural: token bearer da sessão fica em `localStorage` (`lumio.session.v1`) e é removido no logout; preferências visuais e última House também ficam no browser. Nenhuma API key, segredo Google ou token Drive é inserido no bundle/browser storage. O bearer é credencial sensível a uma futura XSS; não foi migrado para cookie HttpOnly porque isso mudaria arquitetura/contrato e não foi encontrado XSS explorável no código auditado.

## 30. PWA/CACHE

PASS local. Service worker cacheia apenas shell estático, fontes/assets e offline page; ignora Authorization, Range, API, Socket.IO, Google OAuth/Drive e cross-origin. APIs usam `no-store`. Testes do service worker confirmam que respostas privadas não entram no Cache Storage.

## 31. DATABASE SECURITY

PASS por inspeção e testes disponíveis. Queries Prisma usam parâmetros tipados; único raw query encontrado é constante `SELECT 1`. Repositories escopam mutações por House/room/user e usam transações; delete House revalida host no banco. Nenhuma migração foi criada. Cinco testes PostgreSQL foram SKIP porque o serviço local configurado não estava acessível; essas garantias de persistência estão **UNVERIFIED** neste turno.

## 32. CONCURRENCY

PASS dentro do processo único suportado. Convites concorrentes não excedem maxUses; queue usa revision/CAS; remoção e revogação alteram membership no processo antes do próximo evento ser tratado. A arquitetura de sessão, rate limit, presença e estado realtime permanece process-local; multi-instância exigiria estado/rate limit compartilhado e não foi testada.

## 33. DEPENDENCY AUDIT

Baseline: 3 advisories (1 pacote direto `concurrently`, crítico via `shell-quote`; `shell-quote` crítico; `source-map-js` alto). Exploitabilidade local: dependências de dev/build, sem caminho HTTP de runtime identificado. Atualização limitada no lockfile: `concurrently` 9.2.5, `shell-quote` 1.12.0, `source-map-js` 1.2.2. `npm audit` final: **0 vulnerabilidades**. Nenhum upgrade amplo.

## 34. PRODUCTION CONFIG REVIEW

Validação em código exige PostgreSQL, `PERSISTENCE_MODE=postgres`, origens APP/API HTTPS exatas, Resend e `EMAIL_FROM`; configuração parcial de Drive é recusada e callback deve usar a API pública. `.env` local está ignorado pelo Git e não está tracked; nenhum valor foi copiado para este relatório. A varredura de padrões comuns de credenciais não encontrou correspondência em arquivos de texto tracked; isso não substitui um scanner completo. A configuração local usa transporte de desenvolvimento e não certifica configuração de produção. Headers e variáveis reais de Vercel/Render, proxy, TLS, DB hospedado, e-mail e secrets são **PRODUCTION UNVERIFIED**.

## 35. FINDINGS

| ID | Severidade | Finding | Estado |
|---|---|---|---|
| SEC2-RATE-01 | P2 | Saturação dos mapas de rate limit podia bloquear globalmente novas operações até expiração | Corrigido; regressão LRU determinística |
| SEC2-RSRC-01 | P2 | Criação ilimitada de Houses/convites permitia crescimento rápido de estado e banco | Corrigido; 10/min/usuário com regressões HTTP |
| SEC2-DEP-01 | P3 | Dependências com advisories npm em ferramentas de dev/build | Corrigido; audit final limpo |
| SEC2-HDR-01 | P3 | HSTS não estava declarado nos headers de produção | Configurado na API e Vercel; runtime externo pendente |
| SEC2-ENUM-01 | P3 | Signup retorna status distinto para e-mail já cadastrado (409) e novo (201) | Risco baixo documentado; recuperação de senha continua uniforme |

Não foi encontrado finding P0/P1. Para SEC2-RATE-01, a precondição foi identificada no branch do código anterior; saturação por flood HTTP não foi executada e não é apresentada como reprodução dinâmica.

## 36. FIXES

- Novo `BoundedRateLimiter`: janela por chave, LRU com limite fixo e sem lockout global ao atingir capacidade.
- Limites por usuário para criação de Houses/convites; teste confirma teto e resposta 429.
- HSTS `max-age=31536000` somente em produção na API e em headers Vercel, sem `includeSubDomains`.
- Atualização lockfile apenas para as três dependências sinalizadas.
- Testes: overflow de limiter, sessão expirada, payload de role forjado, MEMBER tentando promover outro/gerir convites e socket removido/reconnect.

## 37. SECURITY TEST MATRIX

| Cenário | Evidência | Resultado |
|---|---|---|
| SEC-E2E-01 não autenticado → House privada | GET detalhes e POST House | PASS, 401 |
| SEC-E2E-02 User A → House B | integração + isolamento S1/S2 | PASS |
| SEC-E2E-03 User A → Party B | join sem membership | PASS |
| SEC-E2E-04 member → ação administrativa | PATCH role e convite | PASS, 403 |
| SEC-E2E-05 removido → socket existente | evento Chat após remoção | PASS, nenhum broadcast |
| SEC-E2E-06 removido → reconnect | novo socket + join | PASS, rejeitado |
| SEC-E2E-07 sessão expirada/revogada | teste AuthStore e password reset | PASS |
| SEC-E2E-08 IDOR | House/Media/metadata Drive | PASS na cobertura local |
| SEC-E2E-09 socket sem autenticação/membership | handshake sem token + join por Maria antes do convite | PASS, rejeitados |
| SEC-E2E-10 payload inválido | null socket, JSON inválido, 64 KiB | PASS |
| SEC-E2E-11 XSS controlado | saída SSR React escapada | PASS local |
| SEC-E2E-12 logout/private cache | logout E2E + testes service worker | PASS local |
| SEC-E2E-13 Drive authorization | grants privados e isolamento em testes com fetch falso | PASS local; Google real UNVERIFIED |
| SEC-E2E-14 convite inválido/adulterado | suite InviteCode | PASS |
| SEC-E2E-15 escalation/mass assignment | role e isAdmin forjados + PATCH negado | PASS |

| Área | Resultado | Evidência |
|---|---|---|
| Authentication / Session | PASS | hashing, verificação, reset/revogação e expiração |
| Authorization / House / Party | PASS | helpers server-side; isolamento multiusuário e multi-House |
| IDOR/BOLA / privilege escalation | PASS na cobertura | House, Media, Drive metadata e patch administrativo |
| Socket.IO / reconnect | PASS | handshake/event middleware; remoção e reconnect |
| OAuth / Google Drive | PARTIAL | state/PKCE/grants locais; credenciais públicas e provider real UNVERIFIED |
| XSS / CSRF / SSRF | PASS local | React escapado, bearer, nonce e fetches a hosts fixos |
| CORS / security headers | PARTIAL | código e configuração; produção não observada |
| Rate limiting / resource limits | PASS local | buckets LRU, limites por usuário/evento e payloads |
| Error leakage / logging | PASS | testes de mensagens e ausência de tokens nos logs |
| Client storage | PARTIAL | sessão bearer em localStorage; nenhum XSS encontrado |
| PWA/cache | PASS | API, auth, Drive e conteúdo privado não cacheados |
| Database / concurrency | PARTIAL | inspeção e in-process tests; PostgreSQL indisponível |
| Dependencies | PASS | `npm audit` final sem findings |
| Production configuration | PARTIAL | validação de código; valores/infra reais UNVERIFIED |
| Functional preservation | PASS local | regressão unitária e 17 E2E |

## 38. REGRESSION RESULTS

Typecheck, lint e build passaram. `npm test`: servidor 102 testes, 96 passaram, 6 SKIP; web 41 passaram; service worker 4 passaram. `npm run test:e2e`: **17/17 passaram**. Houve uma execução intermediária em que o teto inicial de 5 Houses/min interrompeu o cenário S1 que cria 7 Casas de QA; o teto foi ajustado para 10/min e o E2E completo final passou. `git diff --check`: PASS. `npm audit`: 0 vulnerabilidades.

## 39. UNVERIFIED AREAS

- PostgreSQL local/hospedado: indisponível para os 5 testes de repository (`LUMIO_TEST_DATABASE_URL` ausente/inacessível); 1 teste de bootstrap de produção requer `LUMIO_BOOT_QA=1` e um banco descartável `lumio_test`, então ficou SKIP.
- Deploy real, headers observados, WAF/ingress, trust proxy, TLS e número de instâncias.
- OAuth público, Google Drive/YouTube com contas reais, WAN, NAT/TURN e concorrência entre instâncias.
- Saturação HTTP de 20 mil buckets não foi executada; mitigação coberta por teste unitário de capacidade e limites HTTP de recursos.

## 40. KNOWN DEBT

- Sessão bearer em localStorage é sensível a futura XSS; nenhum sink XSS explorável foi encontrado. Migração para cookie HttpOnly exige desenho de sessão/CSRF e não foi iniciada.
- Limiter é process-local. Antes de escalar para múltiplas instâncias, compartilhar contadores e revogação de sessão; manter ingress com defesa volumétrica.
- Signup diferencia e-mail já cadastrado por status; manter recuperação de senha com resposta uniforme.
- Consistência após falha tardia de persistência em memória já é dívida descrita no SYNC1; não foi observada autorização indevida nem ampliada nesta SEC2.

## 41. FINAL GATE

| Gate | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm test` | PASS, com 6 SKIP identificados |
| `npm run test:e2e` | PASS, 17/17 |
| `npm audit` | PASS, 0 vulnerabilidades |
| `git diff --check` | PASS |
| P0 / P1 | 0 / 0 |

## 42. DIFF REVIEW

Diff final contém apenas rate limiter, testes de segurança/sessão, atualizações do lockfile, HSTS no `vercel.json` e este relatório. Artefatos de screenshot gerados pelos E2E foram restaurados ao estado inicial. Sem mudança de schema ou contrato de produto; sem commit, push, deploy ou migração.

## 43. FINAL VERDICT

**SEC2 LOCAL PASS — PRODUCTION SECURITY VALIDATION PENDING — READY FOR CONTROLLED RELEASE**

**CONTROLLED RELEASE:** código local adequado para preview com pessoas conhecidas/grupos pequenos, após configurar o ambiente real com HTTPS, PostgreSQL saudável, origens exatas e e-mail de produção. `AUTH_SIGNUP_MODE=google-only` pode ser usado para uma prévia restrita, mas o valor efetivo no deploy não foi verificado.

**PUBLIC OPEN RELEASE:** não certificado por esta execução. Antes de signup irrestrito, valide DB e repositories em ambiente de produção, headers HTTPS observados, rate limit/WAF no ingress, secrets, OAuth público e operação de instância única/compartilhada. A aplicação pode estar pronta para um preview controlado, mas isso não equivale à certificação de lançamento público irrestrito.
