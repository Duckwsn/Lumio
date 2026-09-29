# PÓS-1.0 — G5 LUMIO CARD GAME

Data: 29/09/2026. Base auditada: `a1e7471`. Implementação local, sem commit, push ou deploy.

## STATUS

G5 implementado e validado localmente. O terceiro jogo é **Lumio Cartas**, para 2–8 participantes voluntários. Runtime autoritativo, mãos privadas, efeitos, compra, coringa, Última!, vitória e revanche funcionam. O Hub contém exatamente Draw, Quiz e Cards. Aprovação local não equivale à homologação hospedada, WAN ou aparelhos físicos.

## AUDIT

Auditados os contratos shared, router PartyGames, fanout por identidade no index, Draw/Quiz, GameHub, MainStage, contexto Chat/Guess, CSS mobile e documentação G0–G4/AGENT/CLAUDE. O checkout começou limpo. Foram preservadas persistência social/mídia, autenticação, OAuth, Drive, infraestrutura e a arquitetura de uma Party/socket. Nenhum Prisma/schema/migration/.env/dependência foi alterado.

## G4 REGRESSION

Baseline: quatro cenários Draw/Quiz/media passaram; o cenário de voz falhou inicialmente e seu catch ocultou o erro original ao acessar qaVoice ausente. A repetição isolada passou. Depois de G5, a regressão completa passou **10/10 E2E**, incluindo voz. Não houve correção especulativa de Call. Na preparação de G5, duas execuções falharam na interação Pessoas/Fila por mouse em contexto mobile; a interação foi convertida para toque e passou a aguardar o fechamento do painel. Não se adicionou retry global nem se removeu a asserção.

## GAME HUB

Três entradas reais com nome, ícone SVG próprio e limite de jogadores. Cards é carregado sob demanda. Lobby também reserva a sessão: abrir outro jogo mostra conflito e botão Retornar à partida. Voltar ao Hub/mídia não é leave/end. Encerramento continua exclusivo do coordenador, com confirmação e revisão exata.

## CARD GAME OVERVIEW

Descarte por combinação de cor, número ou ação. Cada participante recebe sete cartas; vence quem esvazia a mão após resolver os efeitos da última jogada. Uma mesa por Party, sem matchmaking, bots, ranking, moedas, quarto jogo ou serviços novos.

## NAME / VISUAL IDENTITY

Lumio Cartas identifica um jogo próprio integrado ao produto. Cartas escuras, faixa pastel superior, geometria e texto; Menta ●, Maré ◆, Âmbar ▲, Ameixa ■, livres ◇. Não foram utilizados nome/logo/arte/oval/layout oficial de produto de terceiros, assets externos ou composição de 108 cartas. A inspiração mecânica não é uma afirmação jurídica de exclusividade.

## MULTI-GAME ARCHITECTURE

Shared discrimina gameType cards nas ações, snapshots e registry. PartyGames faz apenas roteamento/exclusão/cleanup; regras estão em CardGameRuntime. Index projeta por socket/usuário autenticado, mantendo deltas específicos de Draw. Contexto social/Chat/Guess filtra Draw e não recebe mãos de Cards. Não foi criado framework genérico de jogos.

## SESSION MODEL

LOBBY → PLAYING → RESULT → LOBBY por rematch. sessionId identifica mesa; roundId muda em cada turno; revision aumenta em mutações/presença. Host, participantes ativos, ordem, prazo e resultado são autoritativos. Rematch exige host ativo online e duas pessoas online. Start exige a mesma autoridade/mínimo. Participar é opt-in e só em lobby/resultado.

## DECK COMPOSITION

| Grupo | Por cor | Total |
|---|---:|---:|
| Números 0–8, duas cópias físicas de cada | 18 | 72 |
| Pular | 1 | 4 |
| Virar | 1 | 4 |
| Comprar 2 | 1 | 4 |
| Mudar cor, sem cor | — | 8 |
| Mudar +4, sem cor | — | 4 |
| **Total** | **21 por cor + livres** | **96** |

