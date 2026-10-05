# FF2 — Experience Shell & Home Implementation

## STATUS

**FF2 IMPLEMENTED — READY FOR HUMAN QA.** Implementação local para revisão humana. Não houve commit, push, deploy, alteração de schema, protocolo realtime ou credenciais de produção. Não é um congelamento de FF2.

## BASELINE

- Antes de editar: `git status --short` tinha apenas arquivos não rastreados preexistentes de FF1/FF1.1/FF1.2 e QA; `git diff --stat` estava vazio. Todos foram preservados.
- Antes de editar: `npm run typecheck`, `npm run lint`, `npm run build` e `npm test` passaram.
- A suíte E2E não foi executada antes da primeira edição; portanto seu resultado inicial não é chamado de baseline. Após a primeira passagem de código, os E2E S1 Houses, GX2 identidade de Party/Call e GX3 viewers passaram (3/3).

## FILES_READ

`docs/AGENT.MD`, `docs/ENTRY_FLOW.md`, `docs/SOCIAL_ARCHITECTURE.md`, `docs/frontfix/FF1_VISUAL_AUDIT.md`, `docs/frontfix/LUMIO_EXPERIENCE_BIBLE.md`, `docs/frontfix/VISUAL_CONSTITUTION.md`, `docs/frontfix/VISUAL_DEBT_REGISTER.md`, `docs/frontfix/SCREENSHOT_MATRIX.md`, `docs/frontfix/FF1_1_VISUAL_PROOF.md`, `docs/POST_1_0_FF1_2_INTERACTION_SURFACES_REPORT.md` e o prompt FF2 anexado. Não existem `AGENTS.md`, `CLAUDE.md` ou `PROJECT_CONTEXT.md` na raiz. Reabertas as referências visuais aprovadas CS01, CS02, CS03, CS05 e CS20. Inspecionados `App.tsx`, `HousesHome.tsx`, `EntryExperience.tsx`, `PartyStages.tsx`, `GameHub.tsx`, `MobilePartyChat.tsx`, `experienceRoute.ts`, CSS e testes E2E pertinentes.

## ARCHITECTURE_BEFORE

`App.tsx` faz bootstrap/auth e resolve `/app`, `/house/:houseId/media`, `/house/:houseId/games` e o alias legado. A Home recebe resumos reais de Casas e presença leve. A Party reside no mesmo componente de App: socket, snapshot, refs de WebRTC, Call, áudio, Chat e painéis ficam fora da seleção condicional do palco. `PartyGameChatProvider`/`PartyGameWorkspace` provêm contexto de jogo/chat. `MediaExperienceStage` monta `MediaStage`/provider só em Media; `GamesExperienceStage` monta `GameHub` lazy em Games. O defeito visual era Home como cards equivalentes e Media chrome (`now-playing`, Queue/Add, menu de Media) no shell compartilhado.

## ARCHITECTURE_AFTER

A raiz, o socket e os recursos de Call continuam no mesmo componente e com a mesma chave de Party (`snapshot.id`). Apenas as superfícies específicas são condicionais à experiência. O shell compartilhado contém marca, Casa, sincronização, seletor Assistir/Ouvir ↔ Jogos, pessoas, convite/perfil e controles de Call/Chat. A apresentação de mídia pertence exclusivamente à rota Media; a apresentação de jogo continua em Games. `GameHub` mantém lazy imports de Draw, Quiz e Cards.

## HOME_IMPLEMENTATION

- A primeira Casa da ordenação existente é destaque determinístico, sem algoritmo social novo ou afirmação falsa de presença individual.
- Resumo real: nome, online, número de pessoas na Party, atividade e membros. CTA Media e Jogos permanecem distintos; Casa/membros e convite continuam acessíveis conforme permissão.
- Casas seguintes são linhas subordinadas, não cards de igual peso. Zero Casas mantém ações de criação/convite sem hero artificial; uma Casa dispensa seção vazia de “outras”.
- O card destaque foi encurtado após inspeção visual. Em mobile, a prévia redundante de avatares sai da composição compacta, mantendo contagem de presença; CTA aparece cedo. Em 320 px, os dois botões se empilham para preservar nome e alvo touch.

## EXPERIENCE_SHELL

O header é uma única faixa compacta, com Casa truncada visualmente quando preciso, título completo no DOM e seletor com `aria-current="page"`. Não há breadcrumb de Casa/Party/Media. O menu de perfil preserva Conta; Casa e membros e Sair da Party permanecem no menu da Casa. Jogos usa um dock provisório apenas social/Call; FF3 pode redesenhá-lo sem misturar Media.

## MEDIA_BOUNDARY

`MediaExperienceStage`, provider, `now-playing`, fila, biblioteca, opções de ambiente/visualização e Adicionar mídia só aparecem na apresentação Media. A fila, o item atual e o progresso autoritativo não são zerados pela navegação. Player/adapters/sync/queue/autoplay não foram alterados.

## GAMES_BOUNDARY

