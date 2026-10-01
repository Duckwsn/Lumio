# PÓS-1.0 — GX4.1 Game Design System V1

## STATUS

Implementação local concluída e validada. Sem commit, push ou deploy.

## BASELINE

Árvore limpa antes da edição. `typecheck`, `lint`, `build` e `npm test` passaram. E2E baseline: 15 passaram, 1 falhou por timeout de 120 s em “mobile permanent chat”; durante a execução concorrente com build, o navegador registrou perda da conexão Vite. Esta falha pré-existente à edição não é atribuída ao sistema visual sem repetição isolada.

## CURRENT_GAME_UI_AUDIT

Capturas abertas antes: `g6-hub-1440x900.png`, `g6-hub-320.png`, `g6-quiz-lobby.png`, `g6-quiz-question-desktop.png`, `g6-cards-lobby.png`, `g6-cards-table-desktop.png`, `g2-lobby-desktop.png`, `g2-lobby-mobile.png`, `g6-draw-guesser-desktop.png`, `g2-guesser-mobile.png`. Hub com cartões pequenos e área vazia em desktop; três cartões comprimidos em 320px. Lobbies, HUDs, placares e resultados tinham hierarquia visual distinta e espaçamento irregular. Conteúdo jogável no mobile disputava espaço com Chat, especialmente Draw; esta etapa não muda as regras de proporção do canvas.

## DESIGN_GOALS

Um vocabulário de apresentação reutilizável sem alterar Party, games, rotas, Call, Chat, mídia ou estados privados. Legibilidade nos alvos 320–1440px, foco visível, comando principal reconhecível e conteúdo jogável prioritário.

## DESIGN_PRINCIPLES

Game first; autoridade no servidor; projeção por identidade; composição em vez de flags; cor nunca como único sinal; movimento econômico; três identidades de game dentro da marca Lumio.

## VISUAL_LANGUAGE

Painéis escuros e bordas sutis, acento menta geral, cor específica leve por game, contornos focados e sem glassmorphism excessivo. Vetores originais existentes mantidos.

## TOKENS

`--game-bg`, `--game-panel`, `--game-panel-raised`, `--game-border`, `--game-text`, `--game-muted`, `--game-accent`, `--game-warning`, `--game-danger`, `--game-radius`, `--game-space` scoped em `.game-hub`. Nenhum token global da Party foi reescrito.

## COLOR_SYSTEM

Menta para identidade/ação, Maré para Quiz, Ameixa para Cartas, Âmbar para aviso/tempo curto. A cor de Draw é Menta. Erro mantém rótulo textual e tom vermelho; status nunca depende só de cor.

## TYPOGRAPHY

Títulos responsivos; metadados menores e secundários; pontos/tempo com numerais tabulares. Fonte Inter existente; não foi adicionada fonte.

## SPACING

Ritmo base 4/8/12/16/24px, com adaptação compacta no mobile.

## SHAPE_LANGUAGE

Raio 16px nas superfícies, borda explícita, cartões com elevação sutil; botões conservam alvos mínimos de toque.

## MOTION

Hover de cartão 160ms, removido por `prefers-reduced-motion`. Animações preexistentes de resultado/ganho continuam locais, sem dependência de animação nova.

## GAME_SHELL

`GameShell` recebe `game`, `className`, atributos HTML e `children`. Não possui conexão, runtime nem regras; não cria Party/Call/Chat.

## GAME_STAGE

`GameStage` é superfície DOM composável usada em Draw, Quiz e Cartas. Em Draw veste o wrapper 4:3 preexistente sem mudar geometria ou pintura imperativa. Não há WebGL/Three.js.

## GAME_HUD

`GameHud` aplica estrutura visual comum; o conteúdo de título, rodada/turno, configuração e score é projetado por cada jogo. No mobile reduz padding e tipografia sem esconder o estado necessário.

## GAME_TIMER

`GameTimer` recebe segundos já calculados pelo jogo, formata `m:ss` ou `Ns`, fixa valor inválido/negativo em zero e usa numerais tabulares. Não calcula deadline, não comanda estado e não envia ticks. `time` tem nome acessível; não usa live region de 250ms.

## PHASE_INDICATOR

`GamePhase` oferece rótulo semanticamente estilizado; no Hub identifica o modo Jogos. Fases específicas continuam em texto visível no HUD do respectivo game.

## TURN_INDICATOR