Sete cartas por pessoa, distribuídas circularmente. Depois da distribuição, o primeiro número encontrado na compra é removido para descarte inicial, sem efeito inicial. As ações não são descartadas/inventadas; continuam na compra. Em oito jogadores restam 39 cartas na compra mais uma no descarte.

## CARD TYPES

number, skip, reverse, draw_two, wild, wild_draw. Cada instância possui UUID aleatório independente da cor/número/tipo; duas cópias numéricas não compartilham ID.

## SHUFFLE

Fisher–Yates no servidor com crypto.randomInt, sobre cópia do array. Novo deck com novos UUIDs em cada start, incluindo após revanche. Reciclagem e devolução de mão no leave também embaralham no servidor. Cliente não fornece deck, seed, próxima carta ou resultado.

## PUBLIC STATE

gameType, roomId/sessionId/roundId/revision, host, fase, jogadores (identidade/avatar/cor/online/participação/cardCount/declaredLast), turnOrder/currentPlayerId/direction, activeColor/topCard, drawCount, substate, turnStartedAt/turnEndsAt/serverNow, winner/resultReason e feed curto. TopCard é a carta já pública do descarte. drawCount é quantidade, nunca lista de cartas.

## PRIVATE STATE

myHand da própria identidade participante; legalCardIds apenas do próprio turno válido; myPending apenas do próprio turno/decisão. Espectadores omitem esses campos. Oponente conhece contagem, não cartas. IDs próprios servem para referenciar a jogada, não conferem autoridade por si só.

## SERVER-ONLY STATE

Map de mãos completas, ordem da compra, descarte histórico, active/offline, pending com declaração reservada, rate limits e timestamps de cleanup. Não há seed publicada, mapa global de mãos ou log de payload privado. O snapshot é clone, separado das zonas internas.

## PRIVATE HAND SECURITY

O servidor usa viewer.id autenticado em cada peer.emit; não faz broadcast de uma mão. Open/inspect/rejoin enviam a projeção daquela identidade. Membership/room join são verificados na fronteira Socket.IO existente, antes do runtime. Runtime exige participação, turno, posse física e legalidade. Teste de integração rejeita Party estrangeira, carta alheia e compra fora de turno. Cartas já descartadas são informação pública; não se promete apagar a memória legítima de cartas anteriormente vistas.

## TURN ORDER

Ordem de entrada dos participantes online no start. Direção inicial +1. Próximo online ativo é encontrado por cursor limitado ao tamanho da ordem; não há laço infinito procurando alguém conectado. Offline permanece na ordem/mão, mas é pulado na busca do próximo. Virar altera direção; Pular e compras compulsórias avançam além do alvo.

## LEGAL MOVES

Antes do deadline, mesma session/round/revision, PLAYING, participante ativo online, turno próprio, carta realmente em sua mão. Carta colorida combina cor ativa, número quando ambas são numéricas, ou kind da ação do topo. Livre sempre é jogável; Mudar +4 não possui restrição de ter outra carta nem challenge. Decisão pendente restringe as ações. Cor é enum de quatro opções; campos extras/efeitos/vencedor enviados pelo cliente são recusados por schema estrito.

## DRAW RULES

Pode comprar voluntariamente uma carta, mesmo tendo carta legal. Compra não jogável (ou zero disponível) passa turno. Compra jogável entra em AWAITING_DRAWN_CARD_DECISION: só a nova carta pode ser jogada ou mantida com Manter e passar. Não pode comprar outra nem escolher carta antiga enquanto decide. Prazo original continua; não há segundo relógio nem autoplay.

## ACTION CARDS

Pular: próximo perde vez. Comprar 2: próximo compra até duas disponíveis e perde vez, efeito imediato. Virar: inverte direção; com dois online devolve turno ao autor. Com três/quatro o próximo segue direção invertida. Nenhuma carta permite responder empilhando compra.

## WILD

