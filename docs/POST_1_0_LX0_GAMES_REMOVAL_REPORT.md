# LX0 — remoção integral de Party Games

## STATUS

Implementação e validação local LX0 concluídas em 2026-10-08. Sem commit, push, deploy ou operação de banco. Os pedidos complementares do usuário — Casas uniformemente compactas e título/crédito de mídia removido sob o player mobile — foram incorporados ao mesmo ciclo.

## PRODUCT_DECISION

Lumio 2.0 é Casa → Party → Media + Social + Call. Game Hub, Draw, Quiz e Lumio Cards deixam o produto, inclusive seus runtimes e protocolos. Os relatórios históricos permanecem como história do projeto.

## WORKTREE_BASELINE

`git status --short`, `git diff` e `git diff --stat` estavam vazios antes das edições. A última implementação FF3.1 já está no checkout e permanece READY_FOR_HUMAN_QA, não FROZEN.

## FILES_READ

`docs/AGENT.MD`, `ENTRY_FLOW.md`, `SOCIAL_ARCHITECTURE.md`, relatórios GX1–GX4.2.2 e FF1–FF3.1; código de rotas, App, Home, stages, Chat/composer, componentes e runtimes de jogos, protocolos compartilhados, handlers Socket.IO, House Activity, viewer registry, Prisma schema/migrations, testes unitários e E2E.

## PRE_REMOVAL_TEST_BASELINE

Worktree limpo: `npm run typecheck` PASS; `npm run lint` PASS; `npm run build` PASS (1.672 módulos, CSS 217,31 kB; chunks separados Draw 22,21 kB, Quiz 6,49 kB, Cards 8,64 kB); `npm test` PASS (cenários PostgreSQL condicionais não habilitados); `npm run test:e2e` **21/21 PASS**, 13,4 min. Esses resultados são anteriores à primeira exclusão.

## GAMES_INVENTORY

Classificação feita antes de qualquer remoção estrutural:

| Superfície | Classificação | Evidência e destino |
| --- | --- | --- |
| `/house/:id/games`, seletor Media/Jogos, CTA Jogar e preferência inicial | GAME_ONLY | `experienceRoute.ts`, `App.tsx`, `HousesHome.tsx`; remover UI/branch, redirecionar URL histórica para `/media`. |
| `GameHub`, Draw/Canvas/Quiz/Cards, `GameDesignSystem`, `PartyGameChat`, QA Draw | GAME_ONLY | `apps/web/src/components/GameHub.tsx`, `apps/web/src/games/*`, `apps/web/qa/draw-freeze.*`; excluir. |
| `GamesExperienceStage` e seu fullscreen | GAME_ONLY | `PartyStages.tsx`; excluir apenas este stage, preservar `MediaExperienceStage` e `SharedScreen`. |
| `PartyComposer` e `MobilePartyChat` | SHARED com ramos GAME_ONLY | Remover palpite, drafts/papéis de jogo e fechar chat mobile; manter composer de Chat, trigger Call e cabeçalho People/Fila/Add. |
| `App.tsx` e shell GX2 | SHARED com ramos GAME_ONLY | Remover bifurcação, provider de jogo e feed; manter socket, Call, Chat, Share, mídia, Queue e painéis. |
| `PartyGames`, Draw/Quiz/Card runtimes, decks/bancos e timer 250 ms | GAME_ONLY | `apps/server/src/{partyGames,drawGame,drawWords,quizGame,quizQuestions,cardGame,cardDeck}.ts`; excluir. |
| `game:action`, `game:snapshot`, `game:state`, `game:draw` | GAME_ONLY | `packages/shared/src/index.ts` e `apps/server/src/index.ts`; remover tipos, handler e fanout individual. |
| `drawGame.ts`, `partyGames.ts`, `cardGame.ts` compartilhados | GAME_ONLY | `packages/shared/src/`; retirar exports e arquivos. |
| `HousePartyActivity.type=game`, `gameType`, projeção ativa | GAME_ONLY dentro de SOCIAL | `packages/shared`, `houseActivity.ts`, `index.ts`, Home; retirar apenas a variante de jogo. |
| `MediaViewerRegistry` e `experience:media:enter/leave` | MEDIA | Necessários também para leave, disconnect, refresh, múltiplas abas e pausa CAS a zero espectadores. Preservar sem mudar a política autoritativa. |
| `RoomStore`, media/queue/Chat persistidos, `PrismaMediaRepository` | MEDIA/SOCIAL | Preservar. Nenhuma tabela/coluna Game no Prisma schema ou migrations atuais. |
| Auth, membership, presence, CallRegistry, screen share, rate limits | INFRASTRUCTURE/CALL/SOCIAL | Preservar guardas e lifecycles; remover somente chamadas a `games.*`. |
| `styles.css` regras `.game-*`, `.draw-*`, `.quiz-*`, `.card-*`; CSS de jogos importado em `main.tsx` | GAME_ONLY com seletores compartilhados adjacentes | Remover CSS exclusivo; manter layout mobile de Media e estilos de Chat/Call. |
| `apps/web/src/security.test.tsx`, `socialControls.test.ts`, `experienceRoute.test.ts`, `houseActivity*.test.ts` | SHARED com asserts GAME_ONLY | Reescrever expectativas, preservar segurança/Home/Media/Chat. |
| Testes server `draw*`, `quiz*`, `card*`, `partyGames.polish.test.ts` | GAME_ONLY | Excluir; preservar testes não relacionados. |
| `e2e/party.spec.ts`, `ff11-visual-proof.spec.ts`, `ff31-social.spec.ts` | SHARED com cenários GAME_ONLY | Excluir cenários exclusivos; reescrever preservação de socket/Call/Chat/Media e prova mobile FF3.1. |
| `e2e/fixtures/cardDeck*`, `e2e/ff11-studies.spec.ts` | GAME_ONLY fixture / HISTORICAL_TOOLING misto | Retirar fixture de Card e teste operacional de estudos históricos; preservar artefatos históricos documentais. |
| `localStorage`, `sessionStorage`, IndexedDB nos componentes de jogo | Nenhuma chave GAME_ONLY encontrada | Nenhuma limpeza de dados cliente necessária. |
| Prisma schema e migrations | INFRASTRUCTURE | Nenhum model/coluna Game identificado; sem migration nesta fase. |
| npm dependencies | SHARED | Nenhuma dependência exclusivamente Game; manter versões e lockfile. |
| Assets de jogos | GAME_ONLY inline em componentes, QA Draw | Retirar componentes/QA; não tocar em marca, ícones PWA ou imagens históricas. |
| `docs/AGENT.MD`, `ENTRY_FLOW.md`, docs de arquitetura vigente | INFRASTRUCTURE docs | Atualizar contrato atual; não apagar relatórios históricos G/GX/FF. |

