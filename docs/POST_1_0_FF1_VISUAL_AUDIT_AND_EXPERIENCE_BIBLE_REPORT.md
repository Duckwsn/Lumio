# PÓS-1.0 — FF1 Visual Audit & Experience Bible

## STATUS

Direção e seis artefatos documentais produzidos. Freeze **não liberado**: inspeção visual autenticada incompleta. Typecheck, lint e build passaram. Não houve mudança de produção, dependência, migration, commit, push ou deploy.

## EXECUTIVE_SUMMARY

Lumio deve ser uma Party centrada na atividade compartilhada, com camada social contínua porém contextual. O problema estrutural mais comprovado é misturar ownership de Media em Games: `Now Playing`, Fila e `Adicionar mídia` aparecem no JSX de Party sem guarda de experiência (`apps/web/src/App.tsx:832-860`). O Draw também compõe feed local e painel social potencialmente simultâneos (`App.tsx:838`, `DrawGame.tsx:89-92`; captura fixture desktop). A landing visitante preserva forte personalidade graphite/mint; não há motivo para rebranding.

## WHY_FRONTFIX_EXISTS

As etapas funcionais criaram rotas e runtime robustos, mas incrementos visuais acumularam cards, bordas, headers, dock e CSS sobreposto. O objetivo FF1 é direção e contratos; não redesign agora. Fontes factuais em `docs/frontfix/FF1_VISUAL_AUDIT.md`.

## WORKTREE_BASELINE

Branch `master`, `git status --short` limpo antes da documentação; `git diff --stat` vazio. Ao final, apenas sete arquivos `.md` novos são esperados (seis em `docs/frontfix/` e este relatório); nenhum arquivo de produção foi modificado.

## REPOSITORY_AUDIT

Documentos históricos consultados: `docs/ENTRY_FLOW.md`, `docs/SOCIAL_ARCHITECTURE.md`, `docs/AGENT.MD`, `docs/CLAUDE.MD`; código atual prevalece onde documentos antigos descrevem persistência em memória ou split chat. Componentes principais: `App.tsx`, `HousesHome.tsx`, `PartyStages.tsx`, `GameHub.tsx`, `DrawGame.tsx`, `QuizGame.tsx`, `CardGame.tsx`, `MediaStage.tsx`, `MobilePartyChat.tsx`, `AccountPage.tsx`, `styles.css`, `drawV4.css`.

## ROUTE_MAP

`/` Landing; `/login` e `/register` entrada; `/app` Home; `/account` conta; `/house/:id/media` Media; `/house/:id/games` Games; `/house/:id` alias Media; `/invite/:token` convite. Media/Games compartilham Party/call/chat (`docs/ENTRY_FLOW.md`, `App.tsx:782-839`).

## COMPONENT_OWNERSHIP

Core: marca/tokens/navegação. Social: People/Chat/Call/Screen Share. Media: player/Queue/Now Playing/Add Media/Library. Games: Hub/fase/placar/ferramentas. Utility: conta/configurações. Dados compartilhados não obrigam UI permanentemente compartilhada. Matriz completa na Bíblia.

## CURRENT_VISUAL_SYSTEM

`styles.css:1-16` define Inter, graphite, mint, foco e seleção. Draw adiciona papel claro e tokens locais (`drawV4.css:2`). Há valor no contraste palco escuro/quadro claro, mas regras gerais antigas de Draw em `styles.css:1054-1108` coexistem com overrides V4.

## SCREENSHOT_AUDIT

Navegador nativo: landing desktop (~900×740) e mobile 390×844; login mobile 390×844. Artefatos de QA abertos: Draw 320×568, 390×844, 844×390, 1440×900; Games Hub 1440 e Media 390 de etapa anterior. A matriz separa `OBS`, `HIST` e `PEND`; não existem screenshots atuais autenticadas de Home/Party/Quiz/Cards/Settings. Ver `docs/frontfix/SCREENSHOT_MATRIX.md`.

