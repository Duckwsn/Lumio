# PÓS-1.0 — S1 Houses V2

Data: 29/09/2026. Base de trabalho: checkout com alterações locais não commitadas de G6; foram preservadas. Este relatório descreve S1 local, não um deploy.

## STATUS

Implementação local de Home e Casa V2. Nenhum commit, push, deploy, migration ou alteração de produção. Homologação de aparelhos físicos, provedores externos e WAN continua manual.

## BASELINE

Li `AGENT.MD`, `CLAUDE.MD`, `ENTRY_FLOW.md`, `SOCIAL_ARCHITECTURE.md`, `CALL_V4.md` e o relatório G6. `git status` e `git diff` mostraram alterações G6 preexistentes em jogos, UI, testes, docs e `.gitignore`; não foram revertidas. A Home foi aberta com a fixture local descartável antes de editar: `artifacts/s1/s1-before-home-desktop.png` e `s1-before-home-mobile.png` (a primeira captura de desktop foi refeita em 1440 px). Baseline funcional: 147 aprovados, seis pulados; 10 E2E da etapa G6. A Home antiga tinha card único pequeno com nome, totais, “Nada tocando agora” mesmo com duas pessoas na Party, e nenhum contexto dos jogos ou ação direta para membros.

## AUDIT

**Existe e foi reutilizado:** `SocialStore`/`PrismaSocialRepository`, House/HouseMember, papel e permissões, `lastSeenAt`, contadores `onlineCount`/`partyCount`, sockets Home/Party existentes, `home:update`/`house:update`, Party/Game runtime, mídia atual, screen share, convites link+código, House Settings, exclusão com confirmação e revogação, `Avatar`, histórico limitado de atividade de membership, bootstrap e refresh de 20 s.

**Existia mas precisava evoluir:** card da Home não mostrava pessoas/atividade; `nowPlaying` confundia mídia carregada com reprodução; evento de Home não refletia games; rótulos de papéis eram parcialmente enum; as superfícies de Casa/convite só eram alcançadas pela Party; estados de reconexão na Home não avisavam que contagens poderiam estar velhas; ações dos detalhes tinham tratamento de falha limitado.

**Não existia:** projeção pública mínima de atividade da Party e prévia compacta de até três membros no resumo da Casa.

**Não criado deliberadamente:** novo socket, nova rota Party/House, feed, histórico social novo, tabela/migration, Redis, analytics, notificações, S2 presence, M2 library, APIs/providers, nova Call ou player.

## CURRENT_HOUSE_ARCHITECTURE

Casa é persistente: membership, roles, identidade, convites e atividade administrativa. Há uma Party primária por Casa. Com PostgreSQL, o adapter Prisma carrega Casas/membros/convites e salva snapshots em transação enfileirada; presence, jogos, call e atividade atual são efêmeros no processo. S1 não altera esse limite nem promete multi-instância.

## CURRENT_PRESENCE_ARCHITECTURE

`ONLINE`/`IDLE`/`OFFLINE` pertencem à conta/Casa; `inParty` marca presença distinta. Contagens são de usuários, não sockets nem membros totais. O registro existente agrega abas e mantém cinco segundos de tolerância na saída/reconnect da Party. A Home abre o socket autenticado leve já existente, nunca chama `room:join`, `voice:join`, WebRTC ou `getUserMedia`. LastSeen continua no modelo, mas não foi exibido com falsa precisão.

## CURRENT_HOME_ARCHITECTURE

`/api/bootstrap` e `/api/houses` iniciam/resincronizam os resumos; `home:update` os atualiza sem reload. O refresh existente de 20 segundos permanece fallback. Não há segundo socket ou subscription à Party. A Home só carrega detalhes completos de uma Casa ao abrir “Casa e membros” ou “Convidar pessoas”, via endpoint autenticado existente. Sem membership, o endpoint retorna 404.

## DESIGN_DECISIONS

Uma Casa ganha presença social e uma porta clara para a Party, sem sidebar ou métricas decorativas. A Home não vira dashboard. Um card é mais largo; várias Casas usam duas colunas responsivas. Acesso de conta continua no header compacto. Convite e Casa são ações secundárias do próprio card. Sair/excluir permanecem apenas no painel existente, separados do CTA.

## HOME_V2

Home mantém um header compacto com perfil/conta e valoriza a Casa, sem sidebar, feed ou metrificação decorativa. Usuário sem Casa mantém criar/entrar com convite; erros não são disfarçados de estado vazio.

