# PÓS-1.0 — G1 Lumio Draw Game

Data: 2026-09-28. Base de trabalho: `c3f701c`.

## STATUS

Desenhe e Adivinhe implementado dentro da Party existente, com servidor autoritativo, desenho incremental, pontuação, duas voltas, resultado final e revanche. Não é mais um placeholder do G0.

Verificação local: typecheck, lint, build, regras unitárias, três clientes Socket.IO autenticados e Playwright executados. A suíte completa de sete E2E passou; o cenário de voz foi adicionalmente ampliado para desenhar durante transmissão real de áudio e passou em rerun direcionado.

Nenhum commit, push, deploy, migration, `db push`, reset, mudança de schema ou alteração de OAuth/Auth foi executado. Os arquivos preexistentes `apps/server/scripts/inspect-house-schema.cjs` e `docs/HOUSE_RESTORE_P2022_REPORT.md` foram preservados. O P2022 de produção não é corrigido nem reclassificado por esta etapa; esta validação usa armazenamento temporário local isolado, não o banco de produção.

QA em aparelhos físicos, serviços Google reais e redes externas continua necessário antes de anunciar suporte completo em produção.

## ARCHITECTURE

Reutiliza MainStage, GameHub, useFullscreenSurface e o mesmo socket autenticado da Party. MainStage recebe apenas a conexão existente e muda a apresentação local. Abrir Jogos não muda a experiência dos outros usuários nem cria outra sala, rota, chat ou call.

`DrawGameRuntime` é um runtime específico pequeno: uma sessão em memória por `roomId`, projeções por usuário e um relógio injetável para testes. Não há framework, registry de jogos futuros, Redis, broker, ranking global ou novo banco.

O frontend é carregado por `React.lazy` somente ao selecionar Desenhe e Adivinhe. O canvas mantém pontos e pintura em refs; movimentos não atualizam estado global da Party. Essa separação e o carregamento tardio seguem as boas práticas React usadas nesta etapa.

## GAME SESSION MODEL

- 2–12 jogadores; estar na Party não significa jogar. Participar é explícito.
- Identidade, nome, avatar e cor vêm do usuário Lumio autenticado; o jogo não possui perfil próprio.
- Coordenador inicial: criador da sessão, que também precisa participar para iniciar. Esta autoridade só inicia o jogo; não concede privilégios de House, mídia ou administração.
- Se o coordenador sai/expira a reconexão, passa ao primeiro participante ativo e online. Uma sessão sem coordenador pode ser assumida pelo próximo participante.
- Ordem: inscrição no início da partida; duas voltas, portanto `2 × participantes iniciais` posições. Participantes ausentes são pulados. A interface permite consultar a ordem.
- Fases: `LOBBY → CHOOSING_WORD → DRAWING → ROUND_RESULT`, repetidas até `GAME_RESULT`.
- IDs de sessão e rodada, revisão de metadados e revisão do desenho são independentes de `media.revision` e `queueRevision`.

## PROTOCOL

`game:action` é uma union Zod discriminada e estrita, com acknowledgment. Ações: `open`, `sync`, `join`, `leave`, `start`, `rematch`, `choose`, `guess`, `stroke`, `undo`, `clear`.

Exceto open, ações identificam Party, sessão, rodada e revisão. Start, rematch, undo e clear exigem a revisão exata. Desenho incremental exige offset correto, identidade do desenhista, fase e prazo; operações anteriores a undo/clear são rejeitadas por uma fronteira de revisão de canvas. Rodadas antigas nunca são reaproveitadas.

Servidor → cliente:

| Evento | Conteúdo e uso |
|---|---|
| `game:snapshot` | Estado reconstruível, incluindo traços; entrada, abertura, sync, reconexão e resets do desenho. |
| `game:state` | Metadados sem traços, quando o socket já recebeu a revisão do board; palpites/pontos não retransmitem o canvas. |
| `game:draw` | Lote incremental de um traço, offset, sessão/rodada e boardRevision; nenhum segredo. |

Snapshots/metadados são individualizados por socket. O backend verifica sessão autenticada, membership atual, Party ingressada e revogação. Não aceita roomId arbitrário nem identidade enviada na ação. A UI trata disconnect e falta de acknowledgment, sem repetir mutations cegamente.

## PUBLIC VS PRIVATE STATE

Todos recebem fase, participantes, coordenador, ordem, desenhista, pontos, timestamps, máscara, feed e desenho conforme o evento.