## FRONTEND_REMOVAL

Removidos os componentes e imports exclusivos de jogos. `App.tsx` monta uma única experiência de mídia, com Chat/Call/Queue compartilhados. `PartyStages.tsx` conserva o stage de mídia e a camada de compartilhamento de tela, sem o stage de jogos.

## GAME_HUB_REMOVAL

`GameHub.tsx`, `GameDesignSystem` e os componentes da pasta `apps/web/src/games/` foram excluídos. Nenhum hub ou menu de jogos fica disponível na interface.

## DRAW_REMOVAL

Removidos DrawCanvas, DrawGame, scoreboard, desenho e atalhos, estilos Draw, QA Draw, servidor Draw e banco de palavras. O composer voltou a ser somente Chat, sem modo de palpite.

## QUIZ_REMOVAL

Removidos componente Quiz, runtime, perguntas e testes exclusivos. Não há fase ou estado Quiz em Party.

## CARDS_REMOVAL

Removidos componente Cards, runtime/deck, fixture de deck E2E e testes exclusivos.

## NAVIGATION

Removidos seletor Media/Jogos, CTA Jogar na Home, botão Voltar à mídia e entradas Game do menu. Home lista Casas sem abrir jogos. Por pedido adicional, todas as Casas agora usam a mesma linha compacta; a primeira não ganha tamanho, destaque ou rótulo especial. O estado de Party ativa ainda é comunicado por texto e botão.

## ROUTES

`/house/:id/media` é o destino canônico. `/house/:id` e o link histórico `/house/:id/games` só redirecionam para Media, sem montar jogo nem criar uma segunda Party.

## EXPERIENCE_ARCHITECTURE

O shell GX2 conserva identidade de socket, House/Room, Call, Media e Chat ao trocar painéis. A bifurcação de `PartyExperience` desapareceu. Estado de draft de Chat migrou do antigo provider de jogos para `PartyChatDraftProvider` independente.

## PARTY_SHELL

Preservados cabeçalho, menu Casa/Party, player, painéis People/Queue, Media Hub e comandos sociais. A remoção é de ramos de jogos, não uma reconstrução do shell.