Cartas mantém “Sua vez”/“Vez de …” e destaque de participante corrente. O servidor continua definindo turno e prazo.

## PARTICIPANTS

Faixa de Cartas usa `game-participants` e mantém `card-players`; Draw/Quiz mantêm listas projetadas. Membros da Casa/Party não são inferidos como participantes. Status offline permanece textual.

## SCORE

Scores continuam exatamente os da projeção recebida; Draw exibe `score/target`, Quiz pontos e Cartas contagem de cartas (não score inventado).

## SCOREBOARD

Draw e Quiz conservam ordenação e semântica atuais, com alinhamento de contraste/borda/numeração por CSS compartilhado. No mobile, Draw continua lista flexível e Quiz vertical; não há reordenação client-side nova.

## LOBBY

`GameLobby` compõe o lobby de Draw; Quiz/Cartas compartilham HUD, status e ação, sem alteração de configuração. Host, participação e mínimo continuam explícitos.

## SETTINGS_CONTROLS

Fieldsets e botões `aria-pressed` existentes preservados. Borda, superfície e padding alinhados. Configuração só é enviada pelo host autorizado e confirmada no snapshot.

## ACTION_BAR

`GameActionBar` organiza ações em Draw/Quiz/Cartas. A primária conserva classe `primary-button`; secundárias recebem borda/painel. Desabilitação continua condicionada a `busy`, conexão e projeção.

## DIALOGS

Escolha de palavra/cor e confirmação de limpar continuam os diálogos específicos, com foco/teclado já existentes. O sistema não introduz portal genérico nem muda tratamento de segredo.

## SHEETS_AND_POPOVERS

Não foram criados; os painéis Party/Call existentes permanecem montados e independentes do game.

## RESULTS

`GameResult` oferece moldura comum. O conteúdo e vencedor vêm do servidor; Draw/Quiz/Cartas mantêm rematch e textos próprios. Sem celebração pesada.

## FEEDBACK

Resposta certa/errada do Quiz mantém texto e borda; Draw mantém ganho de pontos textual; Cartas mantém seleção legal e confirmação de jogada. Nenhum sucesso é mostrado antes de confirmação autoritativa.

## ERROR_STATES

Erros de comando continuam `role=alert` ou status existente, sem repetir automaticamente ação de efeito.

## RECONNECT_STATES

`GameConnectionNotice` continua mostrando último estado recebido e aguardando projeção; visual recebeu contraste de aviso. Ações ficam indisponíveis.

## GAME_HUB

Catálogo de três jogos com descrição curta, faixa de jogadores, ícones vetoriais existentes e layout 3/2/1 colunas. Sessão ativa e navegação continuam as de GX3.

## DRAW_INTEGRATION

Shell, HUD, stage, timer, lobby, action bar e result. Canvas, toolbar, score, projeção e comandos preservados.

## QUIZ_INTEGRATION

Shell, HUD, timer, stage, action bar e result. Perguntas, alternativas, scoreboard, ownAnswer e regras preservados.

## CARDS_INTEGRATION

Shell, HUD, timer, stage, action bar, result e faixa de participantes. Mão, descarte, escolha de cor, legalidade e turno preservados.

## PARTY_SHELL_PRESERVATION

`PartyStages.tsx` e a composição em `App.tsx` tiveram apenas remoção do callback de retorno à mídia e do atalho Escape correspondente. GameHub continua aninhado em `GamesExperienceStage`; único socket/Chat/Call da Party, sem mudança de lifecycle.

## CALL_CHAT_SHARE

Nenhuma integração nova ou duplicada. Chat segue único; Call única; screen share Party-scoped.

## GX3_ROUTE_PRESERVATION

Sem alteração de formato de URL, viewer registry ou política de mídia sem viewer. Por pedido adicional, a troca Mídia↔Jogos ocorre apenas no seletor da Party; o botão redundante do Hub/resultado e o Escape que navegava para Mídia foram removidos. Escape continua fechando fullscreen/visualização de tela.

## MEDIA_REGRESSION

Coberta por testes web e E2E; resultado final registrado abaixo quando concluído.

## GAME_AUTHORITY

Nenhum runtime, evento, action envelope, deadline, pontuação ou validação de servidor foi modificado.

## GAME_PRIVACY

Nenhuma projeção foi ampliada. Draw/Quiz/Cards continuam renderizando apenas o payload autorizado. Capturas E2E usam fixtures locais descartáveis, sem credenciais.

## MOBILE