Somente o desenhista ativo recebe `choices` durante CHOOSING_WORD e `secretWord` durante DRAWING. São campos da projeção privada, não de um broadcast de sala. Estado interno contendo palavra, opções, sets e mapas não é serializado como snapshot público.

Em ROUND_RESULT/GAME_RESULT existe a revelação intencional `revealedWord`. Isso não deve ser confundido com vazamento durante escolha/desenho: revelar a resposta no resultado faz parte da regra solicitada. Guessers nunca recebem o campo privado `secretWord`.

## WORD SECURITY — EVIDÊNCIA

1. `drawGame.test.ts` consulta projeções de drawer, dois guessers e observador: somente drawer recebe opções/segredo. Antes do resultado, as projeções dos demais não contêm a palavra selecionada.
2. `drawGame.integration.test.ts` inicializa o backend real e conecta três clientes Socket.IO com contas diferentes, autenticação e convite. Captura os payloads recebidos em `game:snapshot`, `game:state` e `game:draw` — não apenas o DOM.
3. Após B acertar, com C ainda elegível e a fase ainda DRAWING, testa o JSON de todo o tráfego recebido por B/C: a resposta escolhida está ausente. O feed contém apenas o aviso de acerto, com pontos server-authoritative.
4. Só após C acertar o servidor entra em ROUND_RESULT e revela a palavra. Na rodada seguinte, somente B recebe as novas opções; A deixa de ser o drawer.
5. E2E verifica ausência da resposta no campo dos guessers, inclusive após reload de B, e a revelação apenas no resultado.

Não há CSS escondendo segredo, palavra no payload de stroke ou banco de palavras entregue ao frontend. O banco contém 120 termos PT-BR locais selecionados para Lumio, sem API, IA, scraping, código ou assets de outro jogo.

Limite desta proteção: amigos podem deliberadamente contar a resposta pela voz/Party Chat. O aplicativo não tenta censurar conversas ou impedir conluio humano. As garantias são sobre projeção e protocolo do jogo, não sobre o que usuários dizem.

## DRAWING ENGINE

Canvas lógico 800×600, 4:3, independente da dimensão CSS. Pointer Events suportam mouse, toque e caneta quando fornecida pelo navegador; pointer capture conserva o traço, e `touch-action:none` vale apenas no canvas.

Coordenadas normalizadas 0..1; pincel, sete cores, três espessuras, borracha, desfazer último traço e limpar. Não há importação de imagem, texto, layers ou ferramentas extras. Borracha pinta o fundo do board, sem remover a geometria do histórico.

Interpolação linear entre amostras, com extremidades arredondadas. A mesma sequência de operações raster é usada localmente, nos lotes remotos e na reconstrução. Um problema inicial de diferenças entre caps/joins por lote foi corrigido; o E2E compara pixels do canvas entre drawer mobile e viewers desktop, após borracha, undo, resize e reconexão.

## DRAWING SYNC

Pintura local imediata, sem aguardar servidor. Envio a cada 50ms ou lote cheio, no máximo 32 pontos por lote. Não envia screenshot/base64 ou evento por pixel. A comparação PNG existe apenas no teste, nunca no protocolo de gameplay.

O servidor mantém os traços canônicos. Cada append gera boardRevision; offset, ferramenta, cor e espessura devem coincidir com o traço. O cliente reconhece ecos otimistas, ignora deltas antigos e pede sync se houver lacuna.

Undo/clear geram nova revisão e snapshot completo, impedindo que lote atrasado ressuscite um desenho apagado. Snapshots somente de metadados não apagam traços locais em andamento. Trocar para mídia/Hub pode desmontar a superfície de desenho, mas não encerra a participação: voltar reconstrói o desenho aceito pelo servidor. Pontos ainda não enviados no instante do unmount não são garantidos.

## GUESS SYSTEM

Palpites são ações próprias do jogo e nunca mensagens do Party Chat. Até 80 caracteres, trim, lowercase, NFD sem acentos e colapso de espaços. Comparação exata normalizada, sem fuzzy matching.

Somente participantes online, diferentes do drawer e ainda sem acerto podem enviar. Payloads não permitem informar score, trocar desenhista ou escolher uma palavra arbitrária. Resposta correta produz aviso de acerto sem seu texto; palpites incorretos contendo a resposta completa normalizada também não a divulgam no feed. Feed limitado a 40 entradas, com cinco exibidas normalmente.

## SCORING

Para um acerto válido: `100 + ceil(100 × tempo_restante / 80000)` pontos, portanto 101–200 dentro do prazo. O desenhista recebe 40 pontos por participante que acerta. Sem acerto: zero. A fórmula é calculada só no servidor.

