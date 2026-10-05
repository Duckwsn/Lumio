# Registro de dívida visual — FF1

> **FF1.1:** capturas autenticadas atuais e revisão dos itens em [FF1_1_VISUAL_PROOF.md](FF1_1_VISUAL_PROOF.md). A tabela original abaixo é o registro FF1; as mudanças de evidência estão aqui para não apagar a linha histórica.

| ID FF1 | Status após FF1.1 | Evidência/decisão |
| --- | --- | --- |
| VD-01 | Confirmada OBS-AUTH-LOCAL | `current/draw-guesser-1440x900.png` e `draw-drawer-1440x900.png`: feed de jogo + chat lateral; FF3/FF5 mantêm fluxo único. |
| VD-02 | Confirmada OBS-AUTH-LOCAL | `current/draw-drawer-320x568.png`; composer/feed comprimidos; FF5/FF6, testar teclado. |
| VD-03 | Confirmada OBS-AUTH-LOCAL | `current/draw-drawer-844x390.png`; quadro sai da área útil; GX4.2.3 após FF6. |
| VD-04 | Confirmada OBS-AUTH-LOCAL | `current/games-hub-1440x900.png`, `-320x568.png`; FF5. |
| VD-05 | Confirmada OBS-AUTH-LOCAL | `current/games-hub-1440x900.png`, `current/quiz-question-1440x900.png`, `current/cards-turn-1440x900.png`; prioridade FF2 de ownership visual, FF4/FF5 refinam. |
| VD-06 | Confirmada OBS-AUTH-LOCAL | Draw e Quiz têm header/breadcrumb/HUD redundantes; FF5. |
| VD-07/08/12 | Permanecem CODE + risco visual | FF1.1 não altera CSS produtivo nem mediu alvo de toque em aparelho; FF6/GX4.2.3. |
| VD-09 | Parcialmente confirmada | `home-multiple-*` sim; `home-empty-*` refuta generalização. FF2 deve tratar 0/1/muitas Casas. |
| VD-10/11 | Sem novo teste hospedado | Manter como FF1, sem inferir regressão de screenshot local. |
| VD-13 | Lacuna encerrada para UI local | `quiz-*`, `cards-*`, `account-*` atuais; restam mão privada e QA multiusuário/prod. |
| VD-14 | Parcial | Media atual capturada, mas iframe não reproduziu no harness; playback/provider ainda requer QA real. |

Novo VD-15 (P1): toast de entrada cobre parte do player mobile ativo (`current/media-active-390x844.png`); em FF3/FF4/FF6 posicionar feedback sem bloquear palco. Novo VD-16 (P2): o texto do chat em Games diz “Adicione uma mídia para começar” (`current/quiz-question-390x844.png`, `current/cards-turn-390x844.png`); FF3/FF5 devem torná-lo contextual sem mudar eventos do chat.

Severidade: P0 bloqueia atividade/privacidade; P1 compromete hierarquia ou integração; P2 desgaste/consistência; P3 polimento. `Confirmar` significa que a aparência atual depende de QA autenticado, embora a causa esteja no código.

| ID | Superfície/problema | Evidência | Sev. | Causa provável | Fase | Dependência/risco |
| --- | --- | --- | --- | --- | --- | --- |
| VD-01 | Draw desktop: feed da mesa e chat lateral | `artifacts/gx422/unified/guesser-1440x900.png`; `App.tsx:829-847`, `DrawGame.tsx:89-92` | P1 | Social Shell + Draw compõem chats | FF3/FF5 | Preservar único stream e autorização de palpites; confirmar produção |
| VD-02 | Draw mobile: HUD/feed comprimem palco em 320px | `artifacts/gx422/final-review/guesser-320x568.png` | P1 | Camadas de header e alturas rígidas | FF5/FF6/GX4.2.3 | Teclado e landscape reais |
| VD-03 | Draw paisagem: quadro sai da área capturada | `artifacts/gx422/final-review/drawer-844x390.png` | P1 | Aspect ratio 4:3 vs altura disponível | GX4.2.3 | Não deformar coordenadas/canvas |
| VD-04 | Game Hub pode parecer catálogo/dashboard | `artifacts/gx3/games-1440.png` HIST; `GameHub.tsx:41` | P1 | Cards em contêiner de palco + shell | FF5 | Confirmar versão atual |
| VD-05 | Chrome Media persiste em Games | Captura GX3 HIST; `App.tsx:829-860` renderiza `Now Playing`, Fila e `Adicionar mídia` sem guarda por experiência | P1 | Dock compartilhado com ação de mídia | FF2/FF4/FF5 | Garantir call/chat continuam; captura atual ainda pendente |
| VD-06 | Metadados e cabeçalhos Draw acumulados | `GameHub.tsx:34`, `DrawGame.tsx:65-89` | P2 | Game nav + HUD + barra da palavra | FF5 | Fase/tempo continuam visíveis |
| VD-07 | CSS Draw global + sobreposição V4 | `styles.css:1054-1108`, `drawV4.css:3-18,134-234` | P1 | Dívida de migração | FF6 | Regressão em 320px/fullscreen |
| VD-08 | Swatches com alvo visual 22px | `drawV4.css:81-83` | P1 acessibilidade | Compactação de toolbar | GX4.2.3/FF6 | Expandir hit area sem quebrar grid |
| VD-09 | Home enfoca cards/status/duas entradas | `HousesHome.tsx:48-59` (sem captura atual) | P2 | Semântica de gerenciador | FF2 | Preservar ações Casa/convite |
| VD-10 | Aviso PWA sobre conteúdo móvel | Landing observada 390×844 em 2026-10-05 | P2 | Toast fixo inferior | FF6 | Não interromper atualização importante |
| VD-11 | Login Google apareceu vazio | Login observado 390×844 em 2026-10-05 | P1, investigar | Widget externo/carregamento/bloqueio possível | FF6/QA | Não atribuir causa sem reprodução controlada |
| VD-12 | Tokens globais e locais Draw divergentes | `styles.css:1-16`, `drawV4.css:2,23-30` | P2 | Escopo visual ad hoc | FF2/FF6 | Manter papel claro do quadro |
| VD-13 | Quiz/Cards/Settings sem captura atual | `SCREENSHOT_MATRIX.md` | P1 de evidência | Sessão autenticada ausente | FF5/FF6 QA | Não extrapolar achados de Draw |
| VD-14 | Media vídeo/Ambient sem captura atual | `SCREENSHOT_MATRIX.md` | P1 de evidência | Sessão/provider QA ausente | FF4 QA | Não tocar sync nem grants |

Prioridade de execução: VD-01/02/05/07 antes de polimento de cores/bordas; VD-11 pede diagnóstico separado, não refatoração estética especulativa. VD-13/14 são lacunas de observação, não bugs comprovados.
