# PÓS-1.0 — G6 PARTY GAMES POLISH & RELEASE CANDIDATE

Data: 29/09/2026. Base: `849130ce6ccfafa3e380ac40596ff4abeb30d456`.

## STATUS

**RELEASE CANDIDATE LOCAL — pronto para homologação humana.** Implementação e validação local concluídas. Não houve commit, push, deploy, alteração de produção, migration, dependência nova, OAuth ou edição de credenciais. Não é homologação de Android/iOS, Google ou WAN.

## BASELINE

Working tree inicialmente limpo, `master` acompanhando `origin/master`. Relatórios G0–G5, AGENT, CLAUDE, Entry Flow, Social e Call V4 consultados. Baseline: typecheck/lint/build aprovados; 138 testes aprovados, seis condicionais de PostgreSQL pulados; dez E2E aprovados. Jogos continuam lazy, com runtimes separados e três entradas reais.

## AUDIT

Código real dos três componentes, Hub, MainStage, contexto do Chat, canvas, roteador, coordenação/presença e estilos conferidos. Inconsistências verificadas: disconnect apagava a superfície; Hub sem retorno compacto; coordenação/minimum apresentados de formas diferentes; Cartas sem destaque suficiente do próprio turno/seleção e com regras extensas sempre abertas; foco de cor ausente. Os controles Draw não tinham guarda contra cliques simultâneos.

## CROSS_GAME_FINDINGS

Reproduzido em testes: criador de lobby de Quiz/Cartas que não participou permanecia coordenador depois de desconectar. Draw já tratava essa situação. Correção pontual nos outros runtimes; preservada a tolerância de cinco segundos. Nove novos testes: três transferências e os seis pares ordenados de exclusão entre jogos.

## GAME_HUB

Continua exibindo exatamente Desenhe e Adivinhe, Quiz e Lumio Cartas. Ícone vetorial original, nome e capacidade; nenhuma entrada fictícia. Acrescentado retorno compacto à sessão existente, sem projetar dados privados no Hub.

## GAME_NAVIGATION

Mídia ↔ Jogos ↔ jogo selecionado continua dentro do MainStage. Breadcrumb, retorno à mídia e fullscreen reutilizados. Não há novo socket, Party, Chat, Call ou engine. Navegação não equivale a participação/encerramento.

## ACTIVE_SESSION_UX

Ao voltar ao Hub, uma faixa mostra nome, lobby/em andamento/concluída e “Retornar à partida”. Conserva apenas gameType, IDs, revisão, host e fase; não conserva mãos, palavras ou respostas para montar essa faixa.

## GAME_CONFLICT_UX

Mensagem existente identifica o jogo ocupado e oferece retorno. Backend mantém exclusão inclusive em lobby/resultado. Só coordenador pode encerrar, com confirmação e IDs/revisão exatos. Nenhum jogo novo substitui silenciosamente a sessão.

## SHARED_VISUAL_LANGUAGE

`GameFeedback.tsx` compartilha somente `GameConnectionNotice` e `GameLobbyStatus`. Foco visível, controles táteis, resultados e mensagens têm ajustes CSS locais. Sem SDK de jogos, runtime genérico ou design system paralelo. Canvas/placar Draw, perguntas/alternativas Quiz e cartas/mão continuam específicos.

## DRAW_POLISH

Guarda de ações discretas com estado busy; lotes stroke e sync ficam independentes. Botões de lobby/configuração/escolha/saída bloqueiam durante confirmação ou perda da conexão. Foco das palavras espera controles habilitados. Timer recebe amostra local atual no snapshot, sem alterar duração.

## DRAW_DESKTOP

Mantidos canvas protagonista, ferramentas e coluna contextual. Canvas 4:3, desenho incremental, pixels compartilhados, Undo/clear e atalhos continuam cobertos pelo E2E. Nenhum bitmap/base64 passa a ser protocolo.

## DRAW_MOBILE_DRAWER

Chat permanece montado e hidden; canvas dominante e ferramentas utilizáveis. Em 320px, regressão mediu canvas de 217,5px de altura; nos seis tamanhos, proporção 4:3 preservada. Não foi feito teste de dedo/aparelho físico.

## DRAW_MOBILE_GUESSER