O marcador `guessed` impede pontuação duplicada. Pontos são zerados na revanche. Placar final ordena pontuação decrescente, sem XP, moedas, ranking global ou persistência.

## ROUND FLOW

15s para escolher entre três palavras; no timeout o servidor escolhe a primeira opção. 80s de desenho. 5s para o resultado antes do próximo drawer.

`startedAt`, `endsAt` e `serverNow` sustentam a contagem local, com correção de offset em snapshots. O servidor verifica transições a cada 250ms, mas não transmite evento a cada segundo. Ações no/depois do prazo são recusadas mesmo antes do próximo tick.

Se todos os guessers elegíveis online acertarem, resultado antecipado. Saída de drawer encerra a rodada; saída do último guesser pendente também evita espera desnecessária. Com menos de dois participantes online elegíveis na próxima fronteira, a partida termina. Resultado final permite revanche na mesma sessão/Party ou voltar ao Hub/mídia.

## RECONNECT / LATE JOIN

Entrada no meio da partida observa até GAME_RESULT; não entra na ordem em andamento. Reload/reconexão antes da grace period conserva participação e recebe fase, prazo, scores, acertos e board canônico. Só o drawer legítimo recebe novamente seu segredo.

Sair explicitamente do jogo é diferente de mudar a apresentação. Sair da Party ou perder membership remove participação. Múltiplos sockets da mesma conta só produzem ausência quando a última conexão à Party cai.

Sessões paradas em lobby/resultado expiram após 30 minutos sem ações. O frontend informa que é preciso reabrir o jogo. Reinício do backend perde o jogo efêmero; House, membership, Auth, mídia e biblioteca não são apagados.

## DRAWER DISCONNECT

Grace period de cinco segundos. Voltando antes disso, o board e o segredo continuam. Expirando, o usuário sai dos ativos, rodada termina, coordenação pode ser transferida e a próxima rodada pula ausentes. O relógio da rodada não pausa durante a queda. Prazo da fase continua prevalecendo, mesmo dentro da grace period.

## MOBILE

QA automatizado em 320, 360, 375, 390, 412 e 430px: canvas próximo à largura útil, 4:3, preservação de pixels no resize, chat estrutural, People/Queue, ausência de overflow horizontal e touch-action do canvas. Desenho por toque usa entrada touch real do Chromium via CDP, com Pointer Events do navegador, não só chamadas diretas ao runtime.

No retrato, game ocupa uma parcela maior do workspace e possui rolagem própria; chat/composer continuam estruturais. Ferramentas têm alvos de pelo menos 44px e não sobrepõem o board. Campo de palpite usa layout flex sem largura horizontal excedente. Altura reduzida para 500px foi testada como simulação de viewport/teclado, não como teclado Android/iOS real.

Decisão explícita com YouTube: iframe único e região 200px permanecem visíveis abaixo da área rolável do jogo. Não esconder playback, extrair áudio, duplicar ou desmontar provider. Para desenhar com maior área, fullscreen paisagem é recomendado; board e ferramentas passam a colunas separadas. Com YouTube em fullscreen paisagem, sua região continua separada à direita. Conteúdo/ferramentas podem precisar de rolagem em telas curtas; o canvas não é reduzido a thumbnail.

Fullscreen usa o hook existente, capability detection, tentativa de paisagem e fallback identificado. O teste Windows não consegue redimensionar a janela durante fullscreen nativo: testa entrar/sair em retrato e em paisagem separadamente. Rotação física durante fullscreen ainda precisa de QA real.

## DESKTOP

Board à esquerda e controles/palpites à direita, com tamanho de apresentação ajustado à altura da janela e resolução lógica estável. Mouse foi exercitado por Playwright, com pointer down/move/up, borracha e undo. QA visual encontrou clipping na janela 1262×632; o layout em colunas corrigiu isso, e uma asserção E2E verifica board/palpite dentro da janela nessa dimensão. Foco inicial do jogo, nomes acessíveis das ferramentas, seleção por aria-pressed e outline, labels, disabled e anúncios de fase/resultado estão presentes. Redução de movimento preserva as regras existentes.

## CALL PRESERVATION

Não altera RTCManager, signaling, STUN/TURN, tracks ou call membership por abrir/fechar Game. E2E de três usuários com RTCPeerConnection real e áudio sintético valida aumento de packetsReceived, mesmo número de peers/capturas, drawer desenhando com microfone ativo, recepção de B, deafen, reconnect, permissões negadas e saída. Não equivale a validar TURN em WAN.

