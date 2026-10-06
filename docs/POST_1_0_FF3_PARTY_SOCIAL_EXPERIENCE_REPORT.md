# FF3 — Party Social Experience

## STATUS

Implementação local concluída para validação automatizada e QA humano. FF3 não está congelado. Não houve commit, push ou deploy.

## BASELINE

Antes da edição, o worktree não tinha alterações de código da etapa. `npm run typecheck`, `npm run lint`, `npm run build` e `npm test` passaram; quatro cenários E2E relevantes também passaram. As capturas e demais artefatos gerados posteriormente pelos testes são consequência de execução local, não mudança de produto.

## FILES_READ

Prompt FF3; `docs/AGENT.MD`, documentação `docs/frontfix/` (auditoria, constituição visual, matriz e prova FF1.1/FF1.2), relatório FF2 e documentação de arquitetura social/voz. Código de `App.tsx`, `PartyStages.tsx`, `MobilePartyChat.tsx`, `PartyComposer.tsx`, `PartyGameChat.tsx`, `CallSettings.tsx`, `MembersPanel`, estilos de Party/Draw e testes E2E relevantes.

## SOCIAL_ARCHITECTURE_BEFORE

O mesmo `App` já mantinha socket, Party snapshot, Call/WebRTC, Chat e presença através da troca Media ↔ Games. A apresentação, porém, usava um dock permanente com muitas ações equivalentes (Mic, Deafen, Share, Chat, People, Queue, Settings e Media), misturando funções sociais e de mídia. O chat mobile era estrutural e sempre ocupava parte da tela. A fila podia aparecer no dock compartilhado.

## SOCIAL_ARCHITECTURE_AFTER

`PartySocialControls` é uma camada compartilhada e compacta da Party: estado da Call, Mic, Chat e entrada Party. O menu contextual Party contém Deafen, People, Screen Share e Call/dispositivos. Fila e Adicionar mídia ficaram com a experiência Media. A seleção Media ↔ Games não remonta o shell de Party nem cria outro socket. O chat mobile fica montado, mas fechado devolve espaço ao palco; aberto, ocupa uma superfície própria. A apresentação e o estado de voz não foram movidos para os jogos nem para o player.

## CALL

A camada compacta distingue Call desligada, conectada, conectando/reconectando e indisponibilidade; o menu contextual mostra detalhes. A implementação preserva o fluxo preexistente de entrada automática na Call com Mic off por padrão e a ação explícita de tentar entrar quando estiver off. Nenhuma captura de microfone foi adicionada ao render, ao menu ou à navegação.

## MIC

Mic ligado/desligado é apresentado com ícone, texto e nome acessível, não apenas cor. Bloqueio de permissão mostra “Microfone bloqueado” e orientação para revisar permissão no navegador. O clique segue o fluxo existente de captura; entrar na Party, abrir Chat e trocar de experiência continuam sem `getUserMedia` novo.

## DEAFEN

Deafen foi deslocado do dock permanente para o menu Party. O estado continua pertencendo à Call e preservado ao trocar Media ↔ Games.

## CHAT

Há um único Party Chat nas duas experiências. Desktop abre drawer contextual sem reservar largura quando fechado; mobile abre superfície de chat própria e mantém o componente montado para preservar draft. Durante Draw, a superfície pode ser aberta explicitamente sobre a partida; quando o usuário vira desenhista ou entra em fullscreen, o Chat é ocultado e seu estado aberto é encerrado, impedindo que reapareça sozinho depois. O composer de Games/Draw continua usando os protocolos existentes: mensagem pública no chat e palpite no jogo. O teste de três clientes confere entrega exatamente uma vez antes e depois da troca de experiência.

## PEOPLE

People abre pelo menu Party e mostra a presença real recebida do servidor. O teste usa 1, 2, 4, 8 e 12 membros sintéticos reais da mesma Party, inclusive nomes longos, sem truncar nomes de modo que percam significado.

## PRESENCE

Não houve alteração de S2 nem inferência local de atividade. Indicadores de Party/Call são derivados dos dados existentes, mantendo online/offline/na Party conforme arquitetura atual.

## SCREEN_SHARE

O comando Share fica no menu social, separado de fila e player. Quando o usuário compartilha, aparece uma ação persistente e explícita para parar. A troca de experiência preserva a track e o estado, conforme o teste de voz com três clientes e capture mock.

## CALL_DEVICES