Canvas menor e Chat maior, com composer de palpite existente. Em viewport normal, altura do canvas de aproximadamente 194,1px nos seis tamanhos. Aviso temporário agora entra no fluxo sem cobrir heading; espaço é compensado para o Chat. Em viewport compacto com foco no composer, avisos não críticos são ocultados; erros permanecem disponíveis.

## DRAW_RESULT

Mantidos meta, vencedores/empate, pontos, classificação e rematch. Estilo final alinhado com os outros resultados. Nenhuma alteração na fórmula, alvo, tema, ordem ou avanço G3.

## QUIZ_POLISH

Reconexão mantém pergunta/lock recebidos, com aviso e ações bloqueadas até novo snapshot. Status de coordenador/minimum compartilhado. Countdown não começa um segundo acima por amostra local antiga. Sem mudança de banco, pontuação, 15s de pergunta ou 6s de reveal.

## QUIZ_QUESTION

Pergunta continua principal, quatro alternativas com letra/texto e lock próprio. Apenas o servidor decide acerto e pontos. Cabeçalho mantém pergunta/total e relógio local. Sem envio de tick por segundo.

## QUIZ_REVEAL

Correção, distribuição e pontuação só no reveal. “Correta”, resposta enviada e status usam texto além de cor. Classificação existente mantida.

## QUIZ_MOBILE

Alternativas em coluna no retrato, alvos ≥44px, seis larguras sem overflow horizontal no teste. Fullscreen em paisagem recebe duas colunas e tipografia compacta; não é fullscreen retrato como experiência alvo. Teclado físico/iOS não homologado.

## QUIZ_RESULT

Vencedor ou empate compartilhado e placar original; styling comum com Draw/Cartas. Jogar novamente retorna ao lobby preservando configuração, sem inventar ranking global.

## CARDS_POLISH

Sua vez recebe marcador visual e texto; seleção informa o nome da carta antes da confirmação. Aviso de mão rolável, ausência de carta legal orienta compra, regras recolhíveis e escolha de cor com foco após ack. Sem play automático, stacking, challenge ou nova mecânica.

## CARDS_TABLE

Descarte, cor ativa com nome/símbolo, direção, compra e contagens públicas continuam visíveis. Cartas dos demais não são desenhadas nem recebidas como mãos públicas.

## CARDS_HAND

Scroll horizontal local, toque seleciona e confirmação joga. Cartas ilegais/desabilitadas permanecem legíveis; legalidade vem de legalCardIds privado do próprio jogador. Escolha não equivale a jogada. Cenário determinístico mantém verificação de 13 cartas e alcance da última carta.

## CARDS_TURN

“Sua vez” e destaque na borda; nome do outro jogador quando não é o turno próprio. Relógio com números tabulares e destaque discreto nos últimos cinco segundos. Deadline autoritativo continua 35s, inclusive com painéis abertos.

## CARDS_ACTION_FEEDBACK

Guarda pending/busy existente mantida. Confirmação por ack, seleção limpa após sucesso. Escolha de cor orienta confirmar a cor, não comprar; foco retorna ao heading após essa confirmação. Aviso de scroll aparece só para mãos com mais de quatro cartas. Timeout não repete mutação: informa que o usuário deve conferir o estado antes de tentar novamente. Ações antigas continuam rejeitadas pelo servidor.

## CARDS_LAST

Última! continua checkbox junto da jogada quando há duas cartas; payload atômico declareLast, com penalidade original. Nenhum listener/ação separada introduzida. Teste cobre declaração, penalidade e efeitos antes da vitória.

## CARDS_MOBILE

Seis larguras, scroll local de mão longa e alvos ≥44px. Paisagem reutiliza layout de mesa/mão em duas colunas. Wild, compra jogável, Última! e resultado recebem captura. Safe-area/teclado/gestos reais ainda manuais.

## CARDS_RESULT

Nome do vencedor que ficou sem cartas, ou encerramento por falta de jogadores. Sem ranking artificial; as contagens permanecem o resumo próprio do jogo. Estilo do resultado alinhado aos outros.

## LOBBY_CONSISTENCY

Título, pessoas, coordenação, mínimo de dois, Participar/Sair do jogo e Iniciar partida usam a mesma linguagem. Configuração continua específica: meta/tema, quantidade/categoria/dificuldade, ruleset fixo de Cartas. Sem sistema novo de ready.

## RESULT_CONSISTENCY