Hub 1 coluna até 540px, 2 até 900px e 3 acima; HUD compacto; ações ≥44px. Canvas/hand/Chat mantêm política anterior de overflow local e fullscreen paisagem. QA de teclado virtual e aparelhos reais ainda é manual.

## ACCESSIBILITY

Headings, nomes de controles, focus-visible, status/alert existentes. `GameTimer` tem rótulo; não cria região viva que anuncia a cada tick. Cor tem texto complementar. Verificação visual/teclado ainda necessária em dispositivo real.

## REDUCED_MOTION

Hover do catálogo sem transição/transformação e animações de game já existentes desativadas nas regras CSS anteriores.

## PERFORMANCE

Sem dependency/runtime novo, componentes de apresentação puros. O relógio continua local e existente; não move strokes para React. CSS final: 172,20 → 181,19 kB bruto, 31,87 kB gzip na folha principal (inclui regras finais de navegação/Quiz paisagem).

## VISUAL_QA

Capturas finais abertas e inspecionadas em desktop e mobile: Hub 320/390/1440, Draw lobby/guesser/drawer, Quiz lobby/pergunta em 320 e desktop, Cartas lobby/mesa em 320 e paisagem. A terceira opção do Hub ficou visível sem rolagem horizontal. Uma regra CSS antiga ocultava o rótulo de navegação do Hub no mobile após a retirada do botão; o rótulo foi restabelecido. No Quiz paisagem, HUD e espaçamentos foram compactados. O E2E cobre ainda dimensões 320/360/375/390/412/430, sem substituir teste físico.

## POSTGRESQL

Docker daemon indisponível nesta estação (`docker info` não localizou `dockerDesktopLinuxEngine`); nenhum banco/migration foi tocado.

## TESTS

Teste novo de composição, tempo e fase em `GameDesignSystem.test.tsx`. Gates finais: `npm run typecheck` OK; `npm run lint` OK; `npm run build` OK; `npm test` OK em execução serial (servidor 136 pass/0 fail/6 skip; web 35 pass/0 fail; service worker 4 pass/0 fail); `git diff --check` OK. Uma execução de `npm test` em paralelo com typecheck/lint/build falhou no servidor; o caso não foi capturado no output limitado e não se repetiu na execução serial. Causa não determinada.

## E2E

Baseline 15/16. Primeira rodada GX4.1 14/16: G2 falhou em comparação de pixels da borracha, passou isolado sem alteração de lógica; GX3 falhou porque o fixture ainda não oferecia o seletor novo, passou após correção do fixture. Rodada completa final `npm run test:e2e`: 16/16 pass, 0 fail, incluindo S1, G2–G5, GX2/GX3, convite, Call/RTC, mobile chat, Drive, M1–M3 e navegação pelo seletor. Capturas E2E permanecem locais em `test-results/` (ignoradas pelo Git); os seis PNGs versionados em `artifacts/gx3/` que o teste regenerou foram restaurados ao estado inicial.

## FILES_CHANGED

`apps/web/src/{App.tsx,main.tsx,security.test.tsx}`, `apps/web/src/components/{GameHub.tsx,PartyStages.tsx}`, `apps/web/src/games/{GameDesignSystem.tsx,GameDesignSystem.test.tsx,gameDesignSystem.css,DrawGame.tsx,DrawCanvas.tsx,DrawScoreboard.tsx,GameScoreboard.tsx,QuizGame.tsx,CardGame.tsx}`, `e2e/party.spec.ts`, este relatório, `docs/GAME_DESIGN_SYSTEM.md` e instruções de agente.

## DEPENDENCIES

Nenhuma.

## MIGRATIONS

Nenhuma.

## KNOWN_LIMITATIONS

Não é GX4.2–GX4.4: não reimagina canvas/quiz/cartas. Sem QA em Android/iOS físico, WAN, Google real ou PostgreSQL local. O canvas de Draw fica reduzido em 320px com teclado virtual aberto, embora visível no fixture; avaliar ergonomia em aparelho real. Paleta/tipografia ainda precisam conferência humana de contraste em aparelho real.

## GX4_2_HANDOFF

Reusar shell/HUD/timer/lobby/action/result em Draw V4. Manter canvas 4:3 e segredo na projeção individual; tratar espaço do canvas versus Chat com QA mobile real.

## GX4_3_HANDOFF

Reusar o stage/scoreboard sem trazer resposta correta ao DOM antes de REVEAL; preservar answer lock e deadline do servidor.

