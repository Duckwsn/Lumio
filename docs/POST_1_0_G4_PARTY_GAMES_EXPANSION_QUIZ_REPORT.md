# PÓS-1.0 — G4 PARTY GAMES EXPANSION / QUIZ

Data: 29/09/2026. Base auditada: `fe2a4fa` (G3). Implementação local, sem commit, push, deploy ou alteração em produção.

## STATUS

G4 implementado e validado automaticamente no ambiente local: navegação de jogos, exclusão mútua de sessões, Hub com dois jogos reais e Quiz completo. Draw G3 permanece operacional. Typecheck, lint, testes, E2E e build passaram. Validação física/mobile, WAN e providers reais continua obrigatória antes de declarar suporte em produção.

Nenhuma migration, schema Prisma, variável de ambiente, dependência, fluxo de autenticação, scope Google ou configuração de infraestrutura foi alterada. Jogos continuam efêmeros em memória; reinício do backend encerra partidas.

## AUDIT

Foram confrontados o prompt G4, instruções existentes em `docs/AGENT.MD` e `docs/CLAUDE.MD`, relatórios G0–G3, arquitetura de entrada/social/call/mídia e código real. O ponto anterior de integração era uma única instância de `DrawGameRuntime` no servidor. GameHub carregava somente Draw; os eventos e contexto social assumiam Draw.

Decisão: envolver os runtimes em um roteador pequeno, ampliar tipos compartilhados e discriminar projeções, sem mover canvas, fórmula G3, Call, Chat, player ou autorização para um framework genérico. Não há Game SDK, Redis, broker, nova Party ou persistência de jogos.

O baseline específico G2/G3/automatic voice passou antes da integração (3 E2E). Os arquivos anteriores do runtime Draw e banco de palavras não foram modificados.

## G3 REGRESSION

Os testes Draw existentes continuam passando: configuração de tema/meta, target score, rotação circular, palavra privada, desenho incremental, undo/clear, palpites, pontuação pequena, resultado por meta, empate, rematch, limite de participantes e reconnect.

A integração Draw com três sockets autenticados passou pelo novo roteador, inclusive segredo ausente dos payloads dos guessers, ausência de retransmissão integral do board em metadados, revogação de membro e ack malformado. Os E2E G2 e G3 passaram com navegação nova. Canvas, `DrawScoreboard`, fórmula de pontos e mecânica G3 foram preservados; somente envelopes/filtros de protocolo mudaram no frontend Draw.

## GAME NAVIGATION V2

O controle solto virou breadcrumb no cabeçalho: `Voltar à mídia / Jogos / nome do jogo`, com fullscreen à direita. “Jogos” é um botão contextual discreto, acessível como “Voltar aos jogos”. No mobile o título atual redundante é ocultado no breadcrumb; o título principal do jogo continua visível.

Voltar ao Hub altera seleção/apresentação local, não envia leave/end. Voltar à mídia não encerra participação. Reabrir o Hub consulta a sessão sem criar uma nova. Para trocar um jogo reservado por outro, o coordenador precisa confirmar encerramento explícito. A confirmação informa que pontos/progresso serão descartados; não é disparada por navegação.

## GAME HUB V3

Dois cards reais: Desenhe e Adivinhe e Quiz, ambos 2–12 participantes. Não há placeholders de futuros jogos. Os cards têm ilustrações SVG próprias, code-native, consistentes com cores/espaçamento da marca. Os dois cabem lado a lado no mobile. Cada jogo é lazy e mantém seu próprio layout.

## MULTI-GAME ARCHITECTURE

`PartyGames` mantém `roomId → gameType`, roteia ações, projeções, presença, leave, tick e delete. É exclusão mútua/dispatch, não um motor genérico de regras. Possui `DrawGameRuntime` e `QuizGameRuntime` separados.

O servidor segue utilizando o socket da Party já autenticado. Antes de executar uma ação exige que o usuário esteja na Party correta e seja membro autorizado/não revogado. O fanout existente escolhe projeção por identidade, nunca divulga sessão privada por broadcast genérico.

Snapshots/state são unions discriminadas por `gameType`. Quiz usa ações estritas com `gameType: quiz`; Draw oficial envia envelope `gameType: draw`, `roomId`, `action`. O servidor conserva aceitação do payload Draw G3 estrito antigo para compatibilidade dos testes/clientes anteriores. Não é uma promessa de suporte a clientes antigos indefinidamente.