Mesma ênfase visual no resultado, texto de vencedor e botão Jogar novamente; botões primários têm aparência preenchida consistente. A superfície de resultado mobile Draw/Quiz recebe mais altura para não esconder rematch antes de scroll. Navegação comum permanece no breadcrumb. Draw/Quiz mantêm placares específicos; Cartas não recebe placar inexistente. Não substituímos tudo por um componente genérico de resultado.

## REMATCH

Continua autoritativo, coordenador participante/online, mesma sessão, volta ao lobby e reseta partida segundo cada runtime. Guards não criam rematch por conta própria nem repetem pedido após perda de ack.

## PARTICIPATION

Participar explícito no lobby/resultado permitido pelo runtime; observar não ingressa automaticamente. Sair do jogo permanece diferente de sair da Party. Navegar Media/Hub não envia leave.

## COORDINATOR

Correção provada por teste inicialmente vermelho em Quiz/Cartas: criador ausente sem participação agora também entra no grace. Após cinco segundos, transfere ao primeiro participante online disponível. Não ganha autoridade da Casa. Draw já seguia esse comportamento. Regras de início/config/end intactas.

## RECONNECT

Última projeção autorizada mantém a superfície, canvas/pergunta/mão própria. Ações bloqueadas enquanto socket desconectado ou projeção ainda não restaurada. room:snapshot solicita open do jogo selecionado; Draw não condiciona mais essa recuperação à ausência de estado local. Não recria uma partida em andamento nem reenvia mutações. Chat retém metadados públicos de papel/rodada e drafts; palpite só volta após projeção autenticada. Tolerâncias/expiração e reação a ausência prolongada seguem regras existentes, não há promessa de persistência de jogos após restart.

## LATE_JOIN

Observadores recebem projeção adequada e não recebem convite de participação no meio da partida. Draw/Quiz/Cartas continuam limitados por seus runtimes. Cenários locais cobrem observador e privacidade; oito pessoas físicas não testadas.

## ERROR_STATES

Erros de ack permanecem humanos; falha de conexão tem aviso discreto, sem tela vazia. Schema, IDs/revisão, membership, deadline e turno continuam backend-authoritative. Não há retry automático de play/draw/answer/start/rematch/end.

## LOADING_STATES

Loading inicial e Suspense continuam honestos. Queda breve não substitui jogo por loading. Jogos separados lazy; banco de Quiz, deck de Cards e palavras não carregados no bundle web.

## CHAT

Composer/Chat da Party reaproveitados; rascunhos chat/guess separados. Metadados públicos retidos na queda para não revelar Chat do drawer ou apagar draft de palpite indevidamente. Mudança de tipo continua eliminando contexto de palpite Draw. Identidade/draft, envio remoto, painéis e fullscreen já cobertos pelos cenários de jogos.

## CALL

Cenário RTC ampliado percorre os três jogos na mesma Party e compara referências reais de PeerConnection, tracks, WebSockets e player antes/depois, além de áudio recebido e estado do mic. Captura 1440×900 e retorno a 1280×720 sem overflow; lobbies e jogos também têm evidências 1280×900. Usa três Chromium e microfones sintéticos em loopback. Navegar não desmonta Call. Disconnect real continua encerrando captura e reconstruindo voz segundo Call V4; não promete identidade RTC através de queda da rede.

## MEDIA

MainStage/MediaStage/engine/fila intactos. Testes existentes de lifecycle e Drive/screen verificam preservação, pausa/retorno e provider switching. O cenário RTC compara identidade do player também. Sem comando play/pause/seek por entrar em jogo.

## YOUTUBE

Superfície oficial visível existente preservada; nada de iframe duplicado ou reprodução escondida nova. Testes locais de estrutura/adapters não equivalem a reprodução real, anúncios, autoplay, bloqueio por embed ou WAN.

## DRIVE

Não tocados OAuth, scopes, vault/tokens, grants/tickets, Range ou streaming. Fixture/native video cobre lifecycle e geometria; Google Drive real e streaming em internet ficam MANUAL_REQUIRED.

## SCREEN_SHARE

Mesma captura e mesmos peers da Call, sem stream de jogo. Cenário G0 de fixture confirma mudança de apresentação preservando engine. Compartilhamento real, dispositivos e TURN/WAN continuam manuais.

## PEOPLE_QUEUE

Abrir/recolher painéis conserva nó do jogo e rascunhos nos E2E existentes; dados continuam da Party/Casa. Nenhum grupo/fila/membership paralelo criado pelos jogos.