Games não renderiza `now-playing`, fila, Add Media, Media Hub nem controles de playback. O menu de Casa remove entradas de Biblioteca/Atividade de mídia e visualização ao exibir Games. O Hub não repete “Jogos / nome do jogo”; ao abrir um jogo oferece apenas “Voltar aos jogos” e a própria identidade do jogo. A navegação superior continua visível.

## SOCIAL_BOUNDARY

Call, Mic, Deafen, Share, Chat, People e Settings permanecem Party-scoped nas duas rotas. O chat mobile oculta apenas ações de fila/adição quando em Games, sem desmontar o ChatPanel. O dock desktop em Games é apresentação intermediária social, não um Media dock completo. O protocolo Chat e WebRTC não foram modificados.

## ROUTING

`partyPath` e `parsePartyRoute` não mudaram. O alias legado mantém comportamento coberto pelo teste de rota existente. Build gerou o shell PWA; testes do service worker continuam validando cache/roteamento seguro. Instalação/offline real não foi exercitada nesta etapa.

## DEEP_LINKS

Acesso direto e refresh em `/house/:houseId/media` e `/house/:houseId/games`, troca pelo seletor e Back/Forward foram conferidos no runtime autenticado local.

## CALL_PRESERVATION

O E2E GX2 verifica em Media → Games → Media: mesmo nó `.app-shell`, mesmo socket WebSocket, mesmos peer connections, track de microfone e de screen share, nenhum novo capture, nenhum pacote `room:join`, `room:leave`, `voice:join` ou `voice:leave`. O E2E de voz com três clientes verifica captura, negação, deafen, reconexão e saída. Um clique em “Retornar à partida” era interceptado pela barra visual absoluta do Hub; a barra agora não captura cliques fora de seus botões. O teste isolado e a suíte completa passaram após a correção.

## CHAT_PRESERVATION

O E2E GX2 verifica draft e mensagens de Chat intactos na troca de experiências. O chat mobile permanece no Games sem ações de fila/adição de mídia.

## MEDIA_STATE_PRESERVATION

GX3 verifica desmontagem local do player em Games e política autoritativa de viewers/media ao voltar. M1, M2 e M3 passaram com três clientes, playback compartilhado, biblioteca social e fila convergente. Isso é evidência funcional, não uma suposição a partir do JSX.

## RESPONSIVE

Inspecionados desktop 1440×900, mobile 390×844 e 320×568 em Home/Media/Games. `100dvh` e safe areas no header somam-se ao layout mobile existente de chat/composer. Medida ao vivo em 320 px: `document.documentElement.scrollWidth === innerWidth` nas rotas Media e Games. Home com 9 Casas também é coberta pelo E2E em 320 px. O terceiro jogo em 320×568 pode exigir rolagem interna da área de jogos; isso é funcional e não clipping horizontal.

## LANDSCAPE

Media e Games foram inspecionados em 844×390, com capturas finais na matriz. Os testes de jogos exercitam também larguras mobile e rotação.

## ACCESSIBILITY

Preservados landmarks, títulos reais, botões nomeados, `aria-current`, `aria-expanded` dos menus, status de sincronização e foco visível em ações. Removido outline visual do `h2` programaticamente focado do Hub (não é controle interativo), mantendo foco acessível. CTA principal e seletor usam alvos touch práticos; movimento decorativo novo respeita `prefers-reduced-motion`.

## PERFORMANCE

Não houve estado novo de shell nem alteração do fluxo de snapshots/socket. O destaque da Home usa a ordem já recebida; Games/Media continuam lazy/condicionais. As mudanças de CSS/condicional não adicionam assinatura de presença nem montagem de engines na Home. Não foram coletados perfis de renderização; não se afirma melhoria numérica de CPU, memória ou FPS.

## TESTS

Após a última alteração de CSS, `npm run typecheck`, `npm run lint`, `npm run build` e `npm test` passaram novamente. Teste unitário da Home verifica 0, 1, 3 e 9 Casas e a prioridade 1+N. `git diff --check` não encontrou erros de whitespace (apenas avisos de normalização CRLF do Git).

## E2E

`npm run test:e2e`: **19/19 passaram** na execução integral final. S1 cobre Home com 9 Casas/320 px; GX2 cobre ausência de Media chrome e `aria-current` em Games, identidade de Party/Call; GX3 cobre player/viewers; há ainda testes de Drive, Draw/Quiz/Cards, WebRTC com três clientes, chat mobile, M1/M2/M3 e provas visuais autenticadas. Antes dessa passagem, duas expectativas antigas de testes assumiam fila visível em Games e foram atualizadas para o boundary FF2. O teste S1 passou a aguardar a janela de tolerância de presença do servidor (5 segundos) após sair da Party, sem mudar o produto. O bloqueio real de clique no Hub foi corrigido no CSS e o cenário WebRTC passou isolado e na suíte completa. Nenhum teste ficou pendente.

## VISUAL_PASS_1

Capturas reais autenticadas locais em `artifacts/frontfix/ff2/pass1/`: Home 0/1/3 desktop/mobile; Media e Hub em desktop/390/320/landscape; Draw, Quiz e Cards desktop/mobile. Todas as categorias foram abertas. Problemas observados: destaque Home alto, CTA tardio no mobile, nome do botão extrapolando em 320 px, espaço vazio sobre Hub, outline desnecessário no título focado. Não foi detectado Media chrome em Games. O texto histórico de Chat “Adicione uma mídia” ainda aparece como mensagem da Party; isso não é controle de mídia e não foi suprimido.

