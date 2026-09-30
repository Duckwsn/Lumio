# PÓS-1.0 — GX2 Shared Social & Call Foundation

## STATUS

Implementação local de GX2 concluída para revisão humana. Sem commit, push, deploy, acesso à produção ou mudança de banco. O GX1 permanece congelado. O gate E2E final passou 15/15; uma oscilação anterior do teste G4 foi registrada abaixo.

## BASELINE

Checkout inicialmente limpo (`git status --short`, `git diff --stat` e `git diff --check` sem alterações). Antes de editar: typecheck, lint e build passaram; `npm test` sem banco descartável passou com **170 aprovados, 0 falhas, 6 skips PostgreSQL condicionais** (133 servidor, 33 web, 4 service worker); `npm run test:e2e` passou **14/14** em Chromium local. Li o contrato GX2, Design Bible GX1, instruções AGENT/CLAUDE, Entry Flow, arquitetura social, Call V4 e relatórios S1/S2/M1/M2/M3/M3.1; conferi o código atual como fonte de implementação. Nenhuma operação de produção foi feita.

## GX1_CONTRACT_COMPLIANCE

Casa continua `Group`; Party/social session/Room é o `primaryRoomId` da Casa; Media e Games são apresentações locais da mesma Party. Não há novo ID, rota, socket por experiência, protocolo, migration, model Prisma ou presença `currentExperience`. Player, Queue, Game, Drive e Call V4 preservam suas autoridades existentes. O GX2 apenas torna explícito o ownership de transporte e recursos RTC acima do child visual atual.

## CURRENT_ARCHITECTURE_BEFORE

`App.tsx` possuía diretamente `socket`, `snapshot`, estado da Call e todas as refs RTC. Seu efeito de transporte já dependia de token/Casa/Room, não de `stageView`, e o `PartyGameChatProvider` já estava acima do `MainStage`. O risco para GX3 era mover os effects para um futuro renderer e acoplar leave/rejoin ao child. Havia ainda uma mesclagem de snapshot que comparava revisões com o snapshot anterior sem conferir se era da mesma Room.

## IMPLEMENTED_ARCHITECTURE

`useHousePartyShell` é a fronteira lógica persistente invocada em `App` acima de `MainStage`. Compõe `usePartyTransport` (conexão única, snapshot e estado de entrada/reconexão) com `usePartyCallResources` (estado local da Call, refs de peers/streams/tracks, áudio remoto e preferências). `App` continua registrando handlers de domínio, sinalização WebRTC e ações de UI; não foi deslocado todo o monólito para um mega-context. O callback de registro é ligado antes de `connect()`, impedindo perda de snapshot rápido. `stageView`, `presentationMode`, fullscreen, drawer e seleção de jogo não integram a identidade do transporte.

| State/ref/effect | Owner antes | Owner GX2 | Motivo e lifetime | Cleanup |
|---|---|---|---|---|
| Socket Party, snapshot, entrada | `App` | `usePartyTransport` | Identidade token/Casa/Room; sobrevive à apresentação | Saída, troca de identidade, logout ou revogação |
| Registro dos handlers Party | `App` | `App`, ligado ao transporte pelo shell | Preserva o controller de domínio; não depende da view | Junto à identidade Party |
| Peers, mic, share, áudio remoto, estados Call | `App` | `usePartyCallResources` | Refs estáveis durante toda a Party | Saída real, revogação, logout; recursos físicos também na queda real |
| Negociação e signaling Call | `App` | `App`, acima de `MainStage` | Mantém protocolo V4 e usa refs do shell | Call V4 conforme peer/generation |
| Chat draft e projeção Game privada | `PartyGameChatProvider` | Inalterado | Estado de Room/jogador; não acoplar ao renderer | Saída real da Room |
| Apresentação Media/Games e drawers | `App`/`MainStage` | Inalterado | Estado local por aba, sem identidade social | Ao sair ou trocar a view correspondente |
| Home presence socket | `App` | Inalterado | Somente Home, sem join de Room | Home→Party/logout |

## PARTY_SHELL