## GX4_4_HANDOFF

Reusar o stage/faixa de participantes; mão e legalCardIds somente na projeção própria, sem deck/seed no cliente.

## MANUAL_QA_REQUIRED

Android/iOS real (320–430px), teclado virtual, safe area/notch, VoiceOver/TalkBack, Call/Chat/share sob conexão WAN, confirmação visual de foco/contraste, duas ou três contas autorizadas.

## RESPOSTAS OBRIGATÓRIAS (1–110)

1. Hub com espaço morto e cartões comprimidos; HUD/placar/lobby variavam entre games.
2. Game first, Party única, composição visual, autoridade no servidor e projeção privada.
3. Os 11 tokens `--game-*` listados em TOKENS.
4. Paleta escura, fonte Inter, botões primários, foco e safe areas existentes da Party.
5. Menta/verde identifica o modo e a ação; não substitui texto de estado.
6. Menta=Draw/ação; Maré=Quiz; Âmbar=aviso; Ameixa=Cartas.
7. Título > status > metadado; números tabulares para tempo/pontos.
8. Escala 4/8/12/16/24px e padding compacto no mobile.
9. Painéis de raio 16px, borda visível, elevação sutil.
10. Hover curto de 160ms, sem espetáculo de animação.
11. Sim, transições do catálogo são removidas; animações anteriores já tinham media query.
12. `GameShell` em `apps/web/src/games/GameDesignSystem.tsx`.
13. Não.
14. Não.
15. Não; recebe conteúdo e identidade visual.
16. É uma superfície composável para conteúdo do jogo.
17. Sim; Quiz e Cartas o usam com DOM.
18. Sim; Draw o usa em torno do canvas 4:3 existente.
19. Superfície pode receber um canvas futuro sem alterar contrato, mas WebGL não foi implementado.
20. Não.
21. Cabeçalho comum recebe conteúdo específico do game.
22. Reduz padding, fonte e altura; preserva status/tempo.
23. Valor tabular com rótulo acessível, `Ns` ou `m:ss`.
24. Não; recebe segundos do jogo, derivados da projeção do servidor.
25. Valor/texto permanecem; âmbar complementa o aviso visual de tempo curto.
26. Texto visível no HUD; `GamePhase` é usado no Hub.
27. Cartas mostra “Sua vez”/“Vez de …” e destaca participante ativo.
28. Draw `score/target`, Quiz pontos, Cartas contagem de mão; todos projetados.
29. Draw flexível/compacto, Quiz lista vertical; sem nova inferência de ranking.
30. Cartas mostra faixa horizontal; Draw/Quiz mostram listas de placar.
31. Sim, são dados distintos e não foram fundidos.
32. Texto “você” no nome, além de destaque visual.
33. `GameLobby` compõe Draw; status e ações foram alinhados nos três.
34. Reuso de fieldset, select e `aria-pressed` existentes; nenhuma nova API de settings.
35. Primária verde, secundária contornada, danger apenas na confirmação existente de encerrar.
36. Os botões de ícone existentes mantêm `aria-label` e foco visível.
37. Escolha secreta/confirmar ação destrutiva; não para navegação trivial.
38. Painéis secundários continuam os da Party; nenhum sheet/popover novo.
39. Draw conserva resultado de rodada textual e ganho vindo do servidor.
40. `GameResult` moldura comum para vencedores projetados.
41. Apenas destaque estático de resultado; nenhuma celebração animada nova.
42. Sim, não há celebração animada nova; motion legado respeita media query.
43. Quiz exibe “Você acertou/errou” e `✓ Correta`, além da borda.
44. `busy`/disabled dos games existentes bloqueia comandos durante ack.
45. Mensagem de erro em `role=alert`, sem sucesso otimista.
46. Aviso persistente de reconexão e controles bloqueados até snapshot.
47. Fallback de Suspense e mensagens “Abrindo…” existentes; sem indicador enganoso.
48. Catálogo 3/2/1 colunas com descrição, faixa e identidade visual coerente.
49. Não; geometria, canvas, toolbar e regras são os mesmos.
50. Não; perguntas, alternativas, answer lock e placar permanecem.
51. Não; mão, descarte, turno e confirmação permanecem.
52. Shell, HUD, Stage, Timer, Lobby, ActionBar, Result.
53. Shell, HUD, Timer, Stage, ActionBar, Result.
54. Shell, HUD, Timer, Stage, ActionBar, Result e faixa de participantes.
55. Canvas/toolbars; pergunta/alternativas; mão/mesa/cor/turno, respectivamente.
56. Não.
57. Não.
58. Não.
59. Não.
60. Não.
61. Sim; secretWord/choices só na projeção do desenhista.
62. Sim; ownAnswer e reveal seguem a projeção individual/fase.
63. Sim; myHand/legalCardIds/myPending só na projeção própria.
64. Não foi introduzido estado privado escondido no DOM; DOM renderiza apenas a projeção autorizada.
65. Não foi acrescentada escrita em logs/storage.
66. Sim; nenhum arquivo RTC/Call alterado.
67. Sim; nenhum Chat/composer novo.
68. Sim; nenhum arquivo de share alterado.
69. Formato de rotas não mudou; só a navegação visual/tecla Escape passou a respeitar o seletor da Party.
70. Sim; `GamesExperienceStage` segue sem Media provider.
71. Não.
72. Não.
73. Não.
74. Testes de regressão individuais G2/GX3 passaram após a alteração de navegação; ver resultado completo em E2E.
75. Mesmo Chat Party adjacente, sem composer duplicado; stage usa espaço próprio.
76. Call Party é persistente e externa à árvore visual dos games.
77. Screen share continua Party-scoped e fora dos novos componentes.
78. E2E verifica 320/360/375/390/412/430 em cenários de game; capturas finais abertas em 320/390/1440 e paisagem.
79. Sim no Hub 320/390 e nos jogos inspecionados; QA físico ainda pendente.
80. Parcial em E2E preexistente; Android/iOS físico pendente.
81. CSS fullscreen paisagem preservado; Cartas e Quiz inspecionados, com compactação adicional do HUD Quiz.
82. Safe areas do palco/fullscreen Party foram mantidas, não reimplementadas.
83. Alvos dos botões existentes e novos são ≥44px nas regras mobile.
84. Não foi criada fixture visual de 12; teste manual/stress pendente.
85. Não foi criada fixture específica; nomes usam wrapping/ellipsis onde existente.
86. Não há fixture visual de score extremo nesta etapa; numerais tabulares/área flexível mitigam.
87. Teste unitário verifica zero/NaN; captura crítica de 5s pendente.
88. Sim, E2E gera screenshots locais; não são dados de produção.
89. Baseline: Hub desktop/320, Draw lobby/guesser, Quiz lobby/question, Cards lobby/table (nomes em CURRENT_GAME_UI_AUDIT). Capturas finais listadas em VISUAL_QA.
90. Hub comprimido em 320; espaço vazio desktop; hierarquia desigual de lobby/HUD/placar.
91. Catálogo 1 coluna em largura estreita; HUD, action bar, result e stage alinhados nas capturas finais.
92. Baseline por teste semântico e revisão de foco/rotulagem; leitor de tela real pendente.
93. Foco visível por CSS; fluxo de foco dos diálogos preexistente. QA manual de teclado pendente.
94. Sim; timer não cria `aria-live` a cada tick.
95. Não foi medida regressão de FPS; bundle foi medido, runtime compartilhado é puro.
96. Não.
97. Não.
98. Não; Docker daemon local indisponível.
99. Sim; `npm run typecheck` passou no estado final.
100. Sim; `npm run lint` passou no estado final.
101. Sim; `npm run build` passou no estado final.
102. Sim; `npm test` passou em execução serial no estado final.
103. Servidor 136 pass/0 fail/6 skip; web 35 pass/0 fail; SW 4 pass/0 fail. Skips incluem integração PostgreSQL sem daemon local.
104. Baseline 15/16 com timeout mobile; rodada final GX4.1 16/16.
105. E2E final 16 cenários, todos passaram.
106. G2 teve uma comparação de pixels intermitente na primeira rodada; passou isolado e na rodada final sem mudança de lógica. Teste unitário do servidor falhou uma vez em execução paralela de gates e passou serialmente; causa não determinada.
107. Sim; GX3 unit e E2E (Drive e dois clientes) passaram.
108. Sim; RTC unit e E2E de três clientes passaram.
109. Shell/HUD/Stage/Timer/Lobby/ActionBar/Result, tokens e layout responsivo.
110. Sim em nível de componentes e gates locais; QA físico/WAN/PostgreSQL permanece requisito externo antes de release hospedado.

## FINAL_VERDICT

GX4.1 READY TO FREEZE — GX4.2 READY