## UNIVERSAL_PLAYER

O componente player e os adapters YouTube/Drive não foram alterados. O E2E GX3 verifica que a identidade do player permanece estável entre dois viewers e transições sociais.

## MEDIA_VIEWER_REGISTRY

`MediaViewerRegistry`, `experience:media:enter/leave`, regras por aba, leave/disconnect e CAS de viewers foram mantidos. Eles ainda representam quem assiste, não a antiga seleção de jogos.

## ZERO_VIEWER_POLICY

A pausa autoritativa quando o último viewer de mídia sai permanece no servidor. Nenhuma pausa foi acrescentada à abertura de Chat, People, Queue ou Media Hub.

## PARTY_CHAT

Chat conserva mensagens, typing, limite, deduplicação e envio. Draft persiste ao abrir/fechar painéis e ao trocar viewport. Foram removidas entradas de palpite e avisos específicos de jogo.

## MOBILE_MEDIA_CHAT

Na Party de mídia o Chat continua fixo junto ao player. Não há botão de fechar Chat. O cabeçalho oferece People, Queue e Add Media; o composer mantém botão Call à esquerda. E2E FF3.1 prova proporção 16:9, ausência de sobreposição, rolagem de mensagens, teclado e draft entre mobile/desktop.

## MOBILE_CALL_CONTROLS

O trigger de Call no composer permanece; abre microfone, mutar call, share e configurações, sem People duplicado. Escape devolve foco ao trigger. Sem captura de microfone no Home.

## DESKTOP_SOCIAL_CONTROLS

Mic, áudio/deafen, Chat, Share, People e configurações permanecem como ações diretas. Botão genérico de controles da Party não reapareceu. O status de Call conectada continua secundário.

## QUEUE

Fila colaborativa, histórico, reorder, autoplay, late join e controle de revisão permanecem. Mobile usa ícone no cabeçalho de Chat; desktop usa ação junto à mídia/painel.

## MEDIA_HUB

Biblioteca, favoritos, coleções, histórico, busca e adição à fila foram preservados. Removida apenas uma propriedade de callback sem consumidor de jogo.

## CALL

Signaling WebRTC, mic, deafen, screen share e configurações não foram removidos. Testes locais com até três clientes reais de RTC provaram conexão, negação de permissão, reconexão e continuidade de tracks.

## PRESENCE

Online, inParty, inCall e screenSharing permanecem. A atividade House agora projeta somente idle/party/media/screen. Home continua mostrando contagens e atividade. A linha de cada Casa usa o mesmo grid e ações; ocupação ainda recebe realce sem privilégio por ordem de criação.

## SERVER_RUNTIME_REMOVAL

Removidos `PartyGames`, runtimes Draw/Quiz/Cards, timer de 250 ms, snapshot/fanout de jogo, chamadas presence/leave/delete de jogo e projeção game na Home. Auth, rate limit geral, RoomStore e persistência Media/Social continuam.

## SOCKET_EVENTS_REMOVED

Retirados `game:action`, `game:snapshot`, `game:state`, `game:draw` e o teto de rate limit exclusivo de `game:action`. Eventos `room`, `media`, `queue`, `chat`, `voice`, `screen`, `house` e `experience:media:*` continuam.

## TYPES_AND_SCHEMAS

Removidos módulos/exports de jogo em `@lumio/shared` e a variante `game` de `HousePartyActivity`. Não foi acrescentado substituto semântico nem novo tipo de experiência.

## DATABASE

Schema Prisma e migrations não foram modificados. O inventário não identificou tabela/coluna de Party Games a migrar; nenhum `db push`, reset ou operação em produção foi executado. Testes condicionais PostgreSQL continuam dependentes de configuração local.

## STORAGE

Não havia chave client storage exclusiva de jogos no inventário. Auth, Drive vault, Media, Social e House storage não sofreram limpeza/migração.

## DEPENDENCIES

Nenhuma dependência npm exclusiva de jogos foi identificada. Não houve atualização de pacote nem alteração do lockfile.

## ASSETS

Assets de branding, favicon, manifest e PWA preservados. Artefatos e relatórios históricos G/GX/FF não são arquivos de runtime; permanecem no repositório. Capturas atuais LX0 vão para `test-results/lx0` em vez de sobrescrever provas históricas FF11/FF31.

## CSS