## SHARED VS GAME-SPECIFIC

Compartilhados: registry, GameType, unions tipadas, socket/autorização da Party, roteamento, exclusão de sessões, navegação/confirm-end, fullscreen existente, cores/componentes básicos e lifecycle de limpeza.

Específicos: fases, configuração, score, segredos, projeções, estado privado, validação de elegibilidade e regras de cada runtime. Draw conserva canvas/board revisions/batching/palpites/feed/scoreboard. Quiz possui banco/deck/alternativas/respostas/timer/reveal/distribuição e scoreboard. `GameScoreboard` novo é usado pelo Quiz; não substituiu `DrawScoreboard` nem criou uma abstração artificial de regras comuns.

## GAME REGISTRY

Registry estático em `packages/shared/src/partyGames.ts`, com ids `draw`/`quiz`, nomes e mínimo/máximo. Não há carregamento de plugins nem código externo. UI mapeia explicitamente cada entrada para seu import lazy e ícone; backend mapeia explicitamente para runtime.

## GAME SESSION CONCURRENCY

Uma Party reserva somente uma sessão, inclusive no LOBBY ou RESULT. Abrir outro tipo é recusado no backend, independentemente da UI. Tela de conflito oferece retorno à partida existente. `inspect` é somente leitura; não abre/termina uma sessão.

`end` exige coordenador da sessão, tipo, roomId, sessionId, roundId e revisão exata; não usa role da Casa como substituto da coordenação do jogo. Criador de lobby pode encerrar antes de participar. Encerrar envia null às projeções e libera a Party. A sessão expira após 30 minutos sem atividade em lobby/resultado; remoção da Casa limpa o runtime. Há teto global de 1.000 sessões e controles de frequência para inspect/end.

## QUIZ OVERVIEW

Jogo local PT-BR de quatro alternativas. Participação explícita; observadores podem acompanhar. Fluxo: LOBBY → QUESTION → REVEAL → próximas perguntas → RESULT → rematch para LOBBY. Estado, prazos, sorteio, acerto e pontos são autoritativos no servidor.

## QUIZ LOBBY

Mostra participantes, coordenação, configuração e placar zerado. Só coordenador participante online configura/inicia. Mínimo dois jogadores online, máximo doze slots ativos. Pessoas da Party que não participam não contam para iniciar. Rematch não começa automaticamente: retorna ao lobby, permitindo nova configuração.

## QUIZ CONFIGURATION

Presets: 5, 10, 15 ou 20 perguntas; Geral/Ciências/Matemática; Misto/Fácil/Médio/Difícil. Default 10/Geral/Misto. Backend valida allowlists, estoque suficiente, fase, coordenação, participação e revisão exata. Mudanças sincronizam para todos; controles dos não-coordenadores ficam disabled. Não há perguntas customizadas, editor ou duração configurável nesta etapa.

## QUESTION BANK

150 perguntas originais redigidas localmente para Lumio, em `apps/server/src/quizQuestions.ts`, somente no servidor. Cada entrada possui id, categoria, dificuldade, enunciado, quatro alternativas e índice correto. Fonte privada coloca a correta primeiro; isso não é a ordem pública, pois runtime embaralha.

Validação automática cobre ids únicos, prompts únicos após normalização, não-vazios, exatamente quatro respostas distintas normalizadas, índice correto válido, categorias/dificuldades válidas e ausência de HTML arbitrário. Cada pool específico tem 25 perguntas, suficiente para qualquer preset. Revisão de conteúdo foi feita por leitura do banco e amostras de cada grupo: H₂O, mitose, unidades SI, isótopos, empuxo; frações, MMC/MDC, geometria, derivada, integral, probabilidade e variância. Não há alegação de certificação editorial externa; calibração de dificuldade pode ser refinada com feedback humano.

Conteúdo é estável, sem notícias/política atual, material explícito, tragédias recentes, API de trivia ou IA em runtime. A busca nos assets do build por identificadores/enunciados do banco não encontrou inclusão do banco privado no frontend.

## CATEGORIES

