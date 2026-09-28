# Lumio — Pós-1.0 G2 Party Games Experience V2

Data: 2026-09-28. Base do checkout: `4d972e3`. Relatório da implementação local, não de um deploy.

## STATUS

Implementação G2 e validação local concluídas na Party existente. Typecheck, lint, testes de código, build e sete E2E passaram. Validação em aparelhos, redes e providers reais permanece manual, conforme MANUAL_REQUIRED.

Não houve commit, push, deploy, alteração de .env, Auth, OAuth, scopes Drive, infraestrutura, schema Prisma, migration, db push/reset ou acesso mutável à produção. O diagnóstico P2022 de produção continua assunto separado. Nenhuma dependência nova.

## AUDIT

Foram lidos prompt G2 completo, AGENT.MD, CLAUDE.MD, relatórios G0/G1 e documentos de entrada, social e call. PROJECT_CONTEXT.md não existe neste checkout; não foi criado. Git estava limpo no início. Fonte real auditada: App/ChatPanel, MainStage, GameHub, DrawGame/DrawCanvas, contrato compartilhado, runtime e testes.

Estado inicial confirmado: campo de palpite e feed independentes do Chat, escolha inline de palavras, toolbar textual, ausência de listener Ctrl/Cmd+Z e placar sem feedback de ganho. O E2E G1 de três usuários passou antes das alterações.

Preservados: uma sessão efêmera por Party, participação explícita, 2–12 ativos, duas voltas, ordem, cinco fases, prazos do servidor, projeção privada, canvas incremental, limits, scoring, rematch, reconnect/grace period, mesmo socket autenticado e serviços da Party.

## GAME HUB V2

Um card real, com SVG original de lápis/traço criado no código. Hierarquia: ícone → nome → 2–12 jogadores. Removidos explicação repetitiva, marketing e promessa de jogos futuros.

Grid auto-fit comporta vários cards quando jogos reais existirem, sem inventar catálogo, registry ou cards “em breve”. Botão nativo, foco e nome acessível; Game continua lazy-loaded. Hub não inicia sessão nem participação por si só.

## DRAW GAME UX V2 / TOP STATUS

Status identifica rodada/total, desenhista e fase; timer em minutos/segundos. Participante vê seus pontos e posição ao lado do tempo, inclusive quando o placar completo fica abaixo da dobra no mobile. Máscara/segredo continuam na área própria.

Canvas 800×600 lógico, 4:3, continua protagonista. Sair do jogo foi movido abaixo das informações, liberando espaço útil. Voltar aos jogos/mídia continua apresentação local, não leave.

## WORD CHOICE UX

Mini diálogo integrado ao Game Stage, sobre contexto visual com backdrop/blur leve. Três opções somente para drawer; título e timer visíveis. Não há alert/confirm nativo, rota nova nem modal global.

Foco entra nas opções, Tab/Shift+Tab circulam entre elas e Escape não descarta a escolha. Conteúdo de fundo do jogo fica inert durante a escolha; Chat externo não recebe a palavra. Escolher/expirar fecha pela transição do servidor. Na transição para DRAWING, foco vai ao canvas do drawer.

Timer é apresentação baseada em endsAt/serverNow/offset. Regras continuam 15s escolha, 80s desenho e 5s resultado; autoescolha permanece no backend.

## CTRL/CMD+Z

Listener usa estado atual por ref e a mesma função do botão Desfazer: flush dos lotes pendentes → game:action/undo → validação/revisão no servidor → board sincronizado.

Só atua quando canvas está habilitado para o drawer em DRAWING e dentro do prazo. Ignora input, textarea, select, contenteditable/role textbox, overlays, evento já consumido, repetição, Alt e Shift (não captura redo). Ctrl e Meta são aceitos. Guesser/espectador não ganham autoridade por usar a tecla.

No teste Chromium Windows, Meta+Z exercita o caminho de evento equivalente a Cmd+Z; isso não substitui QA num Mac físico.

## MOBILE UNDO / TOOLBAR V2

Primeira linha prioriza pincel, borracha, Desfazer explícito e limpar. Ícones têm nomes acessíveis/title; Desfazer mantém texto. Alvos de pelo menos 44px. Cores ficam na linha seguinte, com scroll horizontal interno nos espaços estreitos; espessura tem label acessível.

Clear abre confirmação compacta contextual, com Cancelar/Confirmar limpeza e Escape. O primeiro toque não apaga o board. Falhas de undo/clear pedem sync autoritativo, sem aplicar histórico puramente local.

## CHAT/GUESS INTEGRATION

