# Lumio — GX4.2 Draw V4

## STATUS
Implementação local concluída para revisão. Sem commit, push ou deploy. Veredito condicionado ao QA manual em aparelhos físicos e às lacunas de estresse registradas abaixo.

## BASELINE
Typecheck, lint, build e testes locais passavam antes da intervenção. E2E baseline: 15/16; M1 seek falhou uma vez e passou isoladamente sem mudança de código. Não atribuído ao Draw.

## WORKTREE
Trabalho restrito ao cliente Draw, chat móvel e teste E2E. Os PNGs rastreados de `artifacts/gx3` regenerados pelo Playwright foram restaurados ao estado inicial; nenhuma alteração preexistente do usuário foi descartada.

## DRAW_V3_AUDIT
Runtime já autoritativo no servidor: lobby, fases, turno, escolhas privadas, timeout, pontuação, undo, clear, revision, reconexão e 800×600. GX4.2 não muda protocolo.

## BASELINE_VISUAL_QA
Capturas abertas: `g2-lobby-desktop`, `g2-drawer-mobile`, `g2-guesser-mobile`, `g2-round-result`, `g2-game-result`, `g3-theme-choice`, `g3-guesser-keyboard`, `g6-draw-guesser-desktop`, `g3-drawer-landscape`.

## UX_PROBLEMS_FOUND
Canvas pequeno/cortado para guesser, painel de chat desproporcional em algumas alturas, ações destrutivas próximas às comuns, HUD sem papel explícito, placar competindo com o canvas, resultado/word choice pouco característicos. Na segunda passada, saída do jogo móvel estava oculta e placar cobria o round result em paisagem; ambos corrigidos.

## DESIGN_DIRECTION
Mesa de desenho clara em contraste com a superfície escura, HUD verde compacto, canvas protagonista, ferramentas de apoio, placar sob demanda no móvel, sem alterar identidade dos outros jogos.

## DRAW_V4_ARCHITECTURE
`DrawGame` faz composição e projeta papel/estado; `DrawCanvas` mantém pintura imperativa e toolbar separada; `drawV4.css` contém o layout específico. O servidor permanece fonte de verdade.

## GX4_1_REUSE
`GameShell`, `GameStage`, `GameHud`, `GameTimer`, `GameLobby`, `GameResult`, `GameActionBar` reutilizados. Nenhum contrato/primitiva compartilhada evoluiu; Quiz e Cards não foram modificados.

## ROLE_ADAPTIVE_LAYOUT
Drawer recebe canvas maior, palavra secreta e ferramentas. Guesser recebe pista mascarada, canvas menor, composer de palpite e chat. Observador é identificado no HUD sem controles de desenho.

## DRAWER_EXPERIENCE
Palavra em destaque, ferramenta ativa por contorno e `aria-pressed`, paleta nomeada, tamanho e desfazer, limpeza confirmada. Saída do jogo permanece acessível no cabeçalho ativo.

## GUESSER_EXPERIENCE
Pista e canvas visíveis com chat/composer estrutural único; conversa pode ser expandida. Palpite correto recebe feedback do estado projetado.

## SPECTATOR_EXPERIENCE
HUD “Acompanhando” e canvas somente leitura. Não foi criado um segundo composer.

## CANVAS
Canvas lógico 800×600, pintura local imediata e reconstrução por strokes autoritativos. A superfície foi separada da toolbar em irmãos de layout.

## CANVAS_SCALING
Aspect ratio 4:3 preservado. G3 E2E mediu, em 320–430 px, drawer ~217,5–300 px de altura e guesser ~169,5–252 px, sempre com drawer >8% maior.

## DPR
Canvas lógico permanece 800×600; não houve ajuste de DPR. Emulação/inspeção não substitui teste em telas físicas de alta densidade para nitidez.

## POINTER_INPUT
Pointer mapping normalizado existente preservado; E2E desenha por touch CDP, borracha por mouse, compara pixels entre clientes. Pointer cancel não recebeu caso novo dedicado.

## TOUCH_INPUT
`touch-action:none` no canvas, pointer capture e desenho testados em emulação móvel. Teste físico ainda pendente.

## STYLUS
Pointer Events aceitam caneta por design; pressão variável não implementada nem validada em hardware.

## TOOLBAR
Desktop: coluna auxiliar. Móvel: faixa compacta abaixo da mesa; em paisagem: coluna lateral. Clear tem grupo/estilo próprio e confirmação.

## COLOR_PALETTE
Sete cores existentes: grafite, marfim, verde, vermelho, amarelo, azul e violeta. Sem cor personalizada.

## BRUSH_SIZE
Fina, média e grossa; seletor acessível e prévia visual local. Valores/protocolo preservados.