| Pool | Fácil | Médio | Difícil | Total |
| --- | ---: | ---: | ---: | ---: |
| Ciências | 25 | 25 | 25 | 75 |
| Matemática | 25 | 25 | 25 | 75 |
| Geral (união, sem perguntas extras) | 50 | 50 | 50 | 150 |

Geral mistura as duas categorias. Optou-se por dois pools completos, não diversos temas pequenos/vazios. História, esporte, cinema e outros temas não foram adicionados artificialmente.

## DIFFICULTIES

Fácil/Médio/Difícil filtram o banco privado. Misto garante presença dos três níveis inclusive em cinco perguntas: sorteia ordem dos níveis, consome buckets independentes em round-robin e embaralha o deck final. Distribuição entre níveis: 5 → 2/2/1, 10 → 4/3/3, 15 → 5/5/5, 20 → 7/7/6; o nível que recebe a parcela maior varia.

## QUESTION SELECTION

Backend filtra categoria/dificuldade e seleciona sem reposição no deck da partida, por Fisher–Yates usando `crypto.randomInt`. Não há repetição dentro da mesma partida. Revanche pode repetir perguntas de uma partida anterior; não existe histórico permanente de quiz. Cada nova QUESTION recebe roundId único.

## ANSWER SECURITY

Deck, correctIndex privado, mapa de respostas/pontos provisórios ficam fora do snapshot público. Projeção individual retorna própria opção somente para quem respondeu; nunca respostas individuais dos outros. Antes de REVEAL não há correctIndex/correctAnswer, correctness, ownPoints, distribuição, explicação ou variação de score que revele acerto. A lista das quatro alternativas naturalmente contém o texto correto entre distratores; não contém marcação de qual é a correta.

Cliente envia índice 0–3. Campos extras como score são recusados pelo schema estrito. Backend exige sessão/pergunta válidas, jogador ativo online, fase QUESTION e prazo aberto. Identidade vem da sessão autenticada, não do payload. Testes verificam payloads completos, não apenas ausência no DOM.

## QUESTION PHASE

Mostra pergunta, quatro opções na mesma ordem para todos, progresso, tempo e pontuação anterior. Ao enviar, mostra “Resposta enviada” e número agregado de respondentes elegíveis. QUESTION termina quando todos os participantes ativos online responderam ou o prazo expira; resultado da última pergunta também passa pelo Reveal completo antes do resultado final.

## ANSWER LOCK

Uma resposta aceita por usuário/pergunta, armazenada no mapa privado. Duplo clique, tentativa de alteração, retransmissão ou reconnect não produzem segundo voto/ponto. Frontend bloqueia durante ack e após ownAnswer; backend impede duplicatas mesmo com cliente adulterado. Sem confirmação do servidor não há pontos otimistas nem retry cego de mutation.

## TIMER

QUESTION: 15.000 ms. REVEAL: 6.000 ms. Servidor calcula startedAt/endsAt e rejeita resposta em `now >= endsAt`, mesmo antes do próximo tick. Tick existente é de 250 ms; mudança de fase por timeout pode ocorrer até o próximo tick, mas não cria janela extra para respostas.

Frontend exibe contagem local corrigida por serverNow; timer visual atualiza a cada 250 ms, sem mensagem de socket por segundo. Não determina score, resultado ou validade. Background/mobile e skew de relógio precisam de QA físico; o prazo do backend continua sendo a autoridade.

## REVEAL

Somente em REVEAL a projeção inclui índice correto, distribuição agregada e próprio acerto/ganho. Pontos/correctCount são aplicados uma única vez ao sair de QUESTION. UI identifica correta com texto/check além de cor; informa acertou/errou/não respondeu e +pontos. Após 6 segundos servidor avança, sem botão cliente para pular o Reveal.

## DISTRIBUTION

Quatro contagens agregadas de alternativas. Incluem respostas aceitas da pergunta mesmo se alguém saiu depois de responder. Não expõem mapa de usuários/opções. Observadores veem a distribuição no Reveal mas possuem ownPoints 0; não alteram a contagem de elegíveis.

## QUIZ SCORE FORMULA

Se errada ou não respondida: 0. Se correta:

`6 + floor(3 × clamp((endsAt − acceptedAt) / 15000, 0, 1))`