PartyComposer reutilizado no Chat e fullscreen. PartyGameChatProvider conserva rascunhos separados da Party e acompanha somente snapshots/metadados públicos; não assina game:draw.

Guess elegível exige jogo selecionado, socket conectado, DRAWING, participante online, não drawer, sem acerto. Palpitar é o modo inicial de cada rodada elegível; Conversar é troca explícita simples. Cada modo indica o destino e tem placeholder/aria-label próprios.

Drawer, observador, quem acertou e quem voltou à mídia usam conversa normal. Após acerto o composer muda naturalmente para conversa. Rascunho normal fica preservado; rascunho de guess não passa ao Chat e é descartado ao mudar a rodada.

Rascunhos vivem em memória por Party: resistem à troca de painel, apresentação, fullscreen e breakpoint, mas não sobrevivem a reload completo, logout ou saída da Party. Não foram gravados em storage. Não há promessa de confirmação offline; palpite só limpa após ack positivo, com busy guard e erro contextual.

## CHAT VS GAME PROTOCOL DECISION

UI unificada, autoridade separada:

- Conversar → chat:message existente.
- Palpitar → game:action existente, type guess, sessão/rodada/revisão e ack.
- Backend compara, valida e pontua; cliente nunca decide acerto.

Feed separado foi removido do Game Stage. Seus eventos seguros são mesclados cronologicamente ao histórico visual do Chat, com rótulo do jogo. Timestamp é calculado no servidor. Não há duplicação de listas, outro chat global nem persistência desses eventos como ChatMessage.

Feed continua efêmero e limitado a 40 eventos no runtime; rematch reinicia e restart perde o jogo. Mensagens normais mantêm armazenamento/protocolo existentes. Trocar apresentação não apaga visualmente os eventos ainda presentes na sessão.

Desktop abre Chat ao selecionar Draw Game, uma vez; depois o usuário pode trocar/fechar o painel. Mobile conserva Chat estrutural.

## SECRET WORD SECURITY

Backend conserva projeções individuais: choices somente no CHOOSING_WORD do drawer; secretWord somente em DRAWING para ele; revealedWord apenas no resultado permitido.

Palpite correto gera exclusivamente “Nome acertou!”, sem texto bruto. Palpite incorreto que contém a resposta completa normalizada conserva sanitização G1. Normalização, deadline, membership, drawer, guessed/idempotência, limits e rate limiting não foram relaxados.

Provider social omite explicitamente choices, secretWord e strokes. Não coloca opções no DOM de guessers, hidden elements, data attributes, logs, snapshots públicos ou CSS.

Integração real inspeciona todo payload recebido antes da revelação; também captura chat:message e confirma ausência de broadcast para guesses incorretos/corretos. E2E verifica ausência da resposta nos outros clientes/feed antes de ROUND_RESULT.

Limite: pessoas podem deliberadamente dizer a resposta na voz ou escolher Conversar e escrevê-la. Não foi criada censura/conluio detection. A garantia é do fluxo automático de palpite e das projeções, não de toda comunicação humana.

## SCOREBOARD V2

Classificação por score decrescente, posições com empate, avatar/cor, nome, pontos, estado relevante (desenha, acertou, coordena, ausente). Não há XP, moedas, global ranking ou painel analítico.

Desktop usa lista compacta junto do canvas. Mobile usa itens compactos; pontos/posição pessoal continuam no header. Em fullscreen o placar rola horizontalmente sem esmagar canvas/composer; todos os participantes continuam acessíveis por scroll.

## SCORE FEEDBACK

Badge temporário de ganho e highlight curto derivam da diferença de scores autoritativos recebidos. Anúncio acessível moderado para ganho pessoal. Não transmite board por score.

Servidor adiciona roundPoints por userId, somente números. Acertante recebe a fórmula G1 (101–200 dentro do prazo); drawer recebe 40 por acerto. RoundPoints reinicia em cada rodada e não altera score acumulado.

Drawer vê “+N pelos acertos no seu desenho”, deixando clara a origem dos pontos. Sem som novo: preserva simplicidade, autoplay, voz/deafen e evita adicionar preferências/biblioteca apenas por checklist.

## ROUND RESULT V2

Palavra revelada, quem acertou, ganho da rodada, placar atualizado e próximo desenhista online (ou resultado final). Pausa curta continua controlada pelo servidor. Não exige botão “continuar”.

## GAME RESULT V2

Conclusão visual com vencedor(es) conforme pontuação, classificação, totais e ações Jogar novamente/Voltar aos jogos/Voltar à mídia. Empates são reconhecidos; partida sem pontos não inventa vencedor.