Lifetime ativo do transporte: `socketUrl + token + houseId + primaryRoomId`. No Home o hook permanece inerte, sem transporte Party ou captura RTC. A árvore visual `app-shell` e o provider de chat não mudam de identidade por `stageView`; o E2E compara a mesma instância DOM, o mesmo WebSocket, peers, tracks e player após cinco transições. Esta é uma **fronteira lógica em hooks**, não um componente de rota novo; o split visual de GX3 continua deliberadamente fora deste trabalho.

## PARTY_LIFECYCLE

Entrada real na Party: resolve Casa/Room, cria um socket, registra handlers, conecta e emite `room:join`. Primeiro snapshot define estado conectado e habilita registro de Call em recepção. Queda de transporte conserva o shell visual, encerra recursos físicos conforme Call V4 e faz rejoin/resync. Saída real, troca de Casa, logout e revogação terminam a identidade do transporte e fazem cleanup. Troca Media↔Games modifica só estado local de apresentação. Não foi introduzida uma máquina de estados genérica nem um novo protocolo.

## SOCKET_OWNERSHIP

`usePartyTransport` cria e encerra o socket Party. O Home conserva seu socket leve separado, que não chama `room:join`; os effects são mutuamente exclusivos pelo `routeHouseId`. Os handlers do socket Party são registrados pelo controller `App` **antes** da conexão. `room:leave` sai do hook somente no cleanup da identidade real; desconexão anterior evita emissão redundante. E2E GX2 verificou um WebSocket Party por aba e nenhum `room:join`/`room:leave` nas transições visuais.

## SNAPSHOT_OWNERSHIP

`usePartyTransport` mantém o Room snapshot acima do renderer. Eventos Media/Queue/Chat/Presence continuam no controller, preservando revisão e deduplicação anteriores. A mesclagem de `room:snapshot` agora compara revisões **somente se `current.id === nextSnapshot.id`**; um snapshot de outra Room substitui integralmente o antigo. Cleanup real zera o snapshot. Game snapshot privado continua no consumidor individual `PartyGameChatProvider`/GameHub, não entra no snapshot social ou em contexto global novo.

## CALL_OWNERSHIP

`usePartyCallResources` aloca estado e refs da Call no shell lógico: `peerConnections`, `peerSessions`, `localStream`, `displayStream`, `remoteAudio`, geração RTC, mute/deafen, devices e volumes. Os effects de negociação, voice join, captura e cleanup permanecem no controller `App`, acima do `MainStage`. Nenhum componente Media/Game ganhou ownership de Call. O `CallRegistry` servidor e o protocolo P2P não foram alterados.

## RTC_LIFECYCLE

Entrada inicial registra `voice:join` após snapshot, inicialmente receive-only. Peers usam `roomId` e socketId remoto como geração; `onnegotiationneeded` continua o único caminho de oferta. Na troca visual não há cleanup, novo peer ou voice join/leave; no reconnect real a geração invalida peers/tracks e a voz volta receive-only. O E2E GX2 compara objetos `RTCPeerConnection` por referência, não apenas indicadores de UI.

## MIC_LIFECYCLE

Mic começa OFF e `getUserMedia` não é chamado na entrada, no snapshot, no render ou na troca visual. A ativação do teste ocorreu por clique real no controle; o E2E reteve a mesma `MediaStreamTrack` após cinco transições e mediu delta zero de captura. Reconnect real segue V4: para tracks e não reacquire automaticamente; o teste Call V4 preexistente exercita essa diferença.

## MUTE_DEAFEN_DEVICES

Mute, deafen, volumes, modo do mic e seleção de dispositivos continuam locais; `lumio.audio.v1` conserva preferências. Mute normal alterna `track.enabled` sem recaptura. Deafen silencia recepção e mic; sair do deafen não liga mic automaticamente. O E2E confirmou mic ativo e deafen de outro cliente preservados após alternâncias, sem troca de dispositivo implícita.

## REMOTE_AUDIO

`remoteAudio` é um mapa de elementos de áudio no recurso Party/Call, não filho de `MainStage`. Fechamento de peer, saída, revogação e reconexão real fazem cleanup pelas rotinas V4. O E2E Call V4 continua cobrindo recepção real loopback e ausência de áudio duplicado.

## SCREEN_SHARE