Faixa matemática 6–9 por acerto. 9 só quando a fração é exatamente 1; no tráfego normal o máximo mais comum é 8. Aos 7,5 segundos restantes: 7. Pouco antes do deadline: 6. Não há penalidade por ordem dos jogadores, multiplicadores, streak ou placar de milhares. Conhecimento garante 6 pontos; rapidez só adiciona até 3. Cinco acertos podem somar de 30 a 45, sem target score G3.

## SCOREBOARD

Quiz usa lista compacta por score, nome/avatar, indicador “você”, acertos e offline. Ranking atribui mesma posição a scores empatados. Durante QUESTION mostra apenas score acumulado até perguntas já reveladas; não divulga ganho provisório da pergunta corrente. Placar detalhado aparece em lobby, Reveal e resultado, com rolagem interna quando necessário.

## RESULT

Após o último Reveal, maior score vence; todos no maior score compartilham vitória (inclusive empate em zero numa partida completada). Não desempata por latência/socket/ordem. Backend fornece winnerIds. Se não há jogadores suficientes para continuar, resulta insufficient_players, sem vencedor fictício. Registros de quem saiu durante a partida preservam score final; não há ranking global/persistência.

## REMATCH

Coordenador participante online em RESULT, com revisão exata e mínimo dois, retorna à mesma sessão LOBBY. Conserva categoria/dificuldade/quantidade, mantém participantes online elegíveis e zera scores/acertos/deck/pergunta/respostas/vencedores/contagem. É necessário iniciar novamente; não reinicia Party, player, Call, Chat ou fila.

## RECONNECT

room:join/open recuperam projeção individual autoritativa, sem segundo socket de jogo. Durante QUESTION: room/session/round/revision, host/fase, players com score anterior, configuração/progresso, startedAt/endsAt/serverNow, pergunta/opções públicas, contagem agregada, winnerIds vazio e própria ownAnswer somente se respondeu. Sem reveal/correctIndex/correctAnswer/ownPoints/ownCorrect/distribuição.

Reconectar dentro da grace conserva ownAnswer, mesmo se o componente anterior desapareceu. Se deadline/fase mudou, recebe estado atual e não responde à pergunta anterior. Frontend descarta revisão anterior da mesma sessão. Respostas aceitam revisão não-futura da mesma pergunta, permitindo concorrência: o voto de outra pessoa não invalida uma resposta legítima. Configure/start/rematch/end exigem revisão exata.

## LATE JOIN

Membro autorizado que chega no meio acompanha como observador; não pode votar/iniciar/configurar nem ocupar retroativamente slot na pergunta. Join só é aceito em LOBBY/RESULT. Pode participar da próxima partida/revanche. Observador não bloqueia early finish nem recebe respostas privadas.

## DISCONNECT

Offline deixa de contar para early finish imediatamente. Grace de cinco segundos permite retornar como ativo e conservar voto. Se os demais já concluíram, não reabre a QUESTION para o retorno. Expiração retira da lista ativa e transfere coordenação para próximo ativo online; pontos já registrados não desaparecem.

Saída explícita usa mesma retirada/transição; navegabilidade Media/Hub não equivale a leave. Com menos de dois online, a pergunta atual é resolvida e, após Reveal, a partida termina por insuficiência (ou completa normalmente se já era a última).

## MOBILE

Testadas larguras 320/360/375/390/412/430 em Chromium touch. Sem overflow horizontal; quatro alternativas com altura >=44px nos testes. Opções empilhadas, texto quebra sem truncar, status não se sobrepõe. Quiz ocupa aproximadamente 65% do canvas mobile; lobby usa 72%. Chat permanece abaixo com composer disponível. Lists/config/ações extensas usam rolagem interna; não se promete ver doze linhas e todas as ações simultaneamente sem scroll.

Capturas 320/390/430 foram abertas e inspecionadas. Os cards passaram a caber juntos; status em 320px ganhou espaço. Configuração recebeu estilo Lumio e header lobby deixou de alinhar o único bloco à direita. Teclado físico/virtual real, Safari/iPhone, Android, safe areas e gestos reais ainda precisam de confirmação humana.

## DESKTOP

Palco mantém hierarquia de Party. Quiz com largura máxima 850px, alternativas 2×2, configuração em linha quando há espaço. Breadcrumb, fullscreen e Dock existentes continuam. Capturas desktop de Hub, lobby, pergunta e navegação Draw foram inspecionadas.