Rematch permanece do coordenador participante, com mínimo de dois online. Registros de quem saiu continuam no resultado como ausentes conforme G1; não ocupam slots ativos na partida seguinte.

## LOBBY V2

Avatares, nomes, coordenação, quantidade/mínimo e Participar/Sair/Iniciar. Textos curtos. Mobile reserva menos altura ao lobby para evitar grande área vazia, sem esconder participação.

## MOBILE

Geometria automatizada nas larguras 320, 360, 375, 390, 412, 430: Hub, escolha, canvas 4:3, Undo touch, Chat, Pessoas/Fila e ausência de overflow horizontal.

Drawer prioriza canvas/ferramentas; guesser usa composer integrado. Score pessoal permanece visível; placar completo fica acessível no scroll do Game.

Viewport reduzida a 500px exercitada no guesser; VisualViewport de 320px de altura regredido no Chat normal com player fixture. Ajustados mínimo do Chat, distribuição de espaço e aviso de novas mensagens fora do fluxo para não empurrar composer. São simulações, não teclado iOS/Android real.

## DESKTOP

Canvas/estado/ferramentas/placar em composição de colunas, chat lateral existente. Layout 1262×632 validado, sem trocar resolução lógica do board. Hub suporta um card sem preencher espaço com jogos falsos.

## FULLSCREEN

Mantidos useFullscreenSurface, Fullscreen API/fallback, orientação quando possível e retorno ao mesmo jogo/board. Guesser recebe PartyComposer dentro do Stage, compartilhando rascunho/mode/protocolo com o Chat externo. Não cria segundo histórico.

Somente essa superfície é utilizável durante fullscreen nativo; Chat mobile externo continua hidden e retorna ao sair. Placar fica compacto/rolável; ordem e ação Sair do jogo ficam acessíveis ao sair de fullscreen, não competem com o canvas.

E2E envia o palpite correto pelo composer fullscreen e verifica sua posição dentro da viewport 844×390. O teste Windows entra/sai de fullscreen antes de mudar viewport; rotação física/orientation lock continua manual.

## YOUTUBE

Sem alteração no provider/API. Único iframe preservado em região compacta visível/separada de pelo menos 200px conforme G0/G1. Sem extração de áudio, segundo player, opacity hack ou offscreen playback.

Regressão usa fixture de SDK/network, identidade do elemento e contadores de engine, inclusive com Game/Chat. YouTube real, anúncios e comportamento mobile com todos os elementos precisam de QA humano.

## DRIVE

Engine, ticket, src, Range/playhead não foram modificados. Regressões de provider/entrada/reconstrução e fixture nativa preservam um vídeo e retorno à mídia. Não foi usado arquivo, token ou OAuth real.

## CALL

Não muda RTCManager/signaling/STUN/TURN/track/mute/deafen ou solicita mic ao selecionar jogo. Regressão com três RTCPeerConnections reais e áudio sintético transmite durante desenho e verifica peers/capturas e recepção. Loopback não certifica WAN/TURN.

## SCREEN SHARE

Game segue apresentação local; seleção não encerra share/session. Regressão mantém srcObject/track sintética e engine Drive ao alternar tela/mídia/Jogos. Captura real do sistema/rede remota permanece manual.

## ACCESSIBILITY

Botões nativos, labels, aria-pressed, disabled, foco visível, opções navegáveis por teclado, estado contextual e anúncios moderados. Mini diálogo não pode ser descartado incoerentemente; Escape é contextual.

Microanimações curtas em entrada, escolha, feedback e resultado; prefers-reduced-motion remove animação/transição de movimento. Não há efeitos decorativos contínuos, partículas/confete ou som automático.

Não foi feito teste com leitor de tela/hardware assistivo real. Canvas não ganhou mecanismo completo de desenhar pelo teclado.

## PERFORMANCE

Preservados refs, pintura imperativa por pontos, lotes de até 32/50ms, revisões separadas, allowlists e limites de board. game:draw não passa pelo provider social; game:state continua sem strokes.

Clock local só apresenta tempo. Mesmo com React atualizando metadados/tempo, board não é repintado por score/draft sem mudança de boardRevision/rodada; animação de score é local ao placar. Não existe base64 screenshot transport.

DrawGame permanece chunk lazy: 16,87 kB minificado / 6,14 kB gzip no build final. Não há benchmark WAN/p95 nem soak de horas.

## SECURITY

Nenhuma alteração em guardas Auth, sessão, membership, autorização de House, signaling, Drive ou migrations. Pequena extensão pública do contrato: feed.createdAt e roundPoints, sem palavra/credencial.