Mudar cor/Mudar +4 reservam a carta na própria mão e aguardam confirmação de cor. Apenas dono recebe ID da pendência; os demais veem substate. Escolher cor confirma descarte/efeito uma vez. +4 faz próximo comprar até quatro e perder vez. Timeout não escolhe cor nem joga carta automaticamente. Carta final livre só vence depois de escolher cor e resolver compras.

## ACTIVE COLOR

Campo autoritativo separado do topo livre. Aparece com nome e marca geométrica; picker tem quatro botões nativos de pelo menos 44px de altura. Escolha inválida, fora de turno, sem pendência ou com revisão velha é rejeitada.

## LAST CARD MECHANIC

Checkbox Última! aparece com duas cartas no próprio turno. declareLast boolean acompanha play/play_drawn atomicamente. Se a jogada deixa uma carta, true declara; false compra duas disponíveis imediatamente e registra feed. Não há corrida de botão separada com janela dependente da latência. Em wild, declaração fica reservada e só é aplicada na confirmação de cor. Declaração em quantidade diferente de uma não dá vantagem. Reenvio não duplica declaração/efeito porque revisão/turno/carta já mudaram.

## TURN TIMER

35 segundos por turno, timestamps no servidor; roundId novo. Frontend usa intervalo local de 250ms e serverNow para apresentação, sem eventos por segundo. Abrir Chat/Pessoas/Fila/Hub/mídia não pausa relógio. Atualização de snapshot alinha também now local para evitar exibir brevemente 36s por amostra anterior ao novo turno.

## TIMEOUT

Tick compartilhado do servidor aplica timeout ao prazo: compra uma disponível e passa, sem jogar automaticamente. Se já havia comprado voluntariamente, mantém aquela carta e passa sem segunda compra. Pendência livre não descarta a carta; compra uma/pass. Ação recebida no limite now >= turnEndsAt é recusada mesmo antes do tick atualizar a tela.

## DISCONNECT

Marca offline e mantém mão/ordem. Grace de cinco segundos para expiração do turno do desconectado/transferência de host. Offline é pulado se outra jogada avançar antes disso. Menos de dois online na abertura do próximo turno ou após expiração encerra sem vencedor. Não há espera indefinida. Mão não volta ao deck por perda de conexão. Leave explícito, troca de Party ou remoção de membership revogam participação/devolvem mão.

## RECONNECT

Rejoin autenticado devolve mão própria e decisão pendente, sem replay. Antes da grace, conserva deadline/turno se ainda vigente; depois, conserva mão quando a mesa existe, mas não ressuscita turno vencido/resultado. Index remove presença da Party após cinco segundos sem remover mão do runtime. Tests cobrem pendência livre, deadline, host e rejoin real de B. Reinício do servidor não é reconnect recuperável: mesa é efêmera.

## LATE JOIN

Pessoa que chega durante PLAYING observa. Não altera turnOrder, não recebe mão e não consegue join/play/draw. Em resultado/lobby seguinte pode optar por participar; integração comprova D entrando no rematch sem interromper A/B/C.

## SPECTATOR

Recebe mesa pública, contagens, prazo e feed; nenhuma mão/legalCardIds/myPending. Pode usar Chat/Call/People/Queue da Party. Não bloqueia turnos nem mínimo; não pode iniciar partida sem participar/ser host.

## DECK EXHAUSTION

Preserva topo do descarte; embaralha os descartes anteriores na compra. Nenhuma carta em mão é reciclada involuntariamente. Se todas as outras cartas estiverem nas mãos e nada puder ser reciclado, compra real é zero: não inventa cartas, não duplica, não trava loop. Feed registra quantidade efetiva; turno/efeito prossegue. Partidas patológicas podem continuar até alguém jogar/sair; não há regra artificial de vitória por esgotamento.

## CARD CONSERVATION

Durante PLAYING/RESULT: deck.length + discard.length + soma das mãos = 96, com 96 IDs distintos. Leave devolve cartas, wild reservada fica só na mão até commit, reciclagem mantém top fora da compra. Lobby não contém deck ativo. Testes verificam conservação após efeitos com 2/3/4, oito participantes, penalidade, vitória/leave/recycle e 400 transições por cenário de 2/3/4/8 (1.600 iterações, incluindo rematches).