## HOUSE_CARD_V2

Card apresenta nome, online, até três membros priorizando Party/online, contagem da Party, atividade e CTA. Para uma Casa, a largura é limitada; para múltiplas, o par é facilmente distinguível.

## HOUSE_IDENTITY

Símbolo/URL de avatar usa `Avatar` existente, fallback de iniciais e `referrerPolicy`. Não há upload de capa, imagem de IA ou thumbnail de Drive.

## PARTY_ACTIVITY

Party ativa = `partyCount > 0` segundo a presença autoritativa existente, nunca só House existente ou mídia carregada. A existência de sessão em background não prova que todos a veem. O servidor não conhece o MainStage local de cada pessoa; por isso não diz “Jogando Quiz”. O rótulo de tela informa apenas que há share ativo, não que todos o estão vendo.

## ACTIVITY_PRIORITY

Party vazia → idle; screen share efetivo → “Compartilhando tela”; game em fase de partida → “Partida de X ativa”; mídia com `state=playing` → “Ouvindo/Reproduzindo [título]”; caso contrário → “Na Party”. Lobby e resultados finais cedem à mídia ou ocupação simples.

## ACTIVITY_PROJECTION

O backend projeta a partir de snapshots **apenas tipo, label e opcional gameType**, escolhidos por allowlist. Mídia inclui título normalizado e limitado; títulos com aparência de URL/token viram “mídia”. O payload não copia snapshots de Room/Game.

## PARTY_PRESENCE

`partyCount` = membros com `inParty`, atualizados por join/leave/timeout; não é `memberCount` nem `onlineCount`.

## HOUSE_PRESENCE

`onlineCount` inclui membro conectado ao Lumio, mesmo fora da Party. Retorno após restart restaura membros offline e atividade sem jogo/Call antigos.

## MEMBER_PREVIEW

Preview limita-se a três identidades públicas; ordem Party > online > outros, com `+N`. Rótulo acessível identifica cada pessoa e sua situação. Não há lista de vinte avatares no card.

## HOUSE_DETAIL

“Casa e membros” usa o painel existente sem criar rota e agora pode ser aberto na Home sem entrar na Party. Exibe Geral, Membros, Permissões e Convites quando permitido. Nome/identidade, transferência, saída e exclusão continuam com autorização no servidor e confirmação destrutiva já existente.

## MEMBERS

Lista mostra avatar, nome, papel e presença. Alterar papel/remover continua no painel autorizado; mutação tem feedback de erro e guarda contra duplo envio.

## ROLES

“Dono”, “Administrador” e “Membro” substituem enums crus na apresentação; não mudam protocolo nem matriz de permissão.

## INVITES

Convite reutiliza a mesma implementação link+código/hashing/rate limit/expiry/revoke, em superfície compacta; não mudou formatos ou endpoints. Home não expõe código/tokens no card.

## ENTRY_FLOW

Login → Home → zero/uma/várias Casas → Casa/Party preservado. Criação continua nome apenas; aceitar convite continua ação explícita. CTA “Abrir Party” se vazia, “Entrar na Party” se ocupada. Retorno à Home mantém sessão e membership. A conta continua separada das configurações da Casa; PWA/Landing não foram alterados.

## EMPTY_STATE

Sem Casa, texto direto e ações Criar/Entrar com convite; loading/error não piscam como estado vazio.

## MULTI_HOUSE

Cada Casa tem card e dados próprios; o aceite de convite adiciona a nova Casa sem misturar atividade, membros ou contagens.

## REALTIME

Snapshot inicial vem de bootstrap/GET e também `home:update` no connect. Atualizações relevantes vêm de presença, game, share e transições de mídia; não do playhead/segundo, stroke, cartas privadas ou nível de voz.

## SOCKET_ARCHITECTURE

Um socket Home autenticado e leve já existente; nenhuma inscrição na Party. Payload serializado é comparado por socket, evitando emissão idêntica; refresh de 20 s cobre lacunas transitórias.

## RECONNECT

Após reconnect, o novo socket recebe resumo atual; não se reaplicam mutações. E2E verificou voltar a receber dados sem perder a Party observada.

## STALE_STATE

Enquanto desconectado, a Home sinaliza último estado recebido. Restart reconstrói durable membership offline, mas não restaura games/shares efêmeros.

## PRIVACY