Texto é renderizado por React, não HTML. Backend mantém schema Zod e limites existentes. Contexto do chat não abre jogo/sala/socket nem amplia privilégios. Segredos de produção não foram usados para QA.

## TESTS

Resultados finais locais:

- `npm run typecheck`: passou nos três workspaces.
- `npm run lint`: passou; os scripts atuais executam verificação TypeScript, não uma auditoria ESLint independente.
- `npm run test`: backend 84 testes, 78 passaram e 6 skips; frontend 28/28; service worker 4/4. Zero falhas.
- Os seis skips são cinco integrações PostgreSQL e um bootstrap compilado associado à persistência; exigem banco descartável configurado. Não foram executados contra produção e não equivalem a validação das migrations de produção.
- Suite E2E completa: 7/7 passaram em aproximadamente 1min36s. Inclui G2 de três usuários, regressões de autenticação/Casa/convites, voz com três peers, Chat mobile/VisualViewport, YouTube e Drive fixtures e screen stream.
- `npm run build`: passou em shared/server/web. Vite produziu DrawGame lazy de 16,87 kB / 6,14 kB gzip; nenhuma dependência adicionada.
- `git diff --check`: passou. Avisos LF→CRLF são da configuração local do Git, não falhas de whitespace.
- QA visual: screenshots inspecionadas e passagem agent-browser isolada concluída, sem erros de página. O navegador e o helper temporários dessa passagem foram encerrados.

O último batch de typecheck/lint/test/build/diff foi executado após a suite E2E, sem build concorrente com os navegadores de teste. Nenhum teste automatizado substitui as validações humanas listadas ao final.

## MULTI-CLIENT

Teste real de três clientes autenticados por API/Socket.IO: escolha privada, desenho incremental, wrong guess sem ChatMessage, acerto sem palavra, roundPoints, duplicate rejection, conversa normal depois de acertar, ausência de board nos metadados, próximo drawer e remoção de membership.

Unidades continuam cobrindo duas voltas/rematch/score reset, prazos antes de tick, saída/grace period, stale undo/clear/append, caps, rate limits e isolamento. Adicionados asserts de roundPoints/timestamp.

## E2E

Happy path G2 com três contas/browser contexts: card → participação → escolha privada/foco → desenho por toque → igualdade de pixels → Ctrl+Z/Cmd+Z → native editing sem undo → reload/reconstrução → seis larguras → modos/drafts → clear confirmado → erro/acerto sem leak → ganho/posição → conversa pós-acerto → viewport reduzida → guess fullscreen → resultado/próximo drawer → resultado final e conversa como observador.

Regressões: Landing/Auth/House, convites, áudio RTC real sintético, Chat/gestos/People/Queue/VisualViewport, YouTube fixture, Drive engine/screen stream e vídeo nativo em três proporções.

QA encontrou Undo mobile abaixo da dobra e composer extrapolando viewport reduzida; ambos corrigidos. Testes foram ajustados para aguardar a mudança responsive antes de localizar input (o nó muda de desktop para mobile), usar tolerância subpixel e localizar badge do jogador quando há dois ganhos simultâneos. Não foram reduzidas regras de segurança para passar testes.

## VISUAL QA

Screenshots geradas e inspecionadas visualmente, não só produzidas: Hub desktop/mobile, lobby, mini escolha, drawer/guesser, resultado de rodada/final e fullscreen.

Evidências locais ignoradas pelo Git em test-results:

- g2-hub-desktop.png / g2-hub-mobile.png
- g2-lobby-desktop.png / g2-lobby-mobile.png
- g2-word-choice.png
- g2-drawer-desktop.png / g2-drawer-mobile.png
- g2-guesser-desktop.png / g2-guesser-mobile.png
- g2-round-result.png / g2-game-result.png
- g2-landscape-fullscreen.png
- g2-mobile-{320,360,375,390,412,430}.png

Passagem adicional agent-browser em fixture temporária: Hub/card, ingresso, apresentação de jogo/resultado, retorno à mídia, mobile/call menu e fullscreen. Capturas e notas em .data/g2-visual-qa, sem conta real. Não confundir essa passagem com o happy path completo de três browsers do Playwright.

Skills React/composição orientaram rascunhos/contexto compartilhados, slot de composer e ausência de duplicação do engine. Skill agent-browser orientou a passagem visual isolada; não substitui checks de runtime/protocolo.

## KNOWN LIMITATIONS