## WIN CONDITION

Exatamente o autor cuja mão termina vazia após a jogada confirmada e efeitos é winner. Unitários cobrem final numérico e todos os tipos de ação/livre. RESULT rejeita jogadas novas; ausência de mínimo termina sem vencedor. Nada de placar escolhido pelo cliente, ranking permanente ou empate por latência.

## REMATCH

Host retorna RESULT a LOBBY mantendo a mesma session e os participantes online, zerando cartas/ordem de jogo anterior/feed/resultado/direção. Start seguinte gera deck/IDs novos e sete cartas por participante. Espectadores podem aderir antes desse start. Não altera Casa, fila, mídia, conversa ou RTC.

## DESKTOP

Mesa com descarte, cor ativa, direção, compra; oponentes resumidos e mão própria. Cartas 82×116px, seleção e confirmação separadas. Sem painel global de mãos. Hub/Lobby/Mesa abertos e inspecionados em screenshots 1280×900.

## MOBILE

Viewport 320/360/375/390/412/430: testes medem ausência de overflow horizontal global e dimensões mínimas das cartas. A mão de 13 cartas também percorre as seis larguras, com bounding boxes da faixa e última carta após scroll local. Cartas 70×98px com scroll local, preservando ordem, seleção e rótulos. UI real com mãos de 3, 7, 13/14 e uma carta. Touch tap seleciona, botão confirma; não usa hover/drag obrigatório. Chat estrutural permanece com composer e draft. Opponents têm overflow local; não são miniaturas de cartas privadas. Mesa usa até 72% do espaço disponível e scroll vertical quando necessário.

## FULLSCREEN

Reutiliza fullscreen/fallback do MainStage, sem surface/socket novo. Paisagem curta usa duas colunas: mesa/oponentes à esquerda, mão/confirmar à direita. Revisão inicial encontrou mão cortada abaixo da dobra; CSS compactado e E2E confirmou botão de jogar dentro de 844×390. Retrato continua com orientação existente para girar o celular. Fullscreen físico/orientation lock de iOS/Android requer teste manual.

## CHAT

Permanece montado; E2E verifica identidade do nó e rascunho antes/depois de partida/result. Eventos de cartas não são chat:message nem guess. Feed limitado é da mesa, não histórico persistido. QA agent-browser enviou mensagem sintética em Party local e abriu Pessoas/controles de Call sem sair da sessão Cards.

## CALL

Nenhum runtime/captura/sinalização RTC alterado. Mesma Party e socket. Suite completa aprovou três clientes RTC, captura explícita, negação, deafen, reconexão e leave. Áudio físico entre pessoas e TURN/WAN não foram homologados aqui.

## MEDIA

MainStage/engine continuam persistentes; jogo é apresentação, não outra Party. Navegação retorna ao jogo existente; abrir tipo concorrente não substitui sessão. Regressão G0 comprova vídeo Drive/estado pausado/apresentação/screen stream locais. Nenhuma fila/Library/provider foi reescrito.

## YOUTUBE

Sem mudanças no adapter/Data API/configuração. Testes unitários existentes de readiness/autoplay/switch e apresentação continuam passando. Não houve teste real autenticado de YouTube ou confirmação hospedada do iframe nesta etapa.

## DRIVE

Sem OAuth, scopes, credenciais, grants, tickets, streaming ou Range alterados. Regressões unitárias e G0 usam fixtures locais. Teste com arquivos reais/autorização Google permanece manual; não reivindica validação de Drive real.

## SCREEN SHARE

Botões/surface/ownership existentes preservados, sem nova captura ou SFU. Fixture de troca de screen stream passou; compartilhar tela física em desktop/mobile entre participantes reais permanece necessário.

## ACCESSIBILITY