## CRITIQUE

A primeira passagem mostrou que compactar o Hub visualmente sem tratar a camada clicável criava sobreposição no botão “Retornar à partida”. O E2E revelou a regressão e confirmou a correção. O refinamento visual restante de jogos ativos foi explicitamente adiado para FF5.

## VISUAL_PASS_2

CSS ajustado para reduzir card, aproximar CTA, empilhar ações em 320 px e remover a faixa vazia do Hub. Capturas finais de Home 0/1/3, Media e Hub desktop/mobile/landscape em `artifacts/frontfix/ff2/pass2/` foram abertas e revisadas. Capturas finais de Draw/Quiz/Cards vieram também do E2E autenticado após o CSS final, foram copiadas para `pass2/` e abertas; ver matriz abaixo. A apresentação dos jogos ativos não foi profundamente redesenhada nesta etapa.

## SCREENSHOT_MATRIX

| Superfície | Desktop | 390×844 | 320×568 | 844×390 |
| --- | --- | --- | --- | --- |
| Home 0 | `pass2/home-zero-desktop.png` | `pass2/home-zero-mobile.png` | — | — |
| Home 1 | `pass2/home-one-desktop.png` | `pass2/home-one-mobile.png` | — | — |
| Home 3 | `pass2/home-three-desktop.png` | `pass2/home-three-mobile.png` | `pass2/home-three-320-final.png` | — |
| Media | `pass2/media-desktop.png` | `pass2/media-390.png` | `pass2/media-320.png` | `pass2/media-landscape.png` |
| Games Hub | `pass2/games-clean-desktop.png` | `pass2/games-clean-mobile.png` | `pass2/games-clean-320.png` | `pass2/games-clean-landscape.png` |
| Draw ativo | `pass2/draw-desktop-final.png` | `pass2/draw-mobile-final.png` | E2E `test-results/g6-draw-drawer-320.png` | — |
| Quiz ativo | `pass2/quiz-desktop-final.png` | `pass2/quiz-mobile-final.png` | E2E `test-results/g6-quiz-question-320.png` | — |
| Cards ativo | `pass2/cards-desktop-final.png` | `pass2/cards-mobile-final.png` | E2E `test-results/g6-cards-table-320.png` | — |

Os caminhos `pass1/` e `pass2/` são relativos a `artifacts/frontfix/ff2/`. Fotos do E2E são geradas pelo teste com autenticação e dados sintéticos locais. A matriz registra visual real, não composição estática.

## HUMAN_QA_PACKAGE

Revisar nesta ordem: `pass2/home-three-desktop.png`, `pass2/home-one-mobile.png`, `pass2/media-desktop.png`, `pass2/media-390.png`, `pass2/games-clean-desktop.png`, `pass2/games-clean-mobile.png`, `pass1/draw-desktop.png`, `pass2/draw-mobile-final.png`, `pass2/quiz-mobile-final.png`, `pass2/cards-mobile-final.png`. O Draw desktop de `pass1/` oferece a visão mais representativa da área de desenho; `pass2/draw-desktop-final.png` documenta uma composição E2E com painel aberto. Como casos técnicos adicionais: Home e Hub em 320 px, Media/Games em landscape e nove Casas em `artifacts/s1/s1-house-nine-mobile.png`.

Checklist humano: a Home parece lugar social e a Casa principal é óbvia? O player domina Media? Games deixou de parecer Media e tem escolha clara? Em mobile, conteúdo e ações aparecem cedo, sem clipping? Chat, Call, Conta, membros e convite continuam acessíveis?

## KNOWN_VISUAL_DEBT

- Em 320×568, o terceiro card do Hub depende de rolagem interna do palco. Não há rolagem horizontal da página.
- A mão de Cartas em mobile é uma faixa horizontal; detalhes de mesa/mão pertencem a FF5.
- Um evento histórico de Chat pode conter copy de mídia em Games; ocultá-lo alteraria conteúdo/protocolo compartilhado, fora do escopo FF2.
- Em 320 px, nomes longos de Casa são truncados no header por espaço físico; nome integral permanece em título, Home e menus.

## DEFERRED_TO_FF3

Acabamento final de Chat/Call/presença social e mensagens contextuais.

## DEFERRED_TO_FF4

UniversalPlayer, Media Hub, Queue, metadata e states de provider.

## DEFERRED_TO_FF5

Layout refinado de Draw/Quiz/Cards, sobretudo mão/mesa de Cartas e proporções em telas curtas.

## DEFERRED_TO_FF6

Polimento e coerência cross-experience depois das superfícies especializadas.

## FINAL_VERDICT

**FF2 IMPLEMENTED — READY FOR HUMAN QA.** Todos os gates automáticos e a revisão visual descritos acima passaram. Este relatório não declara FF2 FROZEN; a revisão humana ainda decide correções, congelamento ou avanço. Não iniciar FF3 automaticamente.