- Runtime/board/feed efêmeros, single-process; restart termina jogo.
- Feed de jogo tem 40 eventos e não vira arquivo permanente de conversa.
- Rascunhos são memória da Party, não persistência para reload completo.
- Em celulares curtos, teclado e player YouTube ocupam espaço: Game tem scroll interno; não cabem todas as ferramentas/placar simultaneamente sem rolar.
- Fullscreen compacto não duplica histórico; para ler toda a conversa, sair de fullscreen.
- Ordem/Sair do jogo são acessíveis fora de fullscreen; botões de retorno/exit continuam visíveis nele.
- Erro de ack mantém draft, mas não repete mutation automaticamente.
- Fixture em Chromium/Windows não comprova iOS/Android/macOS reais, WAN, Google real, screen capture físico, leitor de tela ou soak.
- P2022/schema de produção não é corrigido por G2.

## MANUAL_REQUIRED

1. Android Chrome e iOS Safari/PWA: seis larguras típicas, teclado real, safe areas, touch/stylus, scroll das cores/placar, clear e input nativo undo.
2. Rotação retrato/paisagem durante fullscreen; fallback sem Fullscreen API/orientation lock e retorno conservando board/drafts.
3. Mac físico: Cmd+Z no desenho e em textarea/contenteditable; leitores de tela/reduced motion.
4. Partida completa com 2–3+ pessoas reais: escolha/autoescolha, pontos/empates, rodada final, rematch, saída e reconnect antes/depois de grace period.
5. YouTube real em jogo + Chat/guess/fullscreen, sem iframe oculto ou reprodução duplicada; Drive real OAuth/Range/ticket e retorno sem restart.
6. Mic humano ativo, mute/deafen, screen share real e participantes em redes distintas com TURN existente.
7. Sessão longa e hardware mobile mais antigo, rede lenta/oscilações, limitações de board.

## FILES_CHANGED

- packages/shared/src/drawGame.ts — timestamps e roundPoints públicos.
- apps/server/src/drawGame.ts — metadados autoritativos de feed/ganho por rodada.
- apps/server/src/drawGame.test.ts / drawGame.integration.test.ts — points/feed/chat-wire/privacy.
- apps/web/src/App.tsx — contexto por Party, timeline unificada e slot fullscreen.
- apps/web/src/components/GameHub.tsx / MainStage.tsx — card/ícone/lazy/composição fullscreen.
- apps/web/src/components/PartyComposer.tsx — composer reutilizado, modos/typing/ack.
- apps/web/src/games/PartyGameChat.tsx — contexto público, elegibilidade e drafts separados.
- apps/web/src/games/DrawGame.tsx — mini escolha/status/resultados/lobby.
- apps/web/src/games/DrawScoreboard.tsx — posição/estado/feedback.
- apps/web/src/games/DrawCanvas.tsx / drawingShortcut.ts / drawingShortcut.test.ts — teclado/toolbar/clear e regras.
- apps/web/src/security.test.tsx / styles.css / e2e/party.spec.ts — regressões e layout.
- docs/AGENT.MD / CLAUDE.MD — invariantes G2, sem reescrever histórico fora de escopo.
- Este relatório.

## RESPOSTAS DE HANDOFF

1. **Chat sem autoridade do jogo:** mesma superfície; send mode escolhe chat:message ou game:action/guess. Só runtime compara/valida/pontua.
2. **Acerto sem leak:** servidor não ecoa texto correto; projeções são privadas e evento só informa acerto. Testes inspecionam wire e DOM antes da revelação.
3. **Conversa normal:** toggle Conversar, drafts separados; drawer/espectador/acertante/retorno à mídia em modo normal.
4. **Ctrl/Cmd+Z:** undo autoritativo do drawer em DRAWING; ignorado na edição, overlays, redo/repeat ou inelegibilidade.
5. **Undo mobile:** botão explícito Desfazer na primeira linha de ferramentas, sem gesto secreto/menu.
6. **Placar:** lista no desktop, itens compactos/scroll no mobile/fullscreen e score/posição pessoal no header.
7. **Fullscreen guess:** PartyComposer no próprio Stage, compartilhando contexto/drafts; sem segundo histórico.
8. **Game Feed separado:** não existe visualmente; eventos seguros aparecem na timeline do Chat. Runtime/feed/protocolo continuam separados internamente.
9. **Padrões preparados:** card visual/grid, placar e composer/contexto/slot concretos. Podem ser reaproveitados quando outro jogo real exigir, sem prometer generalidade já não testada.
10. **Abstrações evitadas:** SDK/plugin system/ECS/registry fictício, lobby/matchmaking/global ranking, Redis/broker/SFU, novo profile/chat/call, banco/migrations e segundo player.