Cor não é único identificador: nome + forma + texto da ação/número. Native buttons, aria-label, aria-pressed, disabled, grupos nomeados, status de turno, tempo e erro, checkbox rotulado. Cartas/controles atendem alvos medidos de 44px. Foco de fase no heading; não anuncia ticks a cada 250ms como live region. Transição curta respeita prefers-reduced-motion. Não houve auditoria completa com leitor de tela físico nem certificado WCAG; verificar VoiceOver/TalkBack/zoom/contraste de estados disabled manualmente.

## PERFORMANCE

Uma projeção por usuário a cada mutação, até oito mãos/96 cartas; feed limitado a 12 (UI mostra três), rate 8 ações/s por usuário/room, até 1.000 sessões, lobby/result idle 30min, timer global existente de 250ms. Não há fanout por segundo, broadcast de deck ou dependência nova. CardGame lazy: build mediu 7,47kB JS / 2,97kB gzip. Não foi realizado benchmark WAN, heap prolongado ou teste de carga de 1.000 mesas.

## SECURITY

Membership e socket autenticado existentes, participação/turno/fase/deadline/ownership/legalidade/enum/revisão no runtime, limite de ações e schema estrito. Dois pedidos iguais não repetem efeito: primeiro altera revisão/turno/posse; segundo falha. Não há decisão otimista autoritativa no cliente nem retry cego no ack timeout. Cliente não escolhe efeitos, compra, turno ou vencedor. Estados privados não são persistidos/logados. Nenhum endpoint público/debug foi criado.

## TESTS

`npm run typecheck`, `npm run lint`, `npm run build`: passaram. `npm test`: servidor 111 casos, **105 pass / 6 skip / 0 fail**; web 29 pass; service worker 4 pass. Total **138 pass / 6 skip**. Os seis skips são testes opt-in PostgreSQL/boot em banco descartável, não testes de Cards ausentes; não foram ativados contra banco real. Cards tem dez testes de regras/soak e uma integração autenticada. `git diff --check` verificado ao encerrar.

Cobertura: deck/IDs/shuffle/deal, privacy/clone, schema/authority, todos os efeitos 2/3/4, compra/decisão/pass/duplicação/timeout, Última!/penalidade/boundary, finais de todos os tipos, wild/reconnect/grace/host, reciclagem e zero disponíveis, capacidade/cleanup/throttle/exclusão de jogos e conservação prolongada.

## MULTI-CLIENT

Integração sobe servidor real isolado e autentica A/B/C/D via signup/verificação local/login. A/B/C aderem; D chega depois como observador. Captura game:snapshot/game:state individualmente, compara cada projeção com os IDs das mãos dos outros após transições, rejeita hands/deck/seed/drawOrder e confirma omissão de mãos/pendência do observador. B reconecta em seu turno e recebe mesma mão/deadline. Fluxo completo: número → reverse → +2 → compras → +4/cor → wild/cor → compra jogável → sequência → Última!/skip → vitória → rematch → D participa.

## E2E

Suite completa **10/10 passou (4,6min)**. G5 usa três contextos Chromium autenticados independentes: dois mobile touch e um desktop. Testa Hub três jogos, lobby, sete cartas distintas, seleção/confirmar, turno remoto, recarga, effects, coringa, decisão de compra, 13/14 cartas, última, vitória e revanche, People/Queue sem remount, draft, seis larguras, fullscreen paisagem e bloqueio Quiz concorrente. Após ajuste de amostra do relógio e ampliação da medição de mãos grandes, G5 foi repetido isoladamente: **1/1 passou (27,4s)**.

Baralho determinístico está apenas em `e2e/fixtures`, explicitamente preloaded pelos launchers de QA. Guard exige development/file/origem loopback e auth file em diretório temporário. Redireciona somente import do deck pelo runtime em processo de teste; demais regras/runtime são reais. Não existe flag de produção, import da fixture pelo app, endpoint, deck cliente ou enfraquecimento do shuffle de produção. IDs continuam aleatórios mesmo na fixture.

## VISUAL QA

Screenshots realmente abertos via visualizador e inspecionados; não apenas gerados. Evidências regeneráveis em `test-results/` (ignoradas pelo Git):