## ERASER
Borracha usa stroke existente e sincroniza pelo mesmo fluxo autoritativo; nenhuma semântica nova.

## UNDO
Servidor aplica undo; Ctrl/Cmd+Z preservado e E2E verifica contra outro cliente. Campo de texto mantém edição nativa.

## CLEAR
Confirmação explícita; botão distinto. Durante confirmação aguarda ACK; em rejeição pede resync.

## SHORTCUTS
Ctrl/Cmd+Z de desenho apenas em contexto elegível; teste cobre não afetar palpite.

## SECRET_WORD
Somente drawer recebe `secretWord`/choices; guesser recebe maskedWord. E2E confere que `.draw-word` de terceiros não contém a palavra; isolamento de projeção também coberto em testes de servidor. Auditoria dedicada de todos os atributos acessíveis, storage e logs ainda pendente.

## WORD_CHOICE
Diálogo com foco inicial e ciclo de Tab, três opções privadas, cartões maiores e limite de tempo mantido no servidor.

## GUESS_HINT
Exibe `maskedWord` projetado pelo servidor. Nenhum cálculo client-side do segredo.

## DRAW_HUD
Papel, rodada, desenhista, tema, meta, timer, pontuação/classificação e bônus. Saída fica no HUD.

## TIMER
`GameTimer` existente mostra tempo derivado do snapshot/offset; não decide fim de rodada.

## SCORE_TARGET
Metas 50/100/150/200 e validação do servidor preservadas.

## SCOREBOARD
Desktop no contexto lateral. Móvel via botão “Placar · N jogadores”; não encobre automaticamente o resultado de rodada.

## PARTICIPANTS
Limite runtime 2–12 preservado. Nomes longos truncados visualmente com `text-overflow`; não foi feita fixture visual de 12 nem score extremo em GX4.2.

## GUESS_FLOW
Composer existente envia `game:action/guess`; Chat envia `chat:message`. Palpites errados aparecem como evento de jogo, não como Chat comum.

## GUESS_COMPOSER
Único composer preservado, integrado ao chat móvel; entrada disponível no retrato, teste de teclado 390×500 e 320×568.

## PARTY_CHAT_BOUNDARY
Sem cópia de Chat. Toggle de conversa no cabeçalho móvel altera apenas a apresentação; drafts/nó do chat sobrevivem à troca de papel no E2E.

## GUESS_FEEDBACK
Estado de acerto, bônus e posição são exibidos conforme snapshot; sem cálculo local de score.

## DRAWER_FEEDBACK
Acertos de outros aparecem em eventos e resultado; bônus do desenho no HUD.

## ROUND_RESULT
Palavra revelada e acertos preservados; painel lateral compacto em paisagem. Duração não alterada.

## GAME_RESULT
Vencedor/empate, pontos, classificação e revanche no layout renovado; `rematch` permanece autoritativo.

## LOBBY
Introdução visual própria e configuração existente. Host, mínimo e participação preservados.

## TARGET_CONTROL
Mesmos quatro alvos, `aria-pressed`; somente host habilitado.

## THEME_CONTROL
Mesmo seletor/temas; não houve alteração no banco de palavras.

## RECONNECT
Aviso existente, canvas não desmontado e board persistente; G2 E2E desconecta/reconecta drawer e recarrega guesser.

## DRAWER_GRACE
Janela de 5 s permanece no servidor; não alterada. Testes de servidor cobrem expiração/troca de coordenador.

## STROKE_BATCHING
Mesmo limite de 32 pontos ou ~50 ms, com pintura local imediata e deltas socket. Wire format intacto.

## CANVAS_PERFORMANCE
Pintura em contexto 2D/ref; ticker do HUD não redesenha pixels. Benchmark WAN/120 Hz/caneta não realizado.

## MOBILE
Medidas E2E 320, 360, 375, 390, 412 e 430 px. 320×568 adicional capturado. Em altura curta a navegação do Game Hub é recolhida durante rodada para caber mesa/composer.

## MOBILE_KEYBOARD
390×500 com foco mantém palpite e canvas dentro do stage; chat `.messages` >65 px. Teclado real iOS/Android pendente.

## LANDSCAPE
Canvas e toolbar em colunas; resultado lateral. Fullscreen 844×390 conferido no E2E e screenshot.

## FULLSCREEN
Canvas/Chat de jogo mantidos; testes entram e saem de fullscreen retrato/paisagem.

## SAFE_AREAS
Estrutura herdada do Party; nenhum aparelho com notch foi testado.