## FULLSCREEN

Usa hook/superfície já existente, fallback honesto e saída. Mobile alvo paisagem. Draw reutiliza composer G2, Quiz compacta alternativas, Cartas conserva mão. Não há segundo Chat ou engine. APIs de fullscreen/orientation reais precisam de homologação Android/iOS.

## MOBILE

320/360/375/390/412/430 automatizados; interação Chromium/touch emulado e viewport reduzido. Não declarar aparelho real. Aviso de chegada no fluxo evita sobreposição; viewport curto oculta aviso não crítico durante digitação, preservando espaço útil do Chat.

## LANDSCAPE

Draw/Cartas preservam layouts existentes, Quiz ganhou duas colunas apenas na superfície fullscreen em viewport baixo. Sem forçar suporte a orientation lock onde navegador não oferece.

## ACCESSIBILITY

Botões nativos, foco visível, textos de estado além de cor, status/alert, foco pós-ack em palavra/cor, rules summary expansível e reduced-motion existente. Timer não anuncia tick continuamente. Não foi feita certificação WCAG, auditoria completa com leitor de tela ou medição física de contraste. Skills React/composição orientaram mudanças pequenas e lazy; [diretrizes de interface](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) orientaram foco/feedback/touch sem impor arquitetura nova.

## PERFORMANCE

Sem dependências novas, banco importado no cliente ou socket tick por segundo. Shared feedback puramente visual; lotes canvas continuam fora de guarda serial. Timers de 250ms locais e listeners têm cleanup no unmount. Build local: Draw 18,35kB / 6,56kB gzip; Quiz 6,41 / 2,58; Cartas 8,35 / 3,26; feedback compartilhado 0,50 / 0,35. Não foi realizado heap profiling, soak de horas ou benchmark WAN.

## SECURITY

Não alterados Auth, cookies, CSRF/CORS, OAuth/scopes, criptografia, DB ou limites. Roteador segue estrito e runtime confirma identidade, participação, autorização, fase, IDs, revisão, ownership e tempo. Não criadas flags/endpoints de debug em produção.

## PRIVACY_REGRESSION

Draw: integração com três sockets autenticados inspeciona projeções/palavra/choices e metadata sem board. Quiz: três clientes autenticados verificam own lock e ausência de correctIndex/correctness/distribuição antes do reveal. Cards: integração cobre três participantes, observador tardio, mãos específicas/omissão de deck/outros segredos e conservação de 96 IDs. Projeções continuam individuais; nenhum fanout público de snapshot privado introduzido. São evidências locais, não prova matemática de ausência de todo vazamento possível.

## SESSION_ISOLATION

Seis novos testes ordered pairs Draw↔Quiz↔Cards verificam recusa de open de outro tipo sem mudar sessionId/revision. Sessão ocupa Party inclusive lobby/resultado. Encerramento explícito confirmado libera tipo, nunca navegação.

## CLEANUP

Revisados socket on/off, intervals, listener de teclado, canvas e expiração/rate maps. Navegação remonta apresentação de jogo, não Party/RTC/player. Referências RTC verificadas no E2E. Sem soak/heap snapshot: não afirmar ausência universal de leaks a longo prazo.

## TESTS

Baseline passou. Rodadas intermediárias detectaram regressões de UI (foco após busy e espaço do Chat durante aviso); corrigidas sem enfraquecer asserts. Inspeção visual também refinou copy de wild e visibilidade do rematch. Uma regra Draw antiga de maior especificidade sobrepunha a altura do resultado; corrigida e acrescentada asserção contra os limites do palco, não apenas do viewport.

| Verificação | Resultado |
| --- | --- |
| typecheck | PASS |
| lint (checagem TypeScript atual do projeto) | PASS |
| build | PASS |
| servidor | 114 PASS / 0 FAIL / 6 SKIPPED |
| web | 29 PASS / 0 FAIL |
| service worker | 4 PASS / 0 FAIL |
| total npm test | 147 PASS / 0 FAIL / 6 SKIPPED |
| suíte E2E completa | 10/10 PASS, 4,0 min |
| G3 após última correção CSS do resultado | 1/1 PASS, 1,3 min |
| git diff --check | PASS |