## HOME_FINDINGS

Código atual mostra cards de Casa com status, preview de membros e dois CTAs (`HousesHome.tsx:48-59`). Risco de gerenciador de grupos; sem screenshot atual, a intensidade visual é hipótese. FF2 deve fazer atividade da Casa ser primeiro sinal, preservando criar/convite e status autorizado.

## PARTY_FINDINGS

Header, seletor, drawer e dock são do Shell (`App.tsx:813-862`). O menu Casa contém ações Media mesmo em Games (`App.tsx:816`); o dock também (`:859-860`). A composição atual pode competir com palco, sobretudo em 320px.

## MEDIA_FINDINGS

Player possui controles por capacidade e provider (`MediaStage.tsx`), MediaStage só monta na rota Media (`App.tsx:829`). Falta screenshot atual de vídeo/ambient e teste de longa sessão. FF4 deve contextualizar Queue e Now Playing sem mudar sincronização.

## SOCIAL_FINDINGS

Drawer permite Chat/Pessoas/Fila (`App.tsx:838`); mobile chat tem ações People/Queue/Add (`MobilePartyChat.tsx:19-21`). O fluxo social deve persistir nos jogos; sua presença visual precisa ser uma borda contextual, não painel concorrente. Duplicação no Draw aparece no fixture desktop.

## GAMES_FINDINGS

Hub usa catálogo de três opções em cartões (`GameHub.tsx:41`); a captura GX3 antiga ilustra dashboard, mas não prova versão atual. Ações Media incondicionais no Shell são fato atual. FF5 compõe cada jogo como palco próprio.

## DRAW_CASE_STUDY

Fixtures GX4.2.2 mostram quadro forte e feed de chat/palpites juntos, melhoria real. Problemas: HUD/breadcrumb + feed comprimem 320×568; em paisagem quadro extrapola o recorte; desktop fixture mantém `Chat da Party` separado e grande vazio. Código `DrawGame.tsx:65-92`, `drawV4.css:36-112,134-234`. GX4.2.3, após FF6, trata geometria e imersão sem alterar regras do jogo.

## QUIZ_FINDINGS

Código: `QuizGame.tsx:38-54` põe pergunta/alternativas e timer em `GameShell`, com configuração/resultado por fase. Sem captura visual atual. FF5 deve dar prioridade à pergunta; GX4.3 V2 fica após GX4.2.3.

## CARDS_FINDINGS

Código: `CardGame.tsx:45-60` separa mesa, mão privada e ações de turno. Sem captura visual atual. FF5 precisa priorizar mesa/mão e preservar projeção privada.

## MOBILE_FINDINGS

Landing 390 compõe coluna única. Draw fixture 320 apresenta quadro legível, mas topo/feed reduzem área e swatches V4 têm 22px (`drawV4.css:81-83`) apesar do mínimo global maior. Paisagem 844×390 pede QA de canvas e scroll. Não declarar mobile completo sem teclado real, safe area e standalone.

## PWA_FINDINGS

Landing fornece instrução de instalação. No browser observado, toast “Nova versão” ocupou a parte inferior das capturas mobile. PWA não promete Party offline (`docs/ENTRY_FLOW.md`). Revisar posição/prioridade do aviso em FF6, preservando atualização segura.

## SETTINGS_FINDINGS

`AccountPage.tsx` distingue Google Login de Drive e usa formulários. Sem captura autenticada; Utility pode aceitar boxes/forms, mas não deve contaminar linguagem de entretenimento.

## LANDING_FINDINGS

Screenshot observado: hero editorial, preview ilustrativo e CTAs claros; graphite/mint reconhecíveis sem rebranding. No mobile, a preview entra após primeira dobra. O aviso PWA é o principal ruído observado.

## AUTH_FINDINGS