`displayStream` e track ficam no recurso Call; `screen:start/stop` e slot autoritativo continuam no servidor. O novo E2E usa track de canvas **somente no harness local**, iniciada após clique no controle, e prova a mesma track e zero nova chamada `getDisplayMedia` durante cinco transições. Ao sair, a track termina; não foi criada UI ou política de share para as futuras rotas GX3.

## CHAT

Chat continua por `roomId`, com mensagens no Room snapshot e drafts no `PartyGameChatProvider`. O E2E deixou um draft no cliente A, fez transições e confirmou que permaneceu; cliente B enviou uma mensagem e A recebeu exatamente uma cópia. Guesses/ações Game seguem protocolo Game, não `chat:message`.

## PRESENCE

S2 permanece: online, inParty, inCall, speaking, screenSharing e lastSeen independentes da apresentação local. O teste GX2 confirmou dois membros `inParty` após a troca; S1/S2 já cobrem multi-socket, grace, Home, logout e remoção. Não foi adicionado `currentExperience`.

## GAME_PRIVACY

Nenhuma projeção individual Draw/Quiz/Cards foi movida para os hooks sociais. `PartyGames` e os handlers privados do servidor não foram alterados. As regressões existentes cobrem palavra/choices só para drawer, Quiz sem resposta antes de reveal e mãos Cards por jogador. Nenhum segredo novo em storage, log ou Room snapshot.

## MAINSTAGE

Permanece multiplexador visual temporário, como permitido pelo GX1/GX2. Não cria socket, peer, mic, chat ou Call. O E2E alternou `stageView` Media↔Games repetidamente sem mudar recursos sociais. A separação em rotas/outlets é GX3, não GX2.

## MEDIA_PRESERVATION

`MediaStage`, UniversalPlayer, adapters YouTube/Drive, sincronização, Ambient e fullscreen não mudaram. O E2E compara também o mesmo elemento `.lumio-player` após as trocas; os testes M1 e G0/G6 cobrem provider/sync. Nenhuma nova política de iframe oculto ou visualizadores foi antecipada.

## QUEUE_M3_PRESERVATION

Sem mudança em `RoomStore`, Queue V2, `QueueItem.id`, `provider + providerMediaId`, `queueRevision`, `operationId`, CAS ou autoplay. Snapshot da mesma Room conserva a semântica monotônica; snapshot de outra Room não herda revisão/fila antiga. O E2E M3 de três clientes permanece obrigatório no gate final.

## M3_1_CI_REGRESSION

Em PostgreSQL 16 descartável, as quatro migrations versionadas foram aplicadas em banco local vazio. O teste `PostgreSQL queue, library, favorites, playlist, history and progress survive restart` passou, inclusive adição→revisão 1, seleção→revisão 2, retry idempotente, ocorrência repetida distinta e restore. Nada foi alterado no runtime ou no teste M3.1.

## HOME_LIFECYCLE

Home conserva um socket autenticado leve e nenhum `room:join`, `voice:join`, peer, player ou captura. O hook do shell existe como estrutura React do `App`, mas seu efeito de Party não ativa sem `houseId + roomId` resolvidos. Home→Party limpa o socket Home e monta o Party socket; Party→Home faz o inverso.

## PARTY_LEAVE

Saída explícita conserva o fluxo V4: `voice:leave`/share stop quando aplicáveis, `room:leave` uma vez no cleanup conectado, disconnect, peers/áudio/tracks encerrados e snapshot protegido zerado. No novo E2E, o único socket fechou, todos os peers fecharam e tracks de mic/share terminaram. A Casa, Queue e histórico servidor persistem.

## RECONNECT

Queda real não é troca visual: `disconnect` invalida captura/geração, zera mic/share físico e peers, o Socket.IO reconecta, emite `room:join`, recebe snapshot autoritativo e a Call reinicia receive-only com mic OFF. O teste Call V4 existente exercita offline/online e ausência de recaptura. Ações incertas não são replayadas pelo GX2.

## REVOCATION

`member:removed` continua zerando snapshot/Casa e navegando à Home; a troca de rota encerra transporte e RTC. O servidor continua cortando Party, Call, slot de share e grants Drive. Não houve alteração de autorização ou endpoint. A revogação simultânea a um share físico não recebeu teste específico novo no GX2; depende da regressão de servidor existente e requer QA humano adicional.

