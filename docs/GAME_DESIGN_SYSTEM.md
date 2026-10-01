# Lumio Games — Game Design System GX4.1

## Escopo e contrato

Este sistema é somente apresentação para os três jogos reais (Draw, Quiz e Cartas) dentro da Party. `GameHub` escolhe a experiência; cada jogo conserva sua própria projeção autenticada, comandos, regras, relógio e validação do servidor. `GameShell` não importa Socket.IO, RTC, Chat, mídia nem runtime. A troca entre Mídia e Jogos ocorre somente pelo seletor da Party; “Voltar aos jogos” retorna apenas ao Hub. Essas trocas não encerram a sessão; o encerramento permanece uma ação explícita do coordenador. Escape fecha fullscreen/visualização de tela, mas não troca para Mídia.

Componentes em `apps/web/src/games/GameDesignSystem.tsx`: `GameShell` (raiz e identidade), `GameHud` (cabeçalho composável), `GameStage` (superfície de conteúdo DOM/Canvas), `GameLobby`, `GameActionBar`, `GameResult`, `GameTimer` (formatação visual de segundos recebidos) e `GamePhase`. Não criam estado de jogo nem interpretam projeções privadas. A composição por `children` mantém o conteúdo específico de cada game isolado; não usar uma API com dezenas de flags para simular três jogos. Draw usa `GameStage` em seu wrapper 4:3 sem mudar o ciclo imperativo do canvas.

## Linguagem visual

Tokens de escopo `.game-hub` em `gameDesignSystem.css`: `--game-bg`, `--game-panel`, `--game-panel-raised`, `--game-border`, `--game-text`, `--game-muted`, `--game-accent`, `--game-warning`, `--game-danger`, `--game-radius`, `--game-space`. Mantêm contraste com o tema escuro Lumio e não alteram os tokens da Party. Verde/menta identifica ação e conexão; Maré diferencia Quiz, Ameixa diferencia Cartas, Âmbar alerta/tempo curto. Cores são pistas complementares, nunca a única informação. Forma: painéis de raio 16px, borda visível, superfícies elevadas sem glassmorphism pesado. Tipografia: títulos curtos de 18–38px conforme largura, metadados 11–14px, numerais tabulares para tempo/pontos. Ritmo espacial: 4/8/12/16/24px. Movimento discreto de hover em 160ms, eliminado em `prefers-reduced-motion`.

## Hierarquia e estados

Ordem: conteúdo jogável; informação necessária (fase/turno/tempo); participantes/pontos; Chat/Call; navegação. O HUD mantém título/status/tempo compactos. `GameTimer` formata um valor fornecido pelo jogo e o prende a zero; nunca é fonte de verdade nem emite ticks. O término de prazo e o bloqueio de ação continuam no runtime/server. Warning é comunicado também pelo rótulo/valor do cronômetro, não só pela cor. `GameResult` apresenta resultado que já veio da projeção. `GameConnectionNotice`, estados de erro e loading existem sem transformar uma ação não confirmada em sucesso otimista. Durante reconexão os controles permanecem bloqueados até a projeção autenticada.

O placar de Draw e Quiz conserva os próprios dados/semântica e agora compartilha estilo de hierarquia; Cartas apresenta a faixa de participantes com turno. Participantes são apenas os projetados pelo game, distintos dos membros da Party. O jogador local é identificado por texto (“você”) além de posição/cor. Não inserir `secretWord`, choices não autorizadas, `correctIndex`, deck ou mãos alheias no DOM, CSS, storage ou logs.

## Layout e acessibilidade

O Hub passa de três colunas espremidas para uma coluna legível em retrato estreito; 2 colunas em largura intermediária e 3 em desktop. A área dos games mantém scroll local onde necessário. Não modificar canvas 4:3, lógica de pointer ou mão horizontal de Cartas. Alvos de controles móveis ≥44px; foco visível; headings e nomes acessíveis; avisos existentes em `role=status`/`role=alert`. Não tornar o cronômetro `aria-live` a cada 250ms. Safe areas continuam no palco/fullscreen da Party; fullscreen paisagem mantém regras do game. `prefers-reduced-motion` remove transições do Hub. Teclado virtual/Android/iOS requer QA manual real.

## Integração e próximos ciclos

GX4.2 pode reaproveitar shell/HUD/timer/lobby/ações/resultado e evoluir Draw sem criar outro sistema. GX4.3 deve preservar perguntas/answer lock e usar a mesma composição. GX4.4 deve preservar a projeção privada da mão/turno. Qualquer novo game precisa de revisão do contrato de projeção e autoridade, não apenas de um cartão no Hub. Não foram adicionadas dependências, banco, migrations, Three.js ou Framer Motion.