| Caso | Arquivo |
|---|---|
| Hub desktop/mobile | g5-hub-desktop.png / g5-hub-mobile.png |
| Lobby desktop/mobile | g5-lobby-desktop.png / g5-lobby-mobile.png |
| Mesa desktop | g5-table-desktop.png |
| Mesa mobile 320/390/430 | g5-table-320.png / g5-table-390.png / g5-table-430.png |
| Poucas/muitas cartas | g5-few-cards.png / g5-many-cards.png / g5-many-cards-scrolled-320.png |
| Próprio/adversário | g5-own-turn.png / g5-other-turn.png |
| Wild | g5-wild-picker.png |
| Compra | g5-draw-two.png / g5-drawn-choice.png |
| Reverse | g5-reverse.png |
| Última / Resultado | g5-last-card.png / g5-result.png |
| Fullscreen paisagem | g5-landscape-fullscreen.png |

Inspeção encontrou fullscreen inicial cortando mão; corrigido/reinspecionado. Identidade escura/pastel/geometria evita cassino/arte oficial. Cartas grandes não foram sobrepostas em fan ilegível. Parte da última carta da faixa é intencionalmente cortada para indicar scroll local, não perda de controles. Toast de chegada pode cobrir heading brevemente (comportamento já existente), sem bloquear cartas/ações.

Exploração agent-browser adicional, sessão própria `lumio-g5-a6ced8e912c8`, Party local descartável: login/Hub/cards opt-in, mobile 320, Pessoas, Chat enviado, controles Call, conflito Quiz/retorno; console/errors sem exceções. Nenhum novo problema reproduzível nessa exploração limitada. Sessão fechada ao terminar; não foram usados seus cookies/Google/produção. Skills React/composition orientaram import lazy/runtime separado e evitaram proliferação de flags/framework; agent-browser orientou QA pela UI. Nenhum relatório paralelo redundante criado.

## DRAW REGRESSION

G2/G3 passaram completos: canvas/secret word, Chat/Guess, Undo, configuração/meta/tema, locks, pontuação/resultado/rematch, papéis mobile/fullscreen e identidade de Chat. Unitários/integracao Draw passaram. Não foram alterados banco de palavras/fórmula/autoridade/deltas.

## QUIZ REGRESSION

G4 passou: lobby/config, questões/privacidade/resposta bloqueada, reveal/distribuição/score, resultado/rematch e reconnect. Unitários e integração autenticada Quiz passaram. Não foram alterados banco/fórmula/answer authority.

## KNOWN LIMITATIONS

- Sessão efêmera: restart encerra jogo; nenhum checkpoint PostgreSQL/Redis foi adicionado.
- QA Chromium/loopback, não prova mobile físico, áudio real, TURN/WAN ou Google/providers externos.
- Baralho finito pode não oferecer todas as cartas de uma penalidade; aplica quantidade disponível sem inventar. Caso extremo zero disponíveis passa normalmente, sem vencedor artificial.
- Última! é opção atômica na jogada, não botão pós-jogada/janela de denúncia adversária.
- Reconnect após prazo não devolve turno expirado; offline é pulado e menos de dois online pode encerrar sem vencedor.
- Cartas longas continuam com scroll local; 8 participantes foram validados no runtime, não em oito aparelhos físicos.
- Não há stacking/challenge, variantes avançadas, bots ou ranking persistido.

## MANUAL_REQUIRED

Antes de considerar homologação hospedada: Android Chrome e iOS Safari/PWA em 320–430, teclado Chat/rotação/safe-area/fullscreen, toque/scroll da mão de 12+, wild e Última!, leitor de tela/zoom, 2–8 pessoas reais, reconnect durante compra/coringa/próprio turno e troca de rede/background; áudio simultâneo/mute/deafen/captura negada/TURN em redes diferentes; YouTube real com autoplay, arquivo Drive real/Range/ticket/reconexão e screen share real; verificar que navegar Media/Hub/jogos não altera engine/Call/queue nem duplica socket. Não alterar scopes/produção automaticamente para isso.

## FILES_CHANGED