## MULTI_CLIENT

O novo cenário usa A/B reais, duas identidades autenticadas, Call P2P e share sintético. A muda sua view sem recriar recursos de B; B muda sem recriar os de A. Os E2E anteriores de G6, M1–M3 e S1 incluem três clientes, Game/Media e projeções privadas; não se afirma que o novo caso cobriu A/B/C com share real.

## MULTI_TAB

Política preexistente preservada: Presence agrega abas da mesma identidade; `CallRegistry` limita um socket vivo de Call por usuário/Party. Nenhum servidor/protocolo novo. Os testes de servidor CallRegistry/S2 cobrem segunda aba, sinal obsoleto e presença agregada; o novo caso GX2 não abriu duas abas da mesma conta.

## PERFORMANCE

Hooks usam identidade primitiva de token/Casa/Room; estado visual não recria transporte. Níveis de mic e refs RTC continuam fora de renders frequentes. Nenhum novo polling, timer, listener ou telemetria de produção. O pacote App aumentou aproximadamente 2 kB por extração de hooks; isso não é medição de performance real.

## MEMORY_AND_LISTENERS

O E2E fez cinco transições e encontrou um socket Party, mesmo conjunto de peers e mesmas tracks, delta zero de capturas e de eventos join/leave. Mensagem recebida uma vez dá smoke contra listener Chat duplicado. Não foi feito heap profile/soak prolongado nem medição de intervalos em produção.

## SECURITY

Auth/membership/role/revision continuam validados no servidor; frontend não virou autoridade. Nenhum token, ticket, SDP/ICE, mensagem, segredo Game ou URL Drive foi logado pelos hooks. Harness de identidade está apenas no teste E2E, não no bundle de produção. Snapshot inter-Room não reaproveita dados protegidos/revisões da Room anterior.

## ACCESSIBILITY

Controles existentes continuam `<button>`, `aria-label`, foco e Chat sem mudança semântica. A extração não alterou markup. QA de leitor de tela, Bluetooth ou gestos físicos permanece manual; não foi afirmada homologação de acessibilidade completa.

## MOBILE

Capturas locais foram geradas em 320, 375, 390, 412, 430 px e desktop 1440 px; **todas foram abertas/inspecionadas**. Sem overflow horizontal no teste. Chat/composer e controles continuam acessíveis. Na tela vazia em 375/390 px, o seletor de apresentação fica visualmente próximo/sobre o pequeno ícone decorativo central — detalhe cosmético preexistente, sem alteração GX2, que merece revisão separada se incomodar.

## POSTGRESQL

Contêiner local descartável `postgres:16-alpine` em `127.0.0.1:55432`, banco `lumio_test` vazio, quatro migrations existentes via `migrate deploy` **apenas nele**. `npm test` com `LUMIO_TEST_DATABASE_URL`: 138 servidor + 33 web + 4 service worker = **175 aprovados, 0 falhas, 1 skip opt-in**. O cenário compilado de boot foi executado isoladamente com `LUMIO_BOOT_QA=1` e passou (1/1). O contêiner foi parado/removido após os testes. Nenhum banco persistente ou de produção foi acessado.

## TESTS

Baseline e final: typecheck, lint e build passaram. `npm test` baseline sem PG: 170 pass/0 fail/6 skips; com PG descartável no final: 175 pass/0 fail/1 skip, e o skip opt-in passou isolado. Testes de Call, Social, Games, Media/Queue/Library/Drive simulados e M3.1 passaram. Typecheck foi repetido após o ajuste do fixture GX2; a suíte E2E final passou 15/15.

## E2E

Baseline 14/14; teste GX2 focal passou após ajuste do harness de share para `canvas.captureStream` (o primeiro harness de vídeo fake foi recusado pelo navegador e não representou falha do produto). Prova: identidade DOM, WebSocket, peer, mic e display track; zero novo room/voice join/leave, zero captura; draft, chat, Presence; saída real limpa tudo. Na primeira execução de 15 cenários, os 14 anteriores passaram e GX2 recebeu HTTP 429 na criação de contas por limite cumulativo do servidor local; o fixture passou a reutilizar duas identidades já verificadas em M2, com fallback para cadastro quando executado isoladamente. Na segunda, 14/15 passaram, inclusive GX2; G4 Quiz terminou uma rodada temporizada em `RESULT` durante reload/reconnect em vez de ainda estar em `QUESTION`. G4 passou isoladamente sem mudança de produto e a **terceira corrida integral passou 15/15**. A oscilação G4 merece acompanhamento; não foi ocultada nem corrigida artificialmente no teste antigo.