## FULLSCREEN

Reutiliza a superfície existente de Jogos e capability detection de orientação, não player paralelo. Quiz prioriza pergunta/alternativas; Chat externo fica fora da superfície fullscreen e retorna ao sair. Não foi criado composer novo em fullscreen Quiz. Draw conserva seu composer G2 próprio. Em touch continua orientação para paisagem quando o browser não permite lock; captura portrait é evidência de fallback/emulação, não promessa de fullscreen retrato no aparelho.

## CHAT

Quiz usa conversa normal. Não reutiliza modo guess de Draw para opções; respostas via game:action nunca atravessam chat:message. Contexto social filtra gameType, mantendo metadados/guess somente Draw. Histórico, componente e rascunho do Chat permanecem durante navegação, rematch e QUESTION; E2E verifica identidade do nó e draft preservados. Pessoas podem revelar respostas pela conversa/voz voluntariamente; não há moderação anticolusão nesta etapa.

## CALL

Nenhum PeerConnection, socket de signaling ou track adicional de jogo. Entrada/mute/deafen/saída e permissões existentes preservados. E2E de voz com três clientes RTC reais locais passou (captura explícita, negação, reconnect e leave). Rede externa/STUN/TURN/provider físico não foi validada de novo.

## MEDIA

GameHub muda apresentação local no MainStage existente. MediaStage/engine/queue não foram reimplementados. Abrir ou fechar jogo não envia play/pause/seek/ended nem destrói media engine. Testes de lifecycle e G0 Drive/screen continuam passando.

## YOUTUBE

IFrame/API oficial e comportamento de mídia não foram alterados. O pequeno palco visível existente continua sob Jogos, sem iframe duplicado por jogo. A regressão local cobre apresentação/engine; reprodução real de YouTube, anúncio/autoplay e sincronização WAN requerem teste humano com provider.

## DRIVE

OAuth, scopes, tokens, vault, Range, tickets/grants e stream não foram tocados. E2E com fixture/native video confirma engine preservado, pausa/retorno e containment portrait/4:3/16:9. Teste OAuth/range existente usa upstream simulado; isso não substitui Google Drive real, revogação e consumo de rede em produção.

## SCREEN SHARE

Não há nova captura/stream de jogo. GameHub e Quiz utilizam Party existente. Regressão G0 verifica troca media/screen preservando engine; suporte físico a compartilhar tela no navegador móvel e TURN/WAN permanece manual.

## PEOPLE/QUEUE

E2E abre Pessoas e Fila enquanto Quiz está montado, fecha cada sheet e comprova que o mesmo nó Quiz permanece. Dados e mutações continuam da Party/Casa, não do jogo. Participantes Quiz não se confundem com membros da Casa ou pessoas da Call.

## ACCESSIBILITY

Botões semânticos, labels/fieldset de configuração, grupos nomeados, aria-pressed da escolha/config, status/alert de feedback e foco de heading nas transições. Resposta correta usa texto/check além da cor. Alvos mobile >=44px comprovados para respostas; sem bloqueio de zoom ou texto truncado. Não há efeitos piscantes/podium animado, timer não emite aria-live a cada tick.

Não foi feita certificação WCAG nem auditoria completa com leitor de tela/axe. Foco, teclado, contraste e anúncio de transições devem ser conferidos em leitores de tela e dispositivos reais.

## PERFORMANCE

Quiz lazy: chunk 6,25 kB (2,54 kB gzip) no build desta execução; Draw segue chunk separado 18,02 kB (6,43 kB gzip). Não carrega banco no bundle web. Timer é local; sockets só recebem ações/transições/projeções, sem polling de segundos. Draw segue delta/metadata sem board integral por resposta.

Quiz envia snapshot individual pequeno por mudança, não implementa delta genérico desnecessário. Limites: 12 ativos, presets até20, banco150, runtime1000, 8 ações/s por usuário/Party, inspect500ms e end1s. Não foi realizado benchmark de 1.000 sessões nem soak/load/WAN. Registros de jogadores saídos são mantidos no resultado da sessão; não há teto adicional de histórico de entradas/saídas além da participação ativa/expiração (ponto para futuro soak se houver churn extremo).