Nenhum snapshot de Draw/Quiz/Cards é copiado à Home; a projeção escolhe campos por allowlist. Nunca publica secretWord/choices/guess, correctIndex/answer/ownAnswer, mão/deck/pending, OAuth/Drive grant/ticket, stream URL ou cookie. Título de mídia é normalizado/limitado, e qualquer título com aparência de URL/credencial vira genérico. Não se envia ID de arquivo ou playback URL.

## SECURITY

`home:update` exige membership e sessão válida; os GETs têm autenticação. Ações de membro, convite e exclusão conservam autorização backend. Remoção revoga acesso/Party; exclusão elimina o card.

## CROSS_HOUSE_ISOLATION

`/api/bootstrap` e `/api/houses` listam só as Casas próprias. Detalhes de outra Casa retornam 404 e join arbitrário da Party alheia é negado. Usuário em duas Casas recebe ambas com IDs e estados separados.

## GAMES_INTEGRATION

Draw, Quiz e Cards usam somente `gameType` e `phase` dos runtimes autoritativos, sem mexer nas regras. Lobby não aparece como jogo em andamento; sessão ativa pode estar em background e o rótulo não atribui visão coletiva.

## MEDIA_INTEGRATION

Mídia usa provider/state/type/title existentes, sem novo player/provider ou inferência pelo nome. Play/pause, avanço e troca de item atualizam Home; seek/playhead não.

## CALL_INTEGRATION

Home não entra na Call, não captura mic/câmera e não afeta playback/revision/queue/RTC. Não foi feito teste físico de TURN.

## SCREEN_SHARE

Resumo usa o slot ativo público, nunca título de janela/conteúdo. Start/stop foi exercitado por fixture Socket.IO; captura física continua manual.

## MOBILE

Testados 320, 360, 375, 390, 412 e 430 px: sem overflow horizontal, botões principais ≥44 px, nomes longos quebram, resumo legível e modais utilizáveis por toque/scroll. Desktop 1440 px mantém hierarquia simples.

## ACCESSIBILITY

Modal reutilizado tem foco inicial, Tab contido, Escape e retorno de foco. Ícones acompanham texto; status não depende só de cor. Motion extra não foi adicionado. Alguns textos secundários do painel legado ainda têm baixo contraste e exigem revisão visual real.

## PERFORMANCE

Fanout deduplicado e projeção curta limitam custo; timers/strokes/playhead não emitem resumos idênticos. Single-instance continua restrição.

## DATABASE

Nenhuma migration, `db push`, reset, novo model ou escrita de presence no PostgreSQL. Nenhuma operação em produção. Activity é derivada em memória e some/reconstrói de modo honesto após reinício.

## TESTS

Testes unitários: prioridade/estado final/sanitização, membership isolada, preview público, contagens e restart. Resultado final de `npm test`: **154 aprovados, 0 falhos, 6 pulados** (servidor 120/0/6, web 30/0/0, service worker 4/0/0). Typecheck, lint, build e `git diff --check` passaram. Nenhum assert foi relaxado para obter verde.

## MULTI_CLIENT

Integração com quatro identidades: A/B/C em X, D em Y, A também em Y; 2 Party participants, Home C observa; D não lê X; Draw/Quiz/Cards, share e mídia play/pause alteram o resumo; títulos com aparência de URL são substituídos; reconexão, ausência de fanout por timer, remoção, exclusão e cleanup.

## E2E

E2E S1 em Chromium: três sessões UI, convite por código, Home com 0/1/2 Casas, 2 Party browsers, três jogos via UI, reconexão, Home sem entrar na Party/mic, detalhes, membros, convite, 6 larguras e CTA. A suíte completa existente cobre Auth/Entry, Media, Chat, Call fixture, People, Queue e os três jogos. **11/11 E2E** da suíte completa passaram antes da última mudança localizada no fanout de mídia; os três E2E diretamente afetados foram repetidos depois.

## VISUAL_QA

Capturas locais em `artifacts/s1/` (ignoradas no Git, disponíveis neste checkout). Abertas e inspecionadas: `s1-before-home-desktop.png`, `s1-before-home-mobile.png`, `s1-home-desktop.png`, `s1-home-320.png`, `s1-home-360.png`, `s1-home-375.png`, `s1-home-390.png`, `s1-home-412.png`, `s1-home-430.png`, `s1-house-active.png`, `s1-house-idle.png`, `s1-house-multiple.png`, `s1-house-empty.png`, `s1-house-detail-desktop.png`, `s1-house-detail-mobile.png`, `s1-members.png`, `s1-invite.png`. Após a primeira inspeção, aumentei os avatares/rótulos de membros e regenerei/abri as capturas. Identidade visual escura/verde, pouca densidade e CTA da Party ocupado destacados sem aspecto de dashboard.