Os seis skipped são condicionais de PostgreSQL, não executados/configurados para G6. Não foram convertidos em PASS. A repetição específica de G3 aprovou a última correção exclusivamente CSS no resultado Draw após a suíte completa. A nova captura foi preservada e reaberta: Jogar novamente fica dentro do palco, sem rolagem para alcançá-lo. Não se conta essa repetição como um 11º cenário distinto.

## MULTI_CLIENT

Três identidades autenticadas em contextos separados; integrações reais Socket.IO, observador tardio em Cartas e três peers RTC locais. Sem contas Google reais ou participação humana na execução G6. Testes usam cadastro/verification de outbox descartável, sem .env de produção.

## E2E

Dez cenários existentes preservados e ampliados: queda breve mantendo nó/conteúdo nos três jogos, Hub ativo, RTC identity pelos três jogos e paisagem Quiz. Nenhum teste foi removido nem geometria mínima relaxada. O jogo pode remount na volta; é a Party/Chat/Call/player que permanece estrutural.

## VISUAL_QA

Inspeção exploratória pontual via agent-browser em sessão própria e Party descartável, seguida de capturas do E2E. As 31 imagens abaixo foram realmente abertas com o visualizador, não apenas geradas. Capturas preservadas em `artifacts/g6/`, ignoradas pelo Git; Playwright regenera `test-results/`. Não são screenshots de produção nem evidência de aparelho físico.

- Hub: `g6-hub-desktop.png`, `g6-hub-320.png`, `g6-hub-390.png`, `g6-hub-430.png`.
- Draw: `g6-draw-lobby.png`, `g6-draw-drawer-desktop.png`, `g6-draw-guesser-desktop.png`, `g6-draw-drawer-320.png`, `g6-draw-guesser-320.png`, `g6-draw-word-choice.png`, `g6-draw-result.png`.
- Quiz: `g6-quiz-lobby.png`, `g6-quiz-question-desktop.png`, `g6-quiz-question-320.png`, `g6-quiz-question-390.png`, `g6-quiz-locked.png`, `g6-quiz-reveal.png`, `g6-quiz-result.png`, `g6-quiz-landscape.png`.
- Cartas: `g6-cards-lobby.png`, `g6-cards-table-desktop.png`, `g6-cards-table-320.png`, `g6-cards-table-390.png`, `g6-cards-many-hand.png`, `g6-cards-wild.png`, `g6-cards-last.png`, `g6-cards-result.png`, `g6-cards-landscape.png`.
- Extras 1440×900: `g6-hub-1440x900.png`, `g6-quiz-1440x900.png`, `g6-cards-1440x900.png`.

Há outras capturas geradas para larguras intermediárias; não alegamos inspeção individual de toda imagem produzida. A geometria de seis larguras foi automatizada. Capturas alteradas durante correções foram reabertas. Não houve medição instrumental de contraste nem axe/leitor de tela completo.

## KNOWN_LIMITATIONS

MANUAL_REQUIRED: Android Chrome, iOS Safari/PWA, teclado real, rotação/safe-area/fullscreen, leitor de tela/zoom, áudio humano, internet/TURN, 2–8 pessoas físicas, YouTube/Drive/screen share reais. Seis testes de DB condicionais não executados nesta rodada; G6 não altera persistência. Jogos seguem efêmeros, servidor único, sem garantia após restart. QA não mede heap/soak/carga e não comprova todas as combinações de redes/dispositivos. Não houve certificação formal de acessibilidade.

## MANUAL_TEST_PLAN

### DESKTOP

Conferir teclado, zoom e leitor de tela nos três jogos, longos nomes e feedback de erro.

### MOBILE

Android Chrome e iOS Safari/PWA: teclado real, safe-area, rotação/fullscreen paisagem, toque/scroll com 13+ cartas, wild e Última!, mantendo Chat utilizável.

### MULTIPLAYER

2–8 amigos em aparelhos reais: observação tardia, coordenador ausente, perdas curtas/longas, background e troca Wi-Fi/dados. Conferir que ações não duplicam e regras de ausência são entendidas.

### CALL

Voz humana, mute/deafen, permissão negada, recepção/autoplay, várias redes e TURN. Navegar pelos três jogos sem encerrar mic; após queda, reativação explícita conforme Call V4.

### MEDIA

Player, playhead/sync e fila durante partidas reais; abrir People/Queue, retornar Hub/Mídia e alternar compartilhamento sem perda indevida.

### PROVIDERS