## CHAT PRESERVATION

Mensagem da Party enviada durante desenho aparece em outro usuário após abrir seu chat. Feed do jogo é outra superfície/protocolo. Chat mobile permanece disponível fora de fullscreen e retorna depois; G0 também regrede preservação de rascunho/histórico. Game não recebe uma call/chat novos.

## MEDIA / QUEUE PRESERVATION

Não altera comando de playback, autoplay, provider, playhead, operationId, revisões ou fila. MediaStage conserva a posição estável na árvore React; Game não cria outro engine. Regressões verificam identidade do iframe, contadores de criação/destruição e estado ao voltar, além de navegação da fila/Media Hub e player nativo Drive.

YouTube no E2E usa SDK/network fixtures locais; não afirmar validação contra serviço Google real. Drive usa vídeo nativo/Range fixture sem tokens reais. Uma fixture antiga de MediaRecorder produzia zero frames no Windows; o teste foi corrigido para emitir frames enquanto grava, sem mudar o provider de produção.

## SCREEN SHARE

Track e screen stream continuam fora da participação do jogo. Alternar apresentação não emite screen:stop nem cria track. E2E G0 conserva engine Drive e srcObject ao alternar jogo/tela/mídia. Captura real da tela, permissões do sistema e envio entre redes devem ser testados manualmente.

## SECURITY / LIMITS

| Limite | Valor |
|---|---|
| Participantes | 12 por sessão; mínimo 2 para iniciar |
| Sessões | 1000 no processo; uma por Party |
| IDs | 1–100 caracteres |
| Palpite | 1–80 caracteres; até 4/s por usuário/Party |
| Controle | até 8/s por usuário/Party |
| Lotes de desenho | até 35/s; 1–32 pontos por lote |
| Traço / board | 512 pontos/traço; 128 traços; 8192 pontos totais |
| Coordenadas | números finitos entre 0 e 1 |
| Espessura / cores | .002–.05 normalizado; allowlist de sete cores |
| Transporte | limite existente de entrada 64 KiB; game:action até 2400/min por identidade |

Rate limits não substituem phase/drawer/membership checks. Guarda de sessão revogada e membership é mantida no middleware e no fanout; remoção da House desconecta o cliente e retira o player. Exclusão da House limpa sua sessão. Ack ausente/não funcional é tratado sem chamada insegura, com teste real de cliente que envia argumento inválido. Não loga palavra, palpites, conteúdo de desenho ou credenciais. Renderiza feed/perfis como texto React, não HTML arbitrário.

## PERFORMANCE

Paint imperativo por amostra; transporte agrupado a cada 50ms; metadados não reenviam o board. Snapshots completos são reservados a abertura/sync/reset/reconstrução. Ambos os tipos de revisão ordenam a entrega sem tocar revisão de mídia.

Na integração local: amostra de 2 pontos gerou delta de 261 bytes; palpite→estado no terceiro socket medido em 3ms, 7ms e 19ms em execuções distintas. São amostras em loopback, não p95, teste de carga ou promessa em produção. Teste afirma ausência do campo strokes no evento de atualização de acerto e ausência de snapshots por desenho/ticks sem transição.

Build final mediu chunk lazy DrawGame em 10,78 kB, 4,05 kB gzip. Não foi medida uma partida de horas, CPU em aparelho antigo ou concorrência de centenas de Houses. Snapshots completos ainda são proporcionais ao board, mas bounded pelos limites acima.

## TESTS

`npm run test`: 84 testes servidor (78 passaram, 6 opcionais ignorados), 25 frontend passaram e 4 service-worker passaram. Os skips são cinco integrações PostgreSQL e um bootstrap compilado PostgreSQL sem configuração de banco de QA; não se acessou produção para executá-los.

G1 adiciona nove testes unitários de runtime, uma integração real de três sockets e dois testes de geometria/pintura. Cobrem os 28 comportamentos solicitados, incluindo autoescolha, normalização, idempotência, deadlines antes de tick, capacidade, limits separados de throttling, undo/clear obsoletos, grace period, late join, partida completa e rematch.

`npm run typecheck`, `npm run lint`, `npm run build`: passaram. Lint deste projeto é checagem TypeScript; não há afirmação de auditoria ESLint independente.

## E2E