## KNOWN_LIMITATIONS

O servidor não conhece a superfície local que cada participante vê; “partida ativa” não equivale a “todos jogando”. Presença/atividade dependem da instância única e do grace de cinco segundos; atraso ao perder rede é esperado. Não foram validados Android Chrome/iOS Safari/PWA físicos, WAN/TURN/Google/Drive reais ou acessibilidade com leitor de tela humano.

## MANUAL_REQUIRED

Homologação curta: desktop Home 1/várias Casas e ações; Android/iOS 320–430/teclado/safe areas; amigos entram/saem, jogos/mídia/share atualizam; voltar da Party mantém Call/mídia/jogos; convidar e membros; testar exclusão só em Casa descartável.

## FILES_CHANGED

S1: `packages/shared/src/index.ts`; `apps/server/src/{houseActivity.ts,houseActivity.test.ts,houseActivity.integration.test.ts,socialStore.ts,index.ts}`; `apps/web/src/{components/HousesHome.tsx,components/EntryExperience.tsx,components/SocialDialogs.tsx,App.tsx,styles.css,security.test.tsx}`; `e2e/party.spec.ts`; `.gitignore`; `docs/AGENT.MD`; este relatório. Alterações G6 preexistentes permanecem no checkout e não são reivindicadas como S1.

## RESPOSTAS OBRIGATÓRIAS

1. Antes: card de nome/contagem e “Nada tocando”; a Party podia estar ocupada sem contexto.
2. Problemas: atividade de jogo/share ausente, mídia carregada confundida com reprodução, acesso a Casa/convite só via Party e contagens sem pessoas.
3. Party ativa significa `partyCount > 0` de presença autenticada.
4. Online = conectado ao Lumio; na Party = entrou na sessão realtime.
5. Contagem é de usuários únicos com `inParty`, não sockets ou membros totais.
6. Servidor projeta a atividade dos estados atuais de share/jogo/mídia/ocupação.
7. Prioridade: share > partida em andamento > mídia tocando > Party ocupada.
8. Partida em background ainda é chamada “Partida X ativa”, não “Jogando X”.
9. Não. MainStage é local.
10. “Partida X ativa” comunica sessão, não visão compartilhada.
11. Draw: só `gameType=draw`, fase interpretada e rótulo público.
12. Quiz: só `gameType=quiz`, fase interpretada e rótulo público.
13. Cards: só `gameType=cards`, fase interpretada e rótulo público.
14. Mídia: título curto seguro, provider no campo legado e estado transformado em rótulo; sem URL/ID sensível.
15. Tokens, tickets, grants e URLs privadas não devem chegar; projeção por allowlist é testada.
16. Não. Home não emite join de Party.
17. Não. Home não inicia Call.
18. Não. E2E conta zero capturas.
19. Um socket autenticado leve existente e GET inicial/refresh.
20. Não.
21. Bootstrap/GET e `home:update` imediato no connect.
22. Novo connect recebe projeção atual; contagens antigas são sinalizadas como último estado.
23. Membros restaurados offline; jogos/share somem por serem efêmeros.
24. Grace e cleanup existentes de socket; durante perda de conexão a UI marca estado desatualizado.
25. Server filtra membership em cada GET/fanout; id próprio no card; multi-House testado.
26. Não: 404 em detalhe; Home própria omite; join de Party alheia negado.
27. Some da lista e perde detalhe/Party; revogação/cleanup existentes.
28. Some dos cards de membros; exclusão mantém confirmação e autoridade existentes.
29. CTA secundário contextual e fluxo link+código atual.
30. Não houve migration.
31. Não aplicável.
32. Rich presence, status/dispositivo, idle avançado e histórico detalhado ficam para S2.
33. 154 passaram, zero falharam, seis foram pulados por dependerem de PostgreSQL configurado.
34. 11/11 E2E completos: S1 e os 10 cenários existentes (G5, G4, G2, G3, Entry, convite, RTC, mobile, G0 Drive e proporções do Drive). Regressão focal posterior: S1 + dois cenários Drive.
35. Ver `VISUAL_QA` (lista exata das 17 capturas abertas).
36. Android/iOS, WAN/TURN, Google/Drive, leitor de tela, amigos reais e deploy.