## SECURITY

Schemas estritos, identidade/sessão/membership verificados, envelope Draw impede room externo divergente do interno. Um jogo não pode interceptar ações do outro. Revisões futuras, stale pergunta/sessão, configure não autorizado, resposta duplicada/tardia, índice inválido e campo score são recusados. Score só é aplicado server-side, após Reveal.

Não há logging novo de respostas/deck, export do banco via HTTP, segredo no social context, biblioteca externa de trivia ou conexão nova de OAuth. Reinício perde jogos por design; não há recuperação persistente prometida. Auth/CSRF/CORS/cookies/rate limits gerais anteriores não foram redimensionados.

## TESTS

| Verificação | Resultado local |
| --- | --- |
| Baseline E2E G2/G3/automatic voice | 3/3 |
| Typecheck | passou |
| Lint (scripts do projeto, TypeScript noEmit) | passou |
| Backend após teste socket Quiz | 100 testes: 94 passaram, 6 pulados, 0 falhas |
| Frontend | 29/29 |
| Service worker | 4/4 |
| E2E completo | 9/9, 3,8 minutos |
| E2E G4 reforçado após resposta + reload | 1/1, 56,3 segundos |
| Build shared/server/web | passou |
| git diff --check | passou; somente avisos de conversão LF/CRLF |

Total backend+web+SW: 127 passaram, 6 pulados. Os seis testes opcionais PostgreSQL/boot compilado foram pulados por falta do ambiente específico; não são seis aprovações nem validação de banco de produção. Nenhuma alteração de banco foi necessária para G4. Após reforçar somente teste E2E, não se repetiram os outros oito fluxos sem mudança de código runtime/UI; todos passaram no lote completo anterior.

Os oito testes unitários G4 cobrem banco/configuração/autoridade, projeção, concorrência de votos, deadline exato antes de tick, score, fases, cinco perguntas, empate, rematch, 12slots, coordenação/grace/insuficiência, Misto e throttling, roteador/inspect/end/cross-room.

## MULTI-CLIENT

Teste novo `quizGame.integration.test.ts` executa backend real com três contas locais verificadas e sockets WebSocket: A e B jogadores, C observador. B responde, desconecta e reconecta na mesma QUESTION enquanto A ainda está pendente. Confirma ownAnswer restaurado e duplicata recusada. C não consegue votar/join mid-match/start; alternativas coincidem para todos. Inspeção de todo histórico de snapshots/state antes do Reveal não encontra campos de correção/distribuição/pontos provisórios, e A/C não recebem ownAnswer de B.

Também confirma ausência de resposta Quiz no Chat, conversa normal do observador, early Reveal após A/B responderem sem esperar C, distribuição2 e Reveal6s. Passou em aproximadamente3,6s de loopback; isso não representa WAN.

## E2E

Três contas/contextos independentes autenticados, três clientes reais do frontend/socket. A e C mobile, B desktop. Exercita Hub, opt-in, configurações sincronizadas, controls desabilitados, Pessoas/Fila sem remount, cinco perguntas únicas, mesma ordem, lock, navegação Hub/conflito/retorno, seis larguras, Reveal/distribuição/score, empate e resultado, rematch, encerramento confirmado e abertura Draw.

Na segunda pergunta B responde antes de reload e retorna locked ainda em QUESTION; C pendente impede early finish até terminar a verificação. Fullscreen entra/sai sem novo engine; Chat conserva draft e identidade. Payloads WebSocket B/C da primeira QUESTION são inspecionados antes de Reveal. Nenhum pageerror foi registrado nesse fluxo.

## VISUAL QA

15 capturas G4 geradas e abertas para inspeção (combinam Reveal/distribuição numa captura):

- `test-results/g4-hub-desktop.png`, `g4-hub-mobile.png`;
- `g4-draw-navigation-desktop.png`, `g4-draw-navigation-mobile.png`;
- `g4-lobby-desktop.png`, `g4-lobby-mobile.png`;
- `g4-question-desktop.png`, `g4-question-320.png`, `g4-question-390.png`, `g4-question-430.png`;
- `g4-answer-locked.png`, `g4-reveal-distribution-score.png`, `g4-score.png`;
- `g4-result.png`, `g4-fullscreen.png`.