Removidas regras Game/Draw/Quiz/Cards e imports CSS de jogos. A folha final de mídia/Chat/Call permanece. O pedido complementar substituiu as regras `house-featured`/`house-secondary` por uma única `house-list-item`, com colunas de largura estável.

## TESTS_DELETED

Excluídos testes de runtimes exclusivos Draw/Quiz/Cards/PartyGames, testes web exclusivos de drawing/design de jogos, fixture Card E2E e estudo FF11 que só exercitava Game.

## TESTS_REWRITTEN

Atualizados testes de route, Home, House activity, segurança, controles sociais, FF11/FF31 e `party.spec.ts`. Cenários de Game foram removidos; permanecem fluxos de mídia, Chat, Call, Queue, House e navegação. Home testa nove Casas com a mesma classe/layout compacto.

## FF3_1_CONTRACT_PRESERVATION

Desktop: **PASS local** para Mic, áudio/deafen, Chat, Share, People e Settings diretos; botão genérico de controles ausente e status Call conectado secundário (`ff31-social.spec.ts`, capturas `media-chat-desktop`, `share-active-desktop`).

Mobile Media: **PASS local** para player e Chat simultâneos, sem sobreposição ou botão Fechar Chat; trigger Mic no composer, People/Queue/Add no cabeçalho e nenhum dock redundante; saída de fullscreen devolve layout (`ff31-social.spec.ts` e `party.spec.ts`). O pedido adicional removeu título/crédito de mídia apenas no mobile; o desktop os conserva. Home: **PASS local** — nenhuma Casa privilegiada por índice e todas usam cartão compacto idêntico, com atividade e presença como dados variáveis. Isso **não** congela FF3.1: aprovação humana continua pendente.

## E2E

Baseline antes da remoção: 21/21. Depois da remoção: **14/14 PASS** em execução completa de 2,6 min, com uma única worker e serviços locais descartáveis. As reduções correspondem a cenários exclusivamente Game. Falhas intermediárias foram seletores de teste desatualizados (`Pessoas`/`Chat` passaram a tabs), setup retirado por engano de `party.spec.ts` e largura variável das linhas Home; corrigidos e retestados. Após o ajuste final de CSS mobile (ocultar o título sob o player), FF3.1 e Chat mobile passaram novamente **2/2**. A suíte completa não foi repetida depois dessa última alteração puramente CSS; esse limite está explicitado, sem extrapolar o resultado de 14/14.

## MULTIUSER

E2E exercitou 2–3 sessões reais separadas, late join, Play/Pause sincronizados, Queue colaborativa, favorites/collections, presença, Chat e RTC Call. Os testes `automatic voice`, `GX2 Party transport` e `GX3 two tabs` passaram isoladamente e na suíte completa. Não equivale a teste WAN/TURN em produção.

## RESPONSIVE

Testes/capturas verificam 320, 360, 375, 390, 412, 430 e 1440 px; mobile Media mantém canvas 16:9, Chat fixo, composer acessível, ausência de overflow horizontal e landscape com Chat ao lado. Home compacta foi aberta em desktop/390 e nove Casas em 320 px. Não houve certificação Safari nem VoiceOver/TalkBack.

## BUILD_OUTPUT

Baseline: 1.672 módulos, CSS 217,31 kB, chunks Draw 22,21 kB, Quiz 6,49 kB e Cards 8,64 kB. Build LX0 final: 1.656 módulos, CSS 143,03 kB, sem chunks Draw/Quiz/Cards. `npm run build` PASS após ambos os pedidos visuais.

## DEAD_CODE_AUDIT

Busca `rg` nos diretórios ativos `apps/server/src`, `apps/web/src`, `packages/shared/src` e `e2e` por `game:`, `games/`, `draw`, `quiz`, `cards`, `GameHub`, `PartyGames`, `Jogar`, `palpite` e rótulos antigos: nenhuma referência de runtime Game remanescente. Exceções intencionais: alias textual `/games` no parser de rota e teste de compatibilidade; variável local `draw` do canvas sintético de screen share em QA (não é Draw Game). Arquivos históricos sob `docs`/`artifacts` não participam do bundle.

## DOCUMENTATION

`docs/AGENT.MD`, `docs/CLAUDE.MD` e `docs/ENTRY_FLOW.md` registram Media-only e alias `/games`. Relatórios históricos não foram reescritos. Este relatório é a fonte específica da remoção LX0 e do pedido adicional Home/mobile.

## SECURITY_IMPACT