“Call e dispositivos” conserva seleção de microfone e saída, detecção normal/PTT, volumes de mídia e Call e ducking. A superfície exibe estado de Call/Mic. Não houve reimplementação de captura, seleção ou WebRTC.

## ACCOUNT_BOUNDARY

Conta, perfil, Google Login e Drive continuam no menu de identidade. O painel de dispositivos permanece contextual da Party.

## MEDIA_INTEGRATION

Fila e Adicionar mídia aparecem apenas em Media. O painel social não controla nem remonta o player. As ações de mídia não aparecem em Games.

## GAMES_INTEGRATION

A camada social é a mesma em Hub, Draw, Quiz e Cards. Abrir/fechar Chat, People e menu Party não deve trocar função do jogador nem reiniciar partida. O chat fechado em Games mobile deixa o jogo prioritário. O viewport curto de Draw foi ajustado: com teclado/foco no palpite, a grade não reserva espaço vazio para uma prancheta menor, mantendo o feed legível. O G3 E2E agora exercita Chat aberto na rodada e seu fechamento ao virar desenhista.

## MOBILE

Chat aberto ocupa a superfície mobile e mantém o composer no viewport; fechado devolve área ao palco, com alvo de 44 px nos controles principais. Foram inspecionados 320×568, 390×844 e 430×932. `dvh` e safe-area continuam sendo usados para o rodapé e painéis.

## LANDSCAPE

844×390 foi inspecionado em Media e Games. O cluster social permanece pequeno; chat e menu são temporários. O palco não recebe barra social permanente alta.

## ACCESSIBILITY

Os estados de Call, Mic, Deafen, Share, Chat/unread e Party têm texto e nomes acessíveis; ações compactas têm `title`, `aria-label` e estado `aria-expanded`/`aria-pressed` quando pertinente. O menu foca o botão Fechar, fecha com Escape e retorna foco ao trigger. Chat mobile abre focando o composer, com botão Fechar próprio. Os alvos touch principais têm aproximadamente 44 px.

## PERFORMANCE

WebRTC, transporte Socket.IO, protocolo de chat, presença e runtime dos jogos não foram alterados. Os novos estados são de apresentação do shell; ChatPanel mobile permanece montado. O teste de voz verifica identidade de track/peer e ausência de captura adicional na troca de rota. Não foram coletados perfis de CPU/FPS, portanto não se afirma ganho numérico.

## MULTIUSER

O E2E com três clientes sintéticos cobre presença, voz, chat exatamente uma vez, troca de experiência, deafen, screen share mock e permissão negada. People foi exercitado em grupos de até 12 membros.

## TESTS

Após a última alteração de CSS/React: `npm run typecheck`, `npm run lint`, `npm run build` e `npm test` passaram. No `npm test`, o servidor passou 137 testes e pulou 6 cenários PostgreSQL condicionados a ambiente; o web passou 35 testes e mais 4 do service worker. `git diff --check` não encontrou erros de whitespace (apenas avisos de normalização LF/CRLF). O E2E está documentado separadamente abaixo.

## E2E

`npm run test:e2e -- --reporter=line`: **20/20 passaram** na execução integral final (8,1 min, um worker). Cobertura inclui prova visual autenticada, People com 1/2/4/8/12 membros, três clientes em jogos/voz/chat, Media ↔ Games, mic negado, deafen, screen share mock, Drive, fila e stress visual de Draw. O cenário contextual mobile passou isolado (1/1, 1,1 min) e novamente no ciclo integral.

Na primeira execução integral houve 19/20, com timeout no cenário mobile. O trace mostrou uma corrida do próprio teste: o mock do player mudou de “Reproduzir” para “Pausar” depois de verificar o estado e antes de tocar o botão. O teste passou a tocar “Reproduzir” apenas se ainda estiver visível e a aceitar a transição para reprodução durante a tentativa. Não foi necessário alterar o comportamento do player para resolver esse timeout. A segunda execução integral passou sem falhas.

## VISUAL_PASS_1

Capturas de Media/Games em desktop e mobile estão em `artifacts/frontfix/ff3/pass1/`. Foram abertas e inspecionadas as superfícies fechadas, Chat, Party e People, incluindo 320 e 390 px.

## CRITIQUE

O player e o Hub continuam protagonistas quando social está fechado; o rodapé concentra quatro sinais e não ressuscita a antiga toolbar. Fila/Add Media ficam fora da camada social. Em mobile o chat aberto é intencionalmente imersivo; fechado não mantém um painel vazio sobre o palco. O teste revelou uma falha real de geometria do Draw em 390×500 com foco no palpite: o feed tinha 21 px por uma linha da grade superdimensionada. A regra compacta da grade foi corrigida.