## ACCESSIBILITY
Canvas, grupos de ferramentas e swatches têm nomes; estados usam `aria-pressed`; word choice tem foco e wrap. Ainda falta auditoria completa de leitor de tela e zoom 200%.

## REDUCED_MOTION
CSS desliga animações específicas do Draw para `prefers-reduced-motion`; mudança de timer crítico não foi exercitada com emulação dedicada.

## PRIVACY
Nenhum novo log/storage ou atributo contendo segredo foi introduzido. Projeção autoritativa/testes existentes preservados.

## CALL_CHAT_SHARE
G2/G3 e suíte E2E cobrem Chat/Call/Share sem regressão observada; GX4.2 não altera esses serviços.

## GX3_REGRESSION
Rotas e separação Media/Games passaram na suíte completa.

## GX4_1_REGRESSION
Quiz, Cards, componentes comuns e estilos compartilhados não editados; seus cenários E2E passaram.

## MEDIA_REGRESSION
M1/M2/M3, Drive e troca Media/Games passaram na suíte E2E final (16/16).

## MULTI_CLIENT
G2 e G3 rodaram com A/B/C reais, sincronização de strokes, escolha privada, chat, reconnect, rotação e rematch.

## VISUAL_STRESS_QA
Capturas finais abertas: word choice, drawer/guesser retrato, teclado, paisagem, round result e game result; 320×568 drawer/guesser adicionais. 12 participantes, nomes longos, pontuações extremas e zoom 200% não receberam fixture dedicada.

## FINAL_VISUAL_QA
Segunda passada corrigiu saída oculta e placar sobre o round result. 320×568 revelou paleta cortada; CSS final recolhe navegação na altura curta. A captura final 320×568 foi reaberta após E2E G3: canvas, paleta, HUD e saída cabem no drawer; canvas, chat e composer cabem no guesser.

## PERFORMANCE
Build Draw lazy: 20,43 kB bruto/7,20 kB gzip; CSS total 193,69 kB bruto/34,00 kB gzip. Sem métrica WAN/p95, não afirmar ganho quantitativo.

## POSTGRESQL
Não executado: tarefa é cliente/layout e não houve migration. Testes PostgreSQL condicionais permanecem skip no ambiente.

## TESTS
Typecheck, lint, build passaram. `npm test`: servidor 136 pass/6 skip, web 35 pass, SW 4 pass; 175 pass, 0 fail, 6 skip no total.

## E2E
Suíte completa: 16/16. Após ajustes de layout, G2+G3 direcionados: 2/2; após a última regra para viewport curto, G3 novamente: 1/1. Cenário G3 adicional mede 320×568. A suíte completa antecede apenas essa última regra CSS local.

## FLAKY_TESTS
Baseline M1 seek: 1 falha inicial, isolado e suíte final passaram. G2 atingiu timeout por botão de saída oculto no primeiro redesenho; causa corrigida, não classificado como flake.

## FILES_CHANGED
`apps/web/src/games/DrawGame.tsx`, `DrawCanvas.tsx`, `drawV4.css`, `apps/web/src/components/MobilePartyChat.tsx`, `apps/web/src/main.tsx`, `e2e/party.spec.ts`, este relatório.

## DEPENDENCIES
Nenhuma.

## MIGRATIONS
Nenhuma.

## KNOWN_LIMITATIONS
Sem dispositivo real, stylus/pressão, leitor de tela, zoom 200%, stress visual 12 jogadores/nomes/score extremo. Em 320×568, a mesa do guesser é menor que a do drawer por intenção; a paleta requer conferência final após regra de viewport curto.

## GX4_3_HANDOFF
Não iniciar GX4.3 até encerrar QA de GX4.2. Runtime/game state não mudaram, portanto a próxima etapa pode partir dos contratos G3/GX4.1 existentes.

## MANUAL_QA_REQUIRED
iPhone Safari e Android Chrome: toque/caneta, teclado real, fullscreen paisagem, safe area, zoom, VoiceOver/TalkBack, paleta em 320×568, rede instável e 12 participantes.

## FINAL_VERDICT
Implementação funcional e regressão automatizada verde; congelamento ainda exige validação física e fixtures de stress/acessibilidade abaixo.