Menor superfície Socket.IO: removidos handler e payloads Game; guardas Auth/House membership, rate limit geral, validação das demais mensagens, Drive tickets e escopo OAuth foram mantidos. Não houve alteração de configuração, secrets, CORS, cookies ou banco. Clientes antigos que ainda emitirem `game:*` não terão funcionalidade de jogo após LX0.

## NO_FEATURE_LOSS_MATRIX

| Capacidade que permanece | Evidência local | Resultado |
| --- | --- | --- |
| Entrada, convite, Casa e presença | S1, Landing, invitation, FF3 People | PASS |
| Mídia sincronizada, viewers e zero viewers | M1, GX3 | PASS |
| Queue e Media Hub/Library | M2, M3, FF3.1 | PASS |
| Chat e draft entre painéis | FF3.1, GX2, mobile contextual | PASS |
| Call e Share | automatic voice, GX2, FF3.1 | PASS |
| Layout Home uniforme | S1 nove Casas, FF3.1 screenshots | PASS |
| Google Drive/YouTube reais em produção | Sem credenciais/API remotas no E2E LX0 | NÃO CERTIFICADO; adapters não alterados |

## VISUAL_PASS_1

Capturas locais de Home desktop/390, mídia desktop, mídia+Chat 390 e menu Call foram abertas. A remoção de Games não introduziu overflow nas larguras testadas. A primeira Casa não tem mais painel destacado.

## VISUAL_CRITIQUE

O pedido humano de 2026-10-08 identificou duas diferenças reais: (1) a primeira Casa ainda era um cartão grande, e (2) título/crédito de mídia sob o player mobile ocupava espaço entre vídeo e Chat. Ambos foram corrigidos. O realce verde de uma Party ativa é intencional, não depende da posição da Casa.

## VISUAL_PASS_2

Capturas posteriores abertas mostram as três Casas com colunas e ações alinhadas, inclusive a primeira; no mobile todas usam a mesma pilha compacta. A captura final de 390 px mostra player, espaçamento discreto e Chat sem título/crédito intermediário. FF3.1 voltou a passar com asserção explícita de `media-context` oculto no mobile. Também foi aberta a landing local por `agent-browser`, sem entrada de jogos.

## SCREENSHOT_MATRIX

| Superfície | Prova local gerada |
| --- | --- |
| Home desktop/320/390/430 | `test-results/lx0/ff31/home-*.png`; Home com nove Casas: `test-results/lx0/home/` |
| Media desktop, Chat, People, Share | `test-results/lx0/ff31/media-*-desktop.png`, `share-active-desktop.png` |
| Media+Chat mobile 320/390/430 | `test-results/lx0/ff31/media-320-chat.png`, `media-390-integrated.png`, `media-430-chat.png` |
| Call mobile e teclado | `test-results/lx0/ff31/media-390-call-menu.png`, `media-390-keyboard*.png` |
| Sala sem mídia, convite e landing | E2E FF11/fluxo Landing; landing inspecionada em navegador local |

As capturas LX0 são saídas locais de teste, não assets de produto. Artefatos históricos versionados serão restaurados ao estado anterior após a validação.

## KNOWN_DEBT

FF3.1 ainda requer Human QA; Safari, VoiceOver/TalkBack, dispositivo físico e TURN/WAN não certificados. PostgreSQL conditional tests dependem de banco local configurado. Nenhuma mudança de produção/deploy foi feita. Visual real de providers Google/YouTube remotos não foi testado nesta fase.

## FINAL_GATES

**PASS:** `npm run typecheck`; `npm run lint`; `npm run build`; `npm test` (server 89 PASS/6 SKIP condicionais, web 31 PASS, SW 4 PASS); E2E completo 14/14 antes da última alteração CSS; E2E focado 2/2 depois dela; `git diff --check` sem erro (apenas aviso de conversão LF/CRLF do Git); busca de dead code sem Game runtime; capturas atuais realmente abertas; `git status --short -- artifacts` vazio após restaurar as capturas históricas sobrescritas pelos testes. Nenhuma operação de banco, commit, push ou deploy.

## FINAL_VERDICT

**LX0 COMPLETE — LUMIO IS MEDIA-ONLY — READY FOR UX1.** O veredito cobre o escopo e as verificações locais acima, sem certificar provedores externos reais, TURN/WAN, Safari ou acessibilidade por leitor de tela. **FF3.1 não está FROZEN**; aguarda Human QA. UX1 não foi iniciada. Nenhum commit, push ou deploy autorizado/executado.