## VISUAL_PASS_2

Após a crítica, recapturados e abertos Media/Games fechados, Party, Chat e Call/settings em 390 px; Games e Chat em 320×568; Games em 844×390 e desktop; Media fechado/Party/Chat/People/settings em desktop; People com 12 membros em desktop, 390 e 320 px. A segunda inspeção também incluiu Chat aberto no Hub desktop e durante Draw mobile. Nesta última, detectou-se um campo de texto ausente: o painel cobria o composer do tabuleiro enquanto ocultava o seu próprio. A superfície agora apresenta o composer compartilhado; screenshot e E2E confirmam. O menu Party fica acima do cluster sem empurrar o palco. Settings mobile possui rolagem interna e botão Concluir no viewport de 390×844. A lista People permanece rolável, inclusive com nomes longos em 320 px. O G3 isolado confirmou que o feed do Draw em 390×500 com foco no palpite mantém mais de 65 px e que o rematch cabe no palco depois de liberar a altura antes reservada ao Chat fechado.

## SCREENSHOT_MATRIX

Raiz: `artifacts/frontfix/ff3/`. As capturas `pass1/` registram a primeira composição e `pass2/` a revisão visual. Matriz principal:

| Estado | Pass 2 |
| --- | --- |
| Media desktop fechado / Party / Chat / People / settings | `media-closed-desktop.png`, `media-party-desktop.png`, `media-chat-desktop.png`, `media-people-desktop.png`, `media-settings-desktop.png` |
| Games desktop fechado / Party / Chat | `games-closed-desktop.png`, `games-party-desktop.png`, `games-chat-desktop.png` |
| Media 390 fechado / Party / Chat / settings | `media-closed-390.png`, `media-party-390.png`, `media-chat-390.png`, `media-settings-390.png` |
| Games 390 fechado / Party / Chat | `games-closed-390.png`, `games-party-390.png`, `games-chat-390.png` |
| Games 320 fechado / Chat | `games-closed-320.png`, `games-chat-320.png` |
| Games 844×390 fechado | `games-closed-844x390.png` |
| Draw mobile com Chat aberto | `draw-chat-390.png` |
| People 12 membros desktop / 390 / 320 | `people-12-desktop.png`, `people-12-390.png`, `people-12-320.png` |

Complementos em `pass1/`: Media 320 fechado/Chat/Party, Games 430 fechado, Media 844×390. Capturas de Draw, Quiz e Cards ativos são produzidas por `e2e/ff11-visual-proof.spec.ts` em `artifacts/frontfix/ff11/current/` e pelo E2E de jogos em `test-results/`; elas são provas de regressão visual, não uma segunda implementação de controles sociais.

## NO_FEATURE_LOSS

Reconciliados: entrada automática/tentativa de reconexão da Call, Mic, Deafen, Share start/stop, Chat, People, dispositivos, PTT, volumes, ducking, Conta, membros da Casa e saída da Party. A saída da Call permanece vinculada à saída da Party, como no baseline: não existia botão independente de “Sair da Call”, e o efeito de entrada automática a reabriria. Ações específicas de mídia permanecem em Media. Nenhum fluxo de backend ou autorização foi modificado.

## KNOWN_DEBT

Compartilhamento e microfone reais dependem de permissões e dispositivos do navegador e exigem validação humana em produção. Não foi feito benchmark de renderização. O redesenho aprofundado do Draw mobile e as regras futuras de palpite/chat são escopo de FF5, não de FF3.

## HUMAN_QA_PACKAGE

Revisar localmente ou em preview posterior: Media e Games com social fechado/aberto; Call off/conectada, Mic on/off/negado, Deafen, Chat/draft, People, Share start/stop e Settings em desktop, 390×844 e 320×568; verificar foco e Escape, teclado virtual e rotação. FF3 não deve ser congelado antes dessa revisão.

## FINAL_VERDICT

**FF3 IMPLEMENTED — READY FOR HUMAN QA.** Compilação, typecheck, lint, unidade e 20/20 E2E passaram; as duas passagens visuais e a matriz de capturas estão documentadas acima. O congelamento do FF3 depende da revisão humana de Call/microfone/tela em dispositivos e permissões reais. Não iniciar FF4, commitar, enviar push ou fazer deploy nesta etapa.