Login 390 observado anuncia Google, mas widget não apareceu visivelmente no screenshot enquanto DOM indicava região `Continuar com Google`. Causa indeterminada; repetir em browser autorizado antes de registrar bug. Formulário de senha visível.

## DASHBOARD_ROOT_CAUSES

Camadas de chrome simultâneas; cards universais; metadados permanentes; ownership misturado; headers/breadcrumbs de Shell+Game. Evidência atual em código e fixtures, não em todas as telas de produção.

## VISUAL_FATIGUE_ROOT_CAUSES

Contornos e superfícies repetidos, múltiplos acentos mint, microtexto, controles sempre presentes e concorrência com mídia/quadro. Isso é hipótese fundamentada para QA humano de longa sessão, não métrica medida.

## GENERIC_AI_UI_RISKS

Trocar para tiles genéricos, KPIs, gradientes neon, glassmorphism ou clone de streaming resolveria pouco e diluiria identidade. Bíblia exige atividades concretas e ownership por camada.

## VISUAL_KEEP_LIST

Logo, Inter, graphite/mint, Casa/Party, palcos por rota, continuidade call/chat, sincronização/media adapters, feed unificado de Draw, quadro papel claro, foco/semântica, privacidade Cards, Google Login separado de Drive.

## REMOVE_EVOLVE_KEEP_MATRIX

Remove em fases: duplicação de chat/chrome, CSS legado quando substituído. Evolui: Home cards, dock, Game Hub, mobile overlays, tipografia/contraste. Mantém: identidade, runtime, rotas, capacidades provider, protocolos e dados.

## SHARED_PRIMITIVES_AUDIT

`GameDesignSystem.tsx` dá Shell/HUD/Stage/Timer/Result; útil para semântica de fase, mas não deve impor o mesmo card/layout aos três jogos. `styles.css` traz botões, foco e tokens. FF2 cria slots semânticos; FF6 remove duplicatas.

## CSS_ARCHITECTURE_AUDIT

Há arquivo global volumoso e `drawV4.css` específico com seletores `:has` e heights por viewport. Migração: tokens → slots → escopo por experiência → remoção seletiva do legado → consolidação de breakpoints. Evitar big-bang.

## TOKEN_AUDIT

Tokens raiz servem de base; valores locais de Draw são justificáveis no papel/quadro, mas devem apontar para semântica (`stage`, `edge`, `paper`, `focus`, `danger`) em vez de números repetidos. Contraste ainda requer teste empírico.

## EXPERIENCE_OWNERSHIP_MATRIX

Core: brand/selector/saída; Social: People/Chat/Call/share; Media: Queue/Add/Now Playing/player; Games: Hub/score/tools; Utility: conta/settings. Ver matriz de camada na Bíblia.

## PERMANENT_CONTEXTUAL_MATRIX

Permanente mínimo: Casa, seletor, acesso social. Media controls só em Media; Game HUD só em Games; People/Queue/settings por sheet/drawer ou quando ativos. Matriz por estado na Bíblia.

## TARGET_EXPERIENCE_MODEL

Palco central + borda social contextual + camadas de tarefa temporárias. Casa viva dá chegada; Media é assistir/ouvir; Games é jogar. Diagramas CURRENT→TARGET para seis superfícies na Bíblia.

## EXPERIENCE_BIBLE_SUMMARY

34 seções cobrindo identidade, camadas, superfícies, cards, chrome, controles, mobile/PWA, acessibilidade, migração e QA. Documento principal: `docs/frontfix/LUMIO_EXPERIENCE_BIBLE.md`.

## VISUAL_CONSTITUTION_SUMMARY

32 regras MUST/MUST NOT em `docs/frontfix/VISUAL_CONSTITUTION.md`; proíbe chrome Media em Games, chat duplicado, cards universais, microtexto compensatório e screenshots históricos apresentados como atuais.

## FF2_CONTRACT