Esses artifacts são locais/ignorados e podem ser substituídos na próxima execução de Playwright; não foram incluídos como binários versionados. Medições também cobrem360/375/412, sem prometer screenshot separado dessas três larguras. Capturas portrait/fullscreen são emulação Chromium; landscape físico continua manual.

Inspeção revelou/fixou cards mobile fora do primeiro fold e texto sobreposto em320px. Reveal/ranking/configurações longas usam scroll interno mantendo Chat estrutural. Skills React/composition influenciaram imports lazy, isolamento dos runtimes e preservação dos componentes persistentes.

Passagem exploratória extra com skill agent-browser: login sintético local, Hub, Quiz lobby, participação/config5/Ciências/Difícil, breadcrumb/reabertura preservando sessão. Não encontrou issues novas nesse recorte; errors retornou vazio. Os dois bots da fixture são Draw e não contam como jogadores Quiz: início disabled com um Quiz participante é correto. Documento local `.data/g4-visual-qa/report.md`, screenshot efetivo `C:/Users/Win 11/.agent-browser/tmp/screenshots/screenshot-1790685891934.png` inspecionado. Sessão/helper próprios foram encerrados. Não se tocou browser/conta real nem site hospedado.

## KNOWN LIMITATIONS

- Jogos efêmeros por processo; reinício/deploy encerra sessão. Sem multi-instância/Redis, persistência ou reconnect entre processos.
- Banco inicial apenas Ciências/Matemática; dificuldade é classificação editorial, não adaptativa. Rematch pode repetir perguntas anteriores.
- Pontuação9 exige aceitação no instante inicial exato, rara na rede; a faixa usual é6–8.
- Sem proteção contra colaboração voluntária no Chat/voz ou consulta externa.
- Scroll interno necessário com listas maiores/lobby/resultado no mobile; browser remoto não prova conforto físico.
- Fullscreen Quiz prioriza alternativas, sem Chat simultâneo dentro da superfície. Emulação não comprova orientation lock ou Safari.
- Sem teste de carga/soak nem auditoria WCAG formal, sem validação externa do conteúdo.
- Compatibilidade temporária do payload Draw legado não deve servir de padrão para futuros jogos.

## MANUAL_REQUIRED

Antes de publicar G4, executar com contas reais e dados controlados:

1. Android Chrome/PWA e iPhone Safari/PWA:320–430px, safe areas, scroll lobby/resultado com12, teclado virtual no Chat e foco/zoom.
2. Fullscreen em paisagem: entrar, girar, sair, fallback sem orientation lock; testar respostas e retorno do composer sem perda de draft.
3. Duas/três redes externas, TURN/STUN quando necessário, perda/retorno de internet, background/foreground e reconnect antes/depois dos5s e do deadline.
4. YouTube real: mídia contínua e sincronizada enquanto abre Hub/Quiz/Draw, autoplay/anúncios conforme provider; confirmar único iframe.
5. Google Drive real: vídeo com Range, troca mídia/screen, revogação de grant e retorno à mídia sem reiniciar stream indevidamente. Não alterar scopes para isso.
6. Microfone físico, mute/deafen, saída de áudio, screen share real, encerramento de jogo durante call sem perda de tracks.
7. Leitor de tela/teclado/reduced motion/contraste, mensagens de answer/reveal e reachability das ações por rolagem.
8. Conteúdo editorial: adequação de linguagem/dificuldade das150 perguntas; nenhuma correção automática especulativa de produção.
9. Soak/churn/lobby idle e cancelamento coordenador em redes lentas, confirmação recusada com revisão obsoleta e reabertura correta.

Não foi declarado QA hosted concluído; nenhum deploy/commit/push executado.

## FILES_CHANGED

Novos: `packages/shared/src/partyGames.ts`; `apps/server/src/partyGames.ts`, `quizGame.ts`, `quizQuestions.ts`, `quizGame.test.ts`, `quizGame.integration.test.ts`; `apps/web/src/games/QuizGame.tsx`, `GameScoreboard.tsx`; este relatório.