`npm run test:e2e`: sete cenários passaram localmente. Novo happy path com três contas e browsers isolados percorre participação, start, escolha privada, desenho por toque, pixels nos viewers, borracha, undo, reload, seis larguras, chat, ferramentas, fullscreen, clear, erro/acerto e próximo drawer.

Regressões: Landing/Auth/House/logout/exclusão, convites, voz real sintética de três peers, player/chat mobile/YouTube fixture, Drive engine/tela e vídeo nativo em três proporções. Depois da ampliação para desenho com microfone ativo, rerun direcionado `--grep 'G1|automatic voice'` também passou.

Evidências de screenshots são geradas em `test-results/g1-mobile-{320,360,375,390,412,430}.png`, `g1-landscape-fullscreen.png` e `g1-next-drawer-desktop.png`. Pasta é saída local de teste, não artefato publicado. O CLI de navegador também foi usado numa fixture temporária visual e sua observabilidade aberta no painel do Codex; nenhuma conta hospedada real foi alterada.

## KNOWN LIMITATIONS

- Sessão de jogo é efêmera e pertence ao processo único; restart encerra jogo. Não suporta multi-instância distribuída.
- Late join joga só depois do resultado final; a ordem em andamento não é modificada para inseri-lo.
- Registros de pontuação de quem saiu não ocupam uma vaga ativa na próxima partida. O teste completa uma partida de 12, remove um jogador durante a rodada, admite um novo no resultado e inicia revanche com 12 ativos.
- Não há pause do jogo, seleção de categorias, fuzzy matching, moderação de palpites ou desenho por teclado.
- Board tem limites reais; ao atingi-los, limpar permite continuar a rodada.
- Altura reduzida/fullscreen em Chromium não prova teclado/orientação/gestos em iOS ou Android físico.
- Fixtures provam lifecycle/geometry, não autorização real Drive, política do YouTube ou TURN hospedado.
- Não há benchmark WAN, acessibilidade com leitor de tela real ou partida longa sob carga.

## MANUAL_REQUIRED

Antes de publicar/validar com amigos:

1. Resolver separadamente o problema de persistência de produção pelo procedimento já documentado, preservando dados e exigindo autorização para mudança em produção.
2. Rodar com 2–3 contas reais, diferentes aparelhos e redes: jogo + voz + chat; conferir reconexão e comportamento de NAT/TURN existente.
3. Android Chrome e Safari/PWA iOS: toque/stylus disponível, browser gestures, teclado real com palpite, safe areas e rotação física durante fullscreen.
4. Combinação YouTube real + drawing + chat nos celulares, garantindo que o player continua visível e sem segunda instância; repetir Drive OAuth/streaming e retorno ao player.
5. Screen share real vivo enquanto outro usuário desenha; browser com fullscreen nativo indisponível para conferir fallback.
6. Completar partida de 2 e de mais jogadores, revanche, saída do coordenador e sessão longa; leitor de tela/contraste em dispositivos reais.

Para QA local descartável: `node scripts/draw-game-qa.cjs`. Ele informa URL e credenciais sintéticas, cria dois participantes Socket.IO, usa portas/arquivos temporários e limpa seus recursos ao encerrar normalmente. Não lê credenciais Google para usá-las nem altera o .env do projeto. As contas de fixture não são contas de produção.

## FILES_CHANGED

- `packages/shared/src/drawGame.ts` e `index.ts`: contrato, schemas, eventos, revisões.
- `apps/server/src/drawGame.ts`, `drawWords.ts`, `index.ts`: autoridade, conteúdo e integração com lifecycle/membership.
- `apps/server/src/drawGame.test.ts` e `drawGame.integration.test.ts`: regras, limits e evidência de segredo no tráfego.
- `apps/web/src/games/DrawGame.tsx`, `DrawCanvas.tsx`, `drawing.ts`, `drawing.test.ts`: UI, canvas, coordenação e testes.
- `apps/web/src/components/GameHub.tsx`, `MainStage.tsx`, `apps/web/src/App.tsx`: seleção lazy e conexão existente.
- `apps/web/src/styles.css`, `package.json`: layouts mobile/desktop/fullscreen e execução de testes do canvas.
- `e2e/party.spec.ts`: happy path G1, microfone durante desenho, YouTube compacto e fixture nativa robusta.
- `scripts/draw-game-qa.cjs`: fixture local descartável para QA visual.
- Este relatório, `docs/AGENT.MD`, `docs/CLAUDE.MD`: invariantes e handoff.

Nenhuma dependência nova, variável de produção, migration, model Prisma ou arquivo .env foi alterado.