Core/Shell/Home, tokens e slots; aceitação com Home em múltiplos estados, Party/rotas, 320–1440 e continuidade de sessão. Ver roadmap.

## FF3_CONTRACT

Social edge/People/Chat/Call/share e overlays, sem mudar signaling. Um fluxo de chat e call contínua entre rotas.

## FF4_CONTRACT

Media stage/player/Queue/Ambient/contexto móvel, mantendo provider/sync/grants. Goldens vídeo/ambient/erro.

## FF5_CONTRACT

Game Hub, shell e HUD por fase; Draw/Quiz/Cards no palco, sem Media chrome; sem alterar game runtime.

## FF6_CONTRACT

Responsividade, teclado/safe areas, motion, CSS legado, a11y, PWA e regressão visual. Gate humano + técnico.

## GX4_2_3_HANDOFF

Depois de FF6, Draw-specific imersivo: quadro/proporção, drawer tools, guesser/composer, 320px/paisagem/fullscreen. Herda slots/tokens; GX4.3 Quiz V2 depois.

## RISKS

Principal: refatoração visual desmontar provider/call ou duplicar streams. Outros: captura histórica tomada como presente; CSS `:has` com especificidade inesperada; real device com viewport dinâmica; privacidade Cards.

## OPEN_QUESTIONS

Nenhuma escolha de produto bloqueia a direção. Para freeze: sessão QA autenticada em Home/Media/Games/Settings; device real para Draw landscape/teclado; rechecagem do login Google. Build já passou fora da restrição inicial de sandbox. Sem QA visual, conclusões dessas telas ficam explicitamente limitadas.

## FILES_CREATED

`docs/frontfix/FF1_VISUAL_AUDIT.md`, `LUMIO_EXPERIENCE_BIBLE.md`, `FRONTFIX_ROADMAP.md`, `VISUAL_DEBT_REGISTER.md`, `VISUAL_CONSTITUTION.md`, `SCREENSHOT_MATRIX.md` e este relatório.

## FILES_CHANGED

Nenhum arquivo preexistente.

## PRODUCTION_CODE_CHANGES

Nenhum.

## DEPENDENCIES

Nenhuma instalada. `agent-browser` não estava disponível neste host; usou-se navegador nativo do Codex e PNGs de QA do repositório. Nenhuma dependência acrescentada.

## MIGRATIONS

Nenhuma.

## TESTS

`npm run typecheck`: passou. `npm run lint`: passou. `npm run build`: passou integralmente na repetição sem restrição de leitura do sandbox (Vite 1671 módulos, 20,45 s); a primeira tentativa tinha falhado por `Acesso negado` antes de carregar a configuração. `git diff --check`: verificação final registrada após escrita. Não houve E2E funcional, pois FF1 não muda runtime e falta sessão de QA privada.

## PERGUNTAS OBRIGATÓRIAS — RESPOSTAS EXPLÍCITAS

### Diagnóstico (1–20)

1. Cinco causas de dashboard: chrome empilhado, cards default, status sempre visível, ownership cruzado, cabeçalhos duplicados.
2. Cinco causas de fadiga: bordas repetidas, mint simultâneo, microtexto, painel periférico constante, excesso de metadado.
3. Padrões compartilhados: `App.tsx` Shell/dock/drawer, CSS global, slots de GameDesignSystem.
4. Específicos: swatches e quadro Draw; player provider Media; mão privada Cards; widget externo no Login.
5. Sim, risco de nesting excessivo.
6. Hub dentro do palco; conteúdo Media/drawer; confirmar visual atual das telas privadas.
7. Sim, especialmente estrutura Draw e cards Hub.
8. `drawV4.css` delimita rail, board, feed; Game Hub usa cards; ajuste requer QA, não remoção indiscriminada.
9. Sim, Game Hub + HUD Draw/Quiz/Cards; Party header adiciona mais uma camada.
10. `App.tsx:813-821`, `GameHub.tsx:34`, `DrawGame.tsx:65-66`.
11. Breadcrumb pode ser redundante no jogo ativo.
12. `GameHub.tsx:34` com seletor Party acima; avaliar volta ao Hub sem perder orientação.
13. Sim, Draw mostra fase, papel, rodada, tema, meta e score.
14. `DrawGame.tsx:65-89`.
15. Sim, controles Media e Social dividem dock universal.
16. `App.tsx:832-860` renderiza Now Playing/Fila/Add Media também em Games.
17. Parte mobile é composição própria (`MobilePartyChat`), parte depende de CSS desktop adaptado; não é só compressão.
18. Draw 320×568/paisagem e possivelmente Games; Media só evidência histórica.
19. Landing, marca, rotas por experiência, quadro claro, feed Draw unificado, foco.
20. Logo/cores/Inter, Casa/Party, continuidade call/chat, sync, privacidade e permissões.