YouTube real (embed/autoplay/anúncios), Drive real (OAuth, revogação, Range/tickets) e screen share real. Nenhuma configuração Google precisa ser ampliada por G6.

## FILES_CHANGED

`apps/server/src/cardGame.ts`, `quizGame.ts`, `partyGames.polish.test.ts`; `apps/web/src/components/GameHub.tsx`; `apps/web/src/games/GameFeedback.tsx`, `DrawGame.tsx`, `QuizGame.tsx`, `CardGame.tsx`, `PartyGameChat.tsx`; `apps/web/src/styles.css`; `e2e/party.spec.ts`; `docs/AGENT.MD`; `.gitignore` (somente `/artifacts/g6/`); este relatório. Sem arquivos de infra/schema/migrations/env/package modificados. As capturas locais ficam fora de commit por padrão.

## RESPOSTAS EXPLÍCITAS — 33 ITENS

1. Diferenças: reconexão apagava UI; Hub não mostrava retorno; coordenação/minimum inconsistentes; Cartas com regras extensas e turno/seleção discretos; foco de cor ausente.
2. Corrigidos esses pontos; resultados alinhados por CSS, não por reescrita de regras.
3. Hub ganhou faixa compacta da sessão e retorno direto; mantém três entradas.
4. Nome + fase pública + Retornar à partida.
5. Mensagem identifica jogo ocupado e oferece retorno; end apenas coordenador com confirmação.
6. Mídia ↔ Jogos ↔ jogo na mesma superfície; participação é independente da apresentação.
7. GameConnectionNotice e GameLobbyStatus; estilos de foco/resultados.
8. Canvas/placar Draw, question/answers Quiz e mesa/mão Cartas permanecem específicos porque possuem interações/regras diferentes.
9. Mesma linguagem de coordenação, dois participantes, join/leave/start; configurações próprias preservadas.
10. Vencedor/summary próprio, ênfase visual e rematch; não criado ranking Cartas.
11. Sim, regras G3 preservadas; mudança no cliente/foco/feedback, não score/rotação/alvo.
12. Sim, G4 preservado; banco, tempo, scoring e privacidade intactos.
13. Sim, G5 preservado; correção de coordenação ausente, sem mudar ruleset.
14. Canvas 4:3 dominante e Chat hidden montado; teste local 320px, não aparelho físico.
15. Canvas menor/Chat maior, composer único e altura mínima verificada; compensação do aviso temporário.
16. Alternativas em coluna e scroll vertical onde necessário; alvos 44px e sem overflow horizontal nos testes.
17. Scroll local horizontal permite alcançar última carta; 13 cartas verificadas em fixture, sem empilhar/encolher ilegivelmente.
18. Viewport curto/foco no composer conserva espaço, sobretudo Draw; teclado Android/iOS real é manual.
19. Superfície/hook existente, paisagem; Quiz duas colunas, Draw/Cartas layouts próprios, fallback quando API indisponível.
20. Não, abrir Hub não encerra sessão.
21. Não, abrir Media não encerra sessão.
22. Não nos cenários locais: identidade do nó/draft conservada ao abrir People/Queue.
23. Sim nos testes locais; contexto conserva drafts/round públicos na queda breve.
24. Identidade de peers/tracks e mic preservados na navegação; queda de rede continua reconstruindo Call por design.
25. Engine/player conservados nos testes de lifecycle e fixtures; providers/playhead/sync reais devem ser homologados.
26. Integração Draw com três sockets e E2E de observadores/projeções, sem palavra nas projeções dos adivinhadores durante desenho.
27. Integração/E2E Quiz inspecionam ausência de correção/distribuição/pontos antes do reveal e ownAnswer exclusivo.
28. Integração Cards com participantes/observador compara mãos individuais e omissão de deck/segredos; conserve96 em unit/long matches.
29. Cleanup explícito revisado e navegação repetida sem recriar RTC/player; não foi feito soak/heap para provar ausência universal de leaks.
30. npm test: 147 aprovados, zero falhas, seis skipped; typecheck/lint/build/diff check PASS.
31. Dez E2E aprovados na suíte completa; repetição direcionada G3 para a última correção CSS documentada em TESTS.
32. As 31 imagens enumeradas em VISUAL_QA foram abertas; apenas gerar não conta como inspecionar.
33. Dispositivos/teclado/safe-area/zoom/leitor, 2–8 humanos, áudio/redes/TURN, providers e compartilhamento reais.