## VISUAL_QA

Capturas GX2 em `test-results/gx2/party-{320,375,390,412,430,1440}.png` foram geradas pelo E2E e **abertas**, não somente salvas. Também abri capturas G6 Cards mobile 390 e desktop 1440 para conferir palco Game/Chat sem mudança estrutural. Não foi usado provedor YouTube/Drive real nesse QA visual; os screenshots são locais e ignorados pelo Git.

## FILES_CHANGED

`apps/web/src/App.tsx`; `apps/web/src/party/useHousePartyShell.ts`; `apps/web/src/party/usePartyTransport.ts`; `apps/web/src/party/usePartyCallResources.ts`; `e2e/party.spec.ts`; este relatório. Nenhum arquivo de backend, shared contracts, player, jogo ou CSS foi modificado.

## MIGRATIONS

Zero migration/schema/model criado ou editado. As quatro migrations versionadas foram **executadas somente no PostgreSQL descartável do teste**, sem `db push`, reset, operação destrutiva ou produção.

## KNOWN_LIMITATIONS

O shell GX2 é lógico (hooks montados no `App`); os handlers de domínio e effects RTC ainda estão orquestrados em `App.tsx` para minimizar risco nesta etapa. GX3 pode mover apresentação para child/outlet sem alterar identidade dos hooks, mas não deve duplicar o controller/socket. Call P2P continua single-instance backend, sem TURN/SFU novos. Screenshots sintéticos não provam áudio/compartilhamento real em hardware ou redes externas. O detalhe cosmético de empty state mobile descrito acima não foi redesenhado. O teste G4 de rodada temporizada/reload oscilou em uma execução integral; investigar se voltar a aparecer em CI.

## MANUAL_QA_REQUIRED

Áudio humano e microfones físicos; seleção/desconexão de dispositivos e Bluetooth; screen share real e encerramento pelo navegador; WAN/NAT/TURN; Android/iOS/Safari e PWA instalada; background/foreground; leitor de tela; YouTube e Google Drive reais, inclusive OAuth/tickets/Range; remoção de membership durante share físico. Não declarar qualquer um desses itens como aprovado pelos testes locais.

## GX3_READINESS

O GX3 poderá montar/desmontar o child visual sob o mesmo `useHousePartyShell` e `app-shell`, sem reidentificar token/Casa/Room. Precisa preservar os hooks acima do outlet, manter Game projection individual e implementar **separadamente** rota Media/Games, política YouTube visível, viewer registry e pausa zero-viewer. Nenhuma decisão arquitetural nova foi necessária para GX2; esses trabalhos continuam no contrato GX3 aprovado.

## FINAL_VERDICT

GX2 está pronto para revisão e congelamento antes de GX3: contrato GX1 preservado, transporte e recursos Call mantêm identidade nas trocas visuais, cleanup real validado, 175 testes com PostgreSQL descartável e gate E2E final 15/15. A ocorrência intermitente G4 e o QA físico/manual permanecem explicitados; não houve publicação ou deploy automático.

## RESPOSTAS_OBRIGATORIAS