### Identidade (21–35)

21. Um encontro privado em que atividade compartilhada é palco e pessoas ficam por perto.
22. Noturna, calorosa, calma, competente, social, não infantil.
23. Não é SaaS, Discord, streaming clone, nem neon gamer.
24. Sim, graphite continua.
25. Sim, mint continua como ênfase, não decoração onipresente.
26. Sim, Inter continua.
27. Não, logo mantém-se.
28. Não é rebranding.
29. Casa/atividade antes de KPI e formulário; remover boxes sem função.
30. Tom/arte madura, sem mascotes/cartoon excessivo.
31. Acentos contidos, sem brilho neon contínuo.
32. Foco em Party social, não fileiras de catálogos de capas.
33. People/Call contextuais, não servidor/canais/sidebar permanente.
34. Tokens, marca, transições e Social Shell coerentes.
35. Media apresenta imagem/som; Games apresenta ação/tempo/turno.

### Ownership (36–50)

36. Core: marca, navegação, foco e tokens.
37. Social Shell: People/presença/chat/call/share/convites.
38. Media: player, Queue, Library, Now Playing, Add Media, Ambient.
39. Games: Hub, HUD, fase, score e ferramentas de jogo.
40. Queue: estado Party/media; UI Media.
41. Add Media: Media.
42. Now Playing: Media.
43. Party Chat: Social; apresentação pode ser integrada à atividade.
44. People: Social.
45. Call: Social.
46. Screen Share: origem Social, vista contextual no palco.
47. Game score: Games.
48. Game tools: jogo específico dentro de Games.
49. Settings: Utility; acesso por Core.
50. Queue vive no estado compartilhado, mas botão não precisa em Games; screen share usa signaling social e palco de Media/Games.

### Home/Party (51–58)

51. Código tende a gerenciador de Casas; aparência atual não capturada.
52. Chegada à turma e à atividade em curso.
53. Código compõe workspace; direção é lugar de encontro.
54. Identidade, seletor e acesso social mínimos.
55. Troca de vista sem sair da Party nem reiniciar call/chat.
56. Não por padrão; sidebar só para tarefa simultânea justificável.
57. Não universal com todos os controles.
58. Virar acesso social contextual, sem ações Media fora de Media.

### Media (59–67)

59. O player é central em JSX; protagonismo visual atual sem captura fica pendente.
60. Now Playing, drawer, dock, chat e avisos podem competir.
61. Metadados e ações secundárias recuam durante playback; foco/erros ficam.
62. Não; Queue sob demanda.
63. Acessível, não necessariamente painel permanente.
64. Não todos; call ativa/erro e menu mantêm acesso.
65. Ambient privilegia capa/luz/música; vídeo privilegia frame/tempo.
66. Player + composer social sem esmagar frame, Queue em sheet.
67. Fullscreen continua com affordance social sem violar controles do provider.

### Games (68–82)