## Respostas obrigatórias 1–120
1. Canvas pequeno/cortado, hierarquia fraca, toolbar arriscada, resultado genérico.
2. Nove capturas baseline listadas acima.
3. Canvas central, HUD compacto, toolbar/placar auxiliares.
4. Sim para drawer; guesser equilibra canvas e chat.
5. Palavra/ferramentas/canvas maior versus pista/composer/chat.
6. Sim; HUD “Acompanhando”, canvas só leitura.
7. Sim.
8. GameShell, GameStage, GameHud, GameTimer, GameLobby, GameResult, GameActionBar.
9. Não.
10. Não; E2E Quiz/Cards passaram.
11. Sim, 800×600.
12. Sim, 4:3.
13. Não.
14. Não.
15. 32 pontos ou cerca de 50 ms.
16. Não.
17. Desenho touch/mouse e comparação de pixels A/B/C no E2E.
18. Sim, como limitação; raster lógico não foi alterado.
19. Não houve correção de blur; validar em dispositivo HiDPI.
20. Sim em emulação.
21. `touch-action:none` no canvas; físico pendente.
22. Código preservado; caso dedicado não executado.
23. Um pointer ativo por vez; teste multitouch dedicado pendente.
24. Por Pointer Events; hardware não validado.
25. Não.
26. Sim, apresentação e grupos; sem novo protocolo.
27. Canvas à esquerda, toolbar/placar à direita.
28. Toolbar sob canvas; lateral na paisagem.
29. Contorno, check e `aria-pressed`.
30. Grafite, marfim, verde, vermelho, amarelo, azul, violeta.
31. Não.
32. Select fina/média/grossa e prévia visual.
33. Não.
34. Sim, mesmo stream de stroke; E2E.
35. Não observado na suíte final.
36. Não aplicável; baseline M1 é distinto.
37. Sim.
38. Sim.
39. Sim.
40. Sim, grupo e visual de risco.
41. Sim, por projeção do servidor.
42. `.draw-word` no E2E; varredura completa pendente.
43. Nomes novos são estáticos; auditoria de árvore acessível inteira pendente.
44. Não houve persistência/log novo; auditoria instrumentada pendente.
45. Sim, projeção privada e E2E.
46. Sim.
47. Sim.
48. `maskedWord` do servidor.
49. Não.
50. Papel, rodada, drawer, tema/meta, timer, score/posição, bônus.
51. Sim.
52. Não; servidor é autoridade.
53. Capturas de resultado, não timer crítico.
54. CSS reduz movimento; transição crítica não testada.
55. Não.
56. Não.
57. Não.
58. Sim, apresentação e toggle móvel.
59. Scroll/nomes truncados previstos; visual com 12 não testado.
60. Não.
61. Não com fixture dedicada.
62. Não com fixture dedicada.
63. Nome no HUD e marcador no placar.
64. Indicador “Acertou” no placar.
65. Aviso de reconexão; status existente.
66. Layout/visibilidade; lógica não.
67. Sim.
68. Sim.
69. Não.
70. Estado “Você acertou” e pontos no HUD.
71. Sim, eventos/round result/bônus.
72. Não.
73. Sim, painel mais compacto.
74. Não.
75. Sim.
76. Sim.
77. Sim.
78. Aparência/pressed; opções iguais.
79. Aparência; temas iguais.
80. Não.
81. Não.
82. Navegação existente; voltar ao Hub não foi reescrito como `game:leave`.
83. Sim.
84. Sim no G2.
85. Sim, reload no G2.
86. Testes de servidor existentes cobrem revisões/stale; sem mudança.
87. React pode atualizar HUD; pixels não são reconstruídos pelo timer.
88. Speaking não altera a pintura 2D; sem benchmark específico.
89. Não observado; sem métrica de latência WAN.
90. Utilizável na emulação; físico pendente.
91. 320×844: drawer ~290×217,5; guesser ~226×169,5; 320×568 ver screenshot.
92. Sim, 390×500 emulação.
93. Sim, E2E.
94. Sim.
95. Não no drawer; no guesser divide espaço e pode expandir.
96. Sim, 844×390.
97. Sim.
98. Apenas por CSS herdado; hardware pendente.
99. Ferramentas principais ≥44 px; auditoria de todos os alvos pendente.
100. Sim.
101. Sim.
102. Sim, `aria-pressed` e check/contorno.
103. Foco do diálogo e Tab em E2E; leitor de tela pendente.
104. Não.
105. Pelo menos nove baseline e oito finais foram abertas.
106. Sim.
107. Saída oculta, placar sobreposto, paleta cortada em viewport baixo.
108. Saída no HUD, placar sob demanda, nav recolhida em altura curta.
109. Sim, G2/G3.
110. Sim nos testes de projeção e DOM `.draw-word`.
111. Não nos cenários E2E executados.
112. Sim.
113. Sim.
114. Não.
115. Não.
116. Não.
117. Sim.
118. 175 pass/0 fail/6 skip.
119. Sim, 16/16 suíte e 2/2 direcionados.
120. iOS/Android físico, caneta/pressão, notch, teclado, leitor de tela, zoom e stress 12 jogadores.

GX4.2 REQUIRES REVISION