| Nº | Resposta |
|---|---|
| 1 | `useHousePartyShell` compõe o lifetime lógico; `App` coordena handlers de domínio. |
| 2 | `usePartyTransport`. |
| 3 | Um socket Party por aba na Party. |
| 4 | Não. |
| 5 | Não. |
| 6 | Conexão inicial ou reconexão real do transporte, após resolver Room. |
| 7 | Cleanup da identidade Party conectada; desconexão prévia basta no servidor. |
| 8 | Não; E2E mede delta zero. |
| 9 | `usePartyCallResources` possui estado/refs; `App` orquestra Call V4. |
| 10 | Ref `peerConnections` em `usePartyCallResources`. |
| 11 | Ref `localStream` no mesmo hook. |
| 12 | Ref `remoteAudio` no mesmo hook. |
| 13 | Ref `displayStream` no mesmo hook. |
| 14 | Estado/ref `muted`/`mutedRef` no mesmo hook. |
| 15 | Estado/ref `deafened`/`deafenedRef` no mesmo hook. |
| 16 | `audioSettings`/`audioDevices` locais no mesmo hook. |
| 17 | Não; referências peer idênticas no E2E. |
| 18 | Não; delta zero de captura. |
| 19 | Não; delta zero de display capture. |
| 20 | Não; delta zero de `voice:join`. |
| 21 | Não; delta zero de `voice:leave`. |
| 22 | Sim. |
| 23 | Não; entrada inicial medida com zero captura. |
| 24 | Peer/track/geração são invalidados, Party faz rejoin/snapshot e voz receive-only. |
| 25 | Não; exige novo gesto. |
| 26 | Sim; mesma track de display no harness GX2. |
| 27 | Sim; track encerrada e slot server liberado. |
| 28 | Sim pelo cleanup de rota/servidor; não houve novo E2E específico de revogação com share. |
| 29 | À Party/Room `roomId`. |
| 30 | Não; draft e uma mensagem recebida uma vez no E2E. |
| 31 | Não; segue acima do MainStage. |
| 32 | Não. |
| 33 | Não. |
| 34 | Não. |
| 35 | Não. |
| 36 | Sim. |
| 37 | Não possui socket/RTC/Call social. |
| 38 | Não. |
| 39 | Não. |
| 40 | Não. |
| 41 | Não. |
| 42 | Sim, teste PostgreSQL M3.1 passou. |
| 43 | Não. |
| 44 | Não. |
| 45 | Não. |
| 46 | Não. |
| 47 | Um Party socket por aba; Home usa outro apenas fora da Party. |
| 48 | Sim, política CallRegistry/S2 inalterada; testes de servidor passaram. |
| 49 | Sim no fluxo existente de revogação; teste físico de share ainda manual. |
| 50 | Sim, logout desconecta e limpa RTC. |
| 51 | Sim, novo E2E confirma cleanup Party→Home. |
| 52 | Sim, Call registra receive-only após snapshot. |
| 53 | Não. |
| 54 | Sim, Queue server/Room não é reiniciada pela view. |
| 55 | Sim, runtime server PartyGames não é owned pela view. |
| 56 | Não; apresentação local não emite `game:leave`. |
| 57 | Sim, fanout/projeções individuais não mudaram. |
| 58 | Sim, drawer apenas. |
| 59 | Sim, Quiz não revela correção durante QUESTION. |
| 60 | Sim, mãos/deck por viewer. |
| 61 | Não observado; mensagem única e WebSocket único no teste. |
| 62 | Não observado; peers e voice packets estáveis. |
| 63 | Não; mesmo array/objetos peer após cinco transições. |
| 64 | Não; delta zero de capturas após cinco transições. |
| 65 | Sim. |
| 66 | Sim. |
| 67 | Sim. |
| 68 | Sim. |
| 69 | 175 pass, 0 fail, 1 skip opt-in no run PostgreSQL; skip passou isolado. |
| 70 | Sim; cenário GX2 focal e suíte integral final passaram. |
| 71 | 15/15 na execução integral final; uma execução anterior teve G4 intermitente e outra encontrou limite de cadastro do fixture GX2, já ajustado. |
| 72 | Sim, PostgreSQL 16 descartável local. |
| 73 | Sim; PostgreSQL descartável, M3 E2E e suíte integral final passaram. |
| 74 | Sim; regressões G0–G6 na suíte integral final passaram. |
| 75 | Sim; S1/S2 e cenários Social/Home/Presence passaram. |
| 76 | Sim no E2E Call V4 focal após a mudança. |
| 77 | 320, 375, 390, 412, 430 e desktop 1440 px. |
| 78 | Sim, seis capturas GX2 e duas G6 abertas. |
| 79 | Hardware/áudio humano/Bluetooth/WAN/TURN/Android/iOS/PWA/Safari/provedores reais/revogação durante share. |
| 80 | GX2 READY TO FREEZE — GX3 READY, sujeito à revisão humana prevista; nenhuma nova decisão arquitetural. |

GX2 READY TO FREEZE — GX3 READY