68. Draw fixture já se aproxima de mesa; Hub histórico ainda dashboard.
69. Cards, breadcrumb, status e Now Playing/dock cruzados.
70. Hub histórico sim; versão atual requer screenshot.
71. Escolha de atividade com presença/convite, não catálogo KPI.
72. HUD de fase sim; título repetido não.
73. Só retorno claro ao Hub; breadcrumb fixo é dispensável.
74. Não.
75. Sim.
76. Feed único/contextual; Draw integra palpite sem segunda conversa.
77. Sim.
78. Mantém áudio/sinal, menu compacto e status relevante.
79. Quadro, pista/tempo e entrada de palpite ocupam prioridade.
80. Pergunta/respostas primeiro, timer/score secundários.
81. Mesa/mão/turno primeiro; mão privada nunca projetada a outros.
82. Mesmo Core/Social/tokens/fases, composição específica por jogo.

### Mobile (83–93)

83. Header + game nav + HUD + feed/dock; Draw 320 mostra compressão.
84. Barra superior compacta, palco flexível e uma borda/composer social.
85. Queue, People, seleção de ferramentas, convites breves.
86. Detalhes de membros/biblioteca quando exigem navegação/inspeção.
87. Metadado redundante, dock Media e headers extras.
88. Ferramentas acessíveis junto ao quadro, scroll controlado e hit targets.
89. Quadro+pista/tempo+feed/composer único; placar sob demanda.
90. Visual viewport redimensiona palco; composer não cobre última mensagem.
91. `env(safe-area-inset-*)`, teste notch e standalone.
92. Fullscreen paisagem, sem deformar canvas; saída/foco sempre possíveis.
93. Mais altura útil, mas não supor offline nem viewport estática.

### Design System (94–110)

94. Não, card não é primitive universal.
95. Stage/edge/layer/utility com espaço e tipografia.
96. Quatro superfícies semânticas da Bíblia.
97. Onde separa ação, foco, board ou overlay.
98. Em objetos tocáveis/overlays, não todo bloco.
99. Contraste tonal e oclusão, uma elevação por vez.
100. Experiência → fase/ação → corpo → metadado legível.
101. Com rótulo ou nome acessível; não ícone ambíguo sozinho.
102. Uma ação primária da fase, secundárias locais, terciárias contextuais.
103. Ferramentas pertencem ao dono da atividade e surgem conforme papel/estado.
104. Decisão bloqueante/destrutiva.
105. Tarefa breve e móvel com palco ao fundo.
106. Inspeção/navegação simultânea justificada, preferencialmente desktop.
107. Transição orienta fase/rota, sem competição contínua.
108. Reduz movimento, preserva sinal textual.
109. Visível, ordem coerente, retorno após overlay.
110. ≥44×44px móvel; swatch visual pode ser menor dentro do alvo.

### Execução (111–120)

111. FF2: Core/Shell/Home/tokens/slots e QA rotas.
112. FF3: Social edge, Chat único, People/Call/share e overlays.
113. FF4: Media palco/Queue/Ambient/mobile sem mudar sync.
114. FF5: Hub/Games/HUD/Draw-Quiz-Cards sem mudar runtime.
115. FF6: responsive/a11y/motion/CSS legado/PWA/regressão.
116. Não; FF4 e FF5 podem trabalhar parcialmente em paralelo após FF2/FF3 estáveis.
117. Sim, GX4.2.3 após FF6.
118. Slots, tokens, Social edge, golden viewports e política de chrome.
119. Regras do jogo, backend, schema, autenticação, provider/sync, Quiz V2.
120. Desmontar call/provider/Party ou duplicar chat ao mover componentes visuais.

## FINAL_VERDICT

Direção de produto e documentação prontas para revisão; freeze FF1 requer QA visual autenticado. Não iniciar FF2 como se Home/Media/Games privados tivessem sido auditados visualmente. Condição inequívoca desta entrega:

FF1 REQUIRES REVISION