Alterados: `packages/shared/src/index.ts` (unions/eventos); `apps/server/src/index.ts` (roteador/fanout); `apps/web/src/components/GameHub.tsx` (registry/nav/end/lazy); `games/DrawGame.tsx`, `games/PartyGameChat.tsx` (envelopes/filtro); `apps/web/src/styles.css` (Quiz/mobile/nav); `apps/web/src/security.test.tsx` (dois cards SSR); `e2e/party.spec.ts` (G4); `docs/AGENT.MD`, `docs/CLAUDE.MD` (invariantes permanentes).

Nenhum PROJECT_CONTEXT foi criado: arquivo não existe no projeto. Artefatos QA locais ignorados não são mudanças de produção.

## RESPOSTAS OBRIGATÓRIAS

1. **Botão solto:** virou breadcrumb “Jogos” no cabeçalho, junto a Media/fullscreen; não está mais isolado/centralizado.
2. **Hierarquia:** Media ↔ Hub ↔ jogo escolhido; controles locais separados de participação/lifecycle servidor.
3. **Abrir Hub encerra?** Não. Só seleção local muda; encerramento é ação coordenada explícita confirmada.
4. **Coexistência:** dois runtimes atrás de PartyGames usam a mesma Party, socket, Chat, Call e player; uma sessão por vez, sem sistemas sociais duplicados.
5. **Compartilhadas:** registry/tipos/eventos, roteador/autorização, lifecycle/nav/end, superfície fullscreen e componentes visuais básicos.
6. **Específicas:** canvas/palavra/guess/G3 versus banco/deck/resposta/reveal/score Quiz; cada runtime/projeção mantém regras próprias.
7. **Concorrência:** mapa room→tipo e rejeição server-side de tipo incompatível; liberar exige end autorizado ou cleanup, não troca de tela.
8. **Quantidade:**150.
9. **Distribuição:**75 Ciências e75 Matemática;25 de cada dificuldade por categoria. Geral é união150,50 de cada nível.
10. **Repetição:** deck sem reposição na partida; rematch não garante ausência de perguntas vistas na partida anterior.
11. **Alternativas:** Fisher–Yates privado com crypto.randomInt, uma ordem por pergunta compartilhada por todos; remapeia índice correto privado.
12. **Fórmula:** errada/ausente0; correta `6 + floor(3 × clamp((endsAt − acceptedAt)/15000,0,1))`.
13. **Faixa:**6–9 matematicamente;9 somente no instante inicial exato, geralmente6–8 na rede.
14. **Rapidez:** bônus0–3 sobre6 garantidos por conhecimento; sem bônus de ordem/streak.
15. **Fim QUESTION:** todos ativos online responderam ou deadline, decidido no servidor.
16. **Durações:**15s QUESTION e6s REVEAL.
17. **Segredo:** deck/correctIndex/answers privados; snapshot público seguro e projeção ownAnswer individual; score só muda no Reveal.
18. **Reconnect QUESTION:** ids/revisão/fase, participantes/score anterior/config/progresso, pergunta/opções, horários/contagens e própria opção se respondeu. Nenhum campo de correção/reveal.
19. **Lock reconnect:** backend mantém resposta por identidade+pergunta; ownAnswer restaura UI locked e mapa rejeita duplicata, independente do browser.
20. **Spectator/offline:** não bloqueiam early finish; grace permite recuperar slot/voto mas não reabrir pergunta já revelada.
21. **Empate:** todos com maior score compartilham vitória; sem tiebreak de socket/latência.
22. **320–430:** seis larguras medidas, opções empilhadas>=44px, wrapping e scroll vertical interno, Chat estrutural abaixo; QA físico pendente.
23. **Chat QUESTION:** conversa normal da Party; opção não vira mensagem/palpite. Draft/histórico/componente preservados; fullscreen Quiz prioriza perguntas.
24. **Não clone:** arte SVG original, paleta Lumio escura, cartões discretos, pontos pequenos, tipografia/hierarquia existente; sem cores/logos/sons/assets/layout copiados de Kahoot/Quizizz.
25. **Evidência de não vazamento:** unitários inspecionam JSON para jogador/observador; integração real3sockets verifica histórico antes deReveal inclusive reconnect locked; E2E captura frames recebidos B/C. Não é só esconder no DOM.
26. **Draw G3:** sim, runtime/tests anteriores, integração real3sockets e E2E G2/G3 continuaram passando após o roteador multi-game.