Novos: packages/shared/src/cardGame.ts; apps/server/src/cardDeck.ts, cardGame.ts, cardGame.test.ts, cardGame.integration.test.ts; apps/web/src/games/CardGame.tsx; e2e/fixtures/cardDeck.ts, cardDeckLoader.mjs; este relatório.

Alterados: packages/shared/src/index.ts, partyGames.ts; apps/server/src/partyGames.ts, index.ts; apps/web/src/components/GameHub.tsx, styles.css, security.test.tsx; e2e/party.spec.ts; docs/AGENT.MD, CLAUDE.MD (invariantes permanentes).

Nenhum commit/push/deploy, migration, db push/reset, mudança de schema/infra/OAuth/Auth/.env ou dependência nova. PROJECT_CONTEXT não existia e não foi criado.

## RESPOSTAS OBRIGATÓRIAS

1. Nome: Lumio Cartas, próprio do produto e descritivo.
2. Visual: SVG/geometria própria, dark/pastel, faixa superior/textos/sem oval, marcas/logos/arte oficiais.
3. Deck exato: quatro cores × (0–8 duas vezes + Pular/Virar/Comprar2 uma vez), oito Mudar cor e quatro Mudar+4.
4. Total: 96 cartas físicas com UUIDs únicos.
5. Deal: sete por participante.
6. Actions: Pular, Virar, Comprar2, Mudar cor, Mudar+4.
7. Legal: cor ativa, mesmo número entre números, mesma ação do topo ou livre, sempre com autoridade/posse/fase/turno/prazo/revisão validados.
8. Compra voluntária: sim, uma, mesmo tendo carta legal.
9. Comprada jogável: jogar somente ela ou manter/pass; relógio original continua.
10. Reverse com dois: inverte direção e volta ao autor.
11. Draw Two: próximo compra duas disponíveis e perde vez imediatamente.
12. Wild Draw: escolher cor, próximo compra quatro disponíveis e perde vez; sem restrição de outra carta/challenge.
13. Stacking: **NÃO**.
14. Última!: declareLast atômico na jogada que deixa uma carta.
15. Penalidade: compra duas disponíveis se não declarar.
16. Prazo declaração: flag válida recebida na mesma ação legal antes do deadline; wild reserva flag até cor. Não há evento separado dependente de latência.
17. Turno: 35 segundos.
18. Timeout: compra uma e passa; compra pendente já realizada não compra novamente; nunca autoplay.
19. Compra vazia: recicla descarte exceto topo; sem cartas recicláveis compra zero e prossegue.
20. Conservação: IDs únicos/total96 após transições, efeitos/leave/reciclagem/finais e 1.600 iterações em 2/3/4/8.
21. Público: fase/identidades/contagens/turno/direção/cor/topo/prazo/resultado/feed; nenhuma mão global.
22. Específico: myHand/legalCardIds/myPending apenas próprios.
23. Só servidor: ordem deck, mãos alheias, descarte histórico e decisão reservada completa.
24. Evidência A≠B: integração captura projeções reais de quatro sockets e procura IDs da mão corrente B em cada payload corrente A; unitários verificam clones/omissão.
25. Spectator: D conectado durante PLAYING sem myHand/myPending; join/draw proibidos e sem hands/deck no stream.
26. Reconnect: viewer autenticado, mesmo mapa de mão; integração B compara mão/deadline antes/depois, unitários incluem pending/expiry.
27. Late join: observa agora, opt-in no resultado/lobby próximo; ordem ativa intacta.
28. Mãos grandes: cartas70×98, scroll horizontal local, touch/confirmar, page sem overflow; screenshots13/14 e seis larguras com medição tanto inicial quanto de 13 cartas/última carta após scroll.
29. Cores: nome/forma/texto/número redundantes; foco/buttons/labels/reduced motion. Leitor de tela físico ainda manual.
30. Exclusão: PartyGames reserva tipo por roomId; Lobby/Playing/Result bloqueiam outro tipo até end autorizado.
31. Draw/Quiz: sim, unitários/integrações e G2/G3/G4 E2E passaram na suíte completa.
