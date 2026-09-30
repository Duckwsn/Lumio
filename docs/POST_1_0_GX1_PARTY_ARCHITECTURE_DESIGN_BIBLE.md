# GX1 — Party Architecture & Separation Design Bible

## STATUS

Estudo arquitetural, 30/09/2026. **Não implementado.** Este documento é o contrato proposto para revisão humana antes de GX2–GX5. Nenhum protocolo, rota, schema, runtime ou deploy foi alterado neste GX1. `Casa`, `Party`, `Room` e `Experience` abaixo são conceitos de domínio; os nomes de classes existentes não determinam sua semântica futura.

## EXECUTIVE_SUMMARY

Decisão: **uma Casa persistente possui uma única Party social (o `primaryRoomId` atual); Media e Games são experiências locais de visualização dessa mesma Party, não duas Parties.** O socket autenticado da Party, o chat social e a Call P2P pertencem ao shell persistente por `roomId`, acima das futuras rotas de experiência. Playback/fila pertencem ao domínio Media do `RoomStore`, jogo ativo ao `PartyGames`, biblioteca à Casa. Navegar entre experiências não altera membership, call, game ou fila. Apenas a superfície visual específica é montada/desmontada. O player YouTube jamais continua tocando oculto: ao sair da rota Media, o cliente para/destrói sua instância local antes de desmontá-la; quem permanece em Media continua vendo/tocando. Se não restar nenhum visualizador Media, o servidor pausa o playback autoritativo com revisão e janela curta de reconexão; a fila e a posição sobrevivem. GX3 deve implementar essa coordenação, não um `pause` arbitrário do cliente. O Drive segue o mesmo estado compartilhado de playback, embora não compartilhe a restrição visual do iframe YouTube.

## BASELINE

Checkout inicialmente limpo (`git status --short` e `git diff --stat` vazios). Histórico M3: 170 pass/6 skips condicionais/14 E2E; não foi usado como prova deste GX1. Verificações deste checkout: `npm run typecheck`, `npm run lint` e `npm run build` passaram. `npm test`: primeira execução teve falha de inicialização de `houseDeletion.integration.test.ts` sob paralelismo; o mesmo arquivo passou isolado, e a segunda suíte completa passou: **170 pass, 0 fail, 6 skips condicionais PostgreSQL** (133 server + 33 web + 4 service worker). `npm run test:e2e`: **14/14 passou** (Chromium local, 5,7 min). `git diff --check` e checagem de whitespace do novo arquivo: ao final. Nenhuma inspeção de produção nem teste Google/Drive/TURN real foi feito.

Fontes auditadas: `docs/AGENT.MD`, `docs/CLAUDE.MD`, `docs/ENTRY_FLOW.md`, `docs/SOCIAL_ARCHITECTURE.md`, `docs/CALL_V4.md`, `docs/MEDIA_HUB.md`, `docs/GOOGLE_DRIVE.md`, relatórios G6/S1/S2/M1/M2/M3 e, como fonte de verdade, `apps/web/src/App.tsx`, `components/MainStage.tsx`, `components/MediaStage.tsx`, `components/GameHub.tsx`, `games/PartyGameChat.tsx`, `apps/server/src/index.ts`, `store.ts`, `socialStore.ts`, `partyGames.ts`, `callRegistry.ts`, `authorization.ts`, `googleDrive.ts`, `prisma/schema.prisma` e `packages/shared/src/index.ts`.

## CURRENT_ARCHITECTURE

| Conceito | Significado atual | Owner | Lifetime | ID | Persistência | Clientes/dependências | Significado proposto |
|---|---|---|---|---|---|---|---|
| Casa | Comunidade, membros, papéis, convites, atividade e Social Library | `SocialStore`/Prisma `Group` | Durável | `houseId` = `groupId` | PostgreSQL em produção; adapter local no desenvolvimento | Home, Party, Hub; auth | Mantém-se comunidade durável |
| Party | Experiência social realtime da Casa primária | `RoomStore` + socket server | Reentrada contínua; presença efêmera | `primaryRoomId` | `Room`/mídia/fila/chat persistem; presença/RTC/game não | Membros, call, media, game, chat | Uma sessão social compartilhada, não tipo visual |
| Room | Registro de Party/mídia e sala Socket.IO | `RoomStore`, Prisma `Room` | Registro durável; ocupação temporária | `roomId` | Registro/snapshots media em produção | Todo evento Party | Implementação da Party; manter ID durante GX |
| Session | Nome genérico e ambíguo; não há entidade `SocialSession` própria | Vários | Variável | `roomId`, token auth ou `sessionId` de game | Mista | Auth/Party/Game | Usar `Social Session` como conceito da Party, sem nova tabela agora |
| Media Session | Playback/fila sincronizados por Room | `RoomStore` | Persiste entre visitas/restart em modo postgres | `roomId`, `media.revision`, `queueRevision`, `QueueItem.id` | Sim para mídia/fila; engine browser não | UniversalPlayer, Hub, Drive/YouTube | Estado Media dentro da Party |
| Game Session | Único Draw/Quiz/Cards ativo por Room | `PartyGames` e runtime específico | Efêmera até end/expiração/restart | `roomId` + `gameType` + `sessionId`/`roundId` | Não | Jogadores voluntários, espectadores | Game domain da mesma Party; renderer independente |
| Call Session | Registro de um socket de voz por usuário/Room, mesh P2P | `CallRegistry` server + refs em `App` | Enquanto na Party/conectado; renegocia em queda real | `roomId` e socket ID como geração do peer | Não | Voice signaling, Screen Share | Call da Social Session (`roomId`) acima das rotas |
| Socket Room | Grupo de fanout Socket.IO após `room:join` | Socket.IO server | Conexão/join | Exatamente `roomId` | Não | Eventos Party/Media/Game/Call | Mesmo fanout; domínio explícito por evento |

`houseId` **não** é `roomId`. A Casa guarda `primaryRoomId`; `roomId` hoje identifica simultaneamente Party, Room persistido, grupo Socket.IO, fila, chat e escopo Call/Game. `game.sessionId` não é Party ID; auth session/token também não. `SocialStore.createHouse()` cria um `party-${UUID}` (`socialStore.ts:60–64`); `RoomStore.addHouseRoom()` cria o registro correspondente (`store.ts:97–101`). `PrismaSocialRepository.load()` restaura Casas; boot então restaura Rooms e Media (`index.ts:1285–1303`). Há uma Party primária por Casa, não uma Party efêmera criada ao clicar em “Entrar”.

## CURRENT_REACT_TREE

```text
main.tsx → Landing pública local OU lazy App
App (auth, URL manual, Home socket OU Party socket, snapshots,
     RTC peers/streams, media callbacks, chat/presence, drawers)
├─ Landing/Auth/Invite/Account/Home (ramificações; Home abre socket leve)
└─ /house/:houseId (mesmo App)
   └─ PartyGameChatProvider [key=roomId; metadados Draw e drafts]
      └─ app-shell
         ├─ header, pessoas, navegação, Call controls
         ├─ MainStage [view = media | screen | game]
         │  ├─ MediaStage → UniversalPlayer/provider (montado)
         │  ├─ tela compartilhada (condicional)
         │  └─ GameHub (condicional) → lazy Draw/Quiz/Cards
         ├─ Chat/PartyComposer + MobilePartyChat, Queue panel
         └─ lazy MediaHub/CallSettings + dialogs
```

`MainStage.tsx` mantém `MediaStage` como filho mesmo em Games; usa uma camada visível especial para YouTube em game (`youtubeVisible`) e `inert`/ocultação nas demais apresentações. `GameHub` monta apenas com `view === "game"` e seus estados de seleção são locais. Esse artifício cumpre a visualização atual, mas impede rota de Games com espaço próprio. `App.tsx:817–876` confirma o shell; `App.tsx:132,171–176` mostram `stageView` local e History API manual.

## CURRENT_RUNTIME_LIFECYCLE

```text
Casa criada → SocialStore.primaryRoomId → RoomStore.addHouseRoom → Prisma save
Home → bootstrap/houses + socket autenticado leve, SEM room:join
Entrar /house/:houseId → valida resumo Casa → socket Party → room:join(roomId)
Servidor valida userId do token + membership → registerConnection →
  store.addMember → Socket.IO join(roomId) → game:snapshot privado →
  room:snapshot público por Room + house:update
Cliente recebe snapshot → Call join receive-only automática (mic OFF) →
  RTC config, voice:join, peers; player converge de media/queue revision
Media ⇄ Game/Screen atual → somente stageView local; Party/Call/socket intactos
Disconnect transport → tracks mic/share encerradas, peers resetados →
  reconexão socket → room:join → snapshot autoritativo → voice:join mic OFF;
  servidor mantém presença Party 5 s antes de retirar membro
Saída /app/logout/revogação → room:leave/desconexão → call/share/peers
  cleanup, game presence/leave conforme semântica, membros/presença revistos;
  Casa, fila, chat, library sobrevivem, game é efêmero
```

Referências: `App.tsx:226–345,493–655,775–876`; `index.ts:907–970,1200–1282`; `store.ts:152–189`.

## CURRENT_SOCKET_MODEL

Por aba, **um socket Home ou um socket Party**, criados em efeitos mutuamente exclusivos de `App.tsx:226–240` e `:253–345`. Na transição podem existir instantes de teardown/setup; não são dois sockets intencionais simultâneos. O socket Party é compartilhado por chat, media, fila, game, presença e signaling Call. O servidor autentica handshake e revalida sessão/membership por evento (`index.ts:907–923`). Socket.IO room é `roomId`, não Casa ID. Outro tab pode abrir Party, mas `CallRegistry` bloqueia segundo socket vivo para a mesma conta/Room (`callRegistry.ts`). Não criar `MediaSocket` ou `GamesSocket`.

## CURRENT_CALL_MODEL

`App.tsx` possui `localStream`, `displayStream`, `peerConnections`, `peerSessions`, `remoteAudio`, mute/deafen/devices, geração e cleanup. Servidor `CallRegistry` guarda `Map<roomId, Map<userId,socketId>>`; só peers da mesma Party podem trocar sinais, com socketId como geração. `voice:join` ocorre após snapshot; recepção inicialmente `recvonly`, mic OFF sem `getUserMedia` (`App.tsx:600–690`, `index.ts:1200–1245`). Mic requer gesto; mute desliga track sem recaptura; troca de dispositivo pode recapturar por ação/configuração explícita. Reconexão real derruba mic e share e restabelece voz com mic OFF — **não prometer continuidade física de RTC em falha de rede**, apenas continuidade na troca de experiência. Deafen, volumes e dispositivos são locais; parte salva em `lumio.audio.v1`. Screen share usa track no mesmo peer P2P, não streaming via Socket.IO.

## CURRENT_MEDIA_MODEL

`RoomStore` é autoridade: `currentMedia`/`revision`, `currentItem`, queue por ocorrência/`queueRevision`, autoplay/configuração, histórico operacional. `PrismaMediaRepository` persiste por Casa/Room. `MediaStage` e adapters YouTube/Drive apresentam e aplicam sync, não são autoridade. `MediaHub` consulta endpoints `:roomId`, mas library/favorites/playlists pertencem semanticamente ao `groupId` da Casa; o backend deriva Casa do Room. `QueueItem.id` é ocorrência, `provider + providerMediaId` identidade canônica, `mediaId` do playback é provider ID (`store.ts:175–187`, `docs/POST_1_0_M3_QUEUE_V2_REPORT.md`). Modo Ambiente/fullscreen/volume são locais. Sem mover estado Media para React route.

## CURRENT_GAME_MODEL

`PartyGames` contém mapa `roomId → gameType`, delega a `DrawGameRuntime`, `QuizGameRuntime`, `CardGameRuntime` e reserva **um** jogo inclusive lobby/resultado (`partyGames.ts:7–64`). Estado, temporizadores, regras e participantes são efêmeros e autoritativos no servidor; `game:snapshot`/`game:state` são projeções por identidade, não snapshots públicos. `game:action` exige joinedRoomId e membership (`index.ts:973–978`). Navegar ao Hub ou Media não envia leave/end; participação é voluntária. `GameHub` seleciona UI local e import lazy, mas não é dono da sessão. Draw guesses, Quiz answers e Card actions são comandos separados do chat. Segredos Draw, respostas corretas/provisórias Quiz e mãos/deck Cards ficam somente no runtime/projeção autorizada. Um futuro renderer 3D de Cartas não decide regras nem recebe mãos alheias.

## CURRENT_CHAT_MODEL

Chat social `RoomStore.messages` / Prisma `ChatMessage(roomId)`, emitido em `chat:message` após `room:join`, exposto na Party e não na Casa Home. `PartyGameChatProvider` conserva drafts chat/guess e **somente metadados públicos** de Draw (`PartyGameChat.tsx`); o palpite vai a `game:action`, jamais a `chat:message`. Feed visual de jogos não equivale a persistência de chat. Quiz answer e Cards action nunca passam pelo composer social. O chat pode continuar visível nas duas futuras rotas; o composer game-specific é affordance, não novo chat.

## CURRENT_SCREEN_SHARE_MODEL

Owner é a Party/Call (`roomId`), com único slot no `RoomStore`, dono socket em memória no servidor e track P2P existente (`index.ts:1244–1267`, `store.ts:169–170`). `MainStage` escolhe apresentação local; share não é uma segunda Media Session. Captura só por gesto `getDisplayMedia`; ao perder socket, sair ou revogação, track e slot são liberados. Em Games hoje a UI pode preferir o jogo enquanto share segue ativo. Futuro: share pode coexistir com Games, porém **não** ficar tocando/capturando sem indicador e controle acessíveis no shell; ver SCREEN_SHARE_OWNERSHIP.

## CURRENT_PRESENCE_MODEL

`SocialStore` mantém `ONLINE/IDLE/OFFLINE`, `inParty`, `inCall`, `speaking`, `screenSharing`; `lastSeenAt` muda na transição offline. Home recebe `home:update` leve; `partyCount` agrega usuários únicos, não sockets. `roomConnections`/grace de 5 s sustentam reconnect. Não há campo público de experience; `stageView` é local. House Activity anuncia game ativo ou playback real por projeção mínima, sem expor segredo ou dados Drive (`index.ts:850–867`, relatórios S1/S2).

## CURRENT_DATA_MODEL

Prisma `Group`, `GroupMember`, `HouseInvite`, `HouseActivity` e `Room` representam Casa e Party; `Room` referencia `groupId`. `QueueItem`, `ChatMessage`, `MediaHistory` referenciam `roomId`; `GroupLibraryItem`, `Playlist`, `HouseFavorite` referenciam `groupId`; `MediaItem` é canônico. `AuthSession`, `ExternalIdentity` e `GoogleDriveConnection` são outros domínios. **Não há** tabela SocialSession, GameSession, CallSession, Experience nem presença por rota. Room possui `mode` legado (`watch`) que não equivale a uma escolha imutável Media/Games. A configuração `autoplayNext` está no `Room` persistido; `HouseSummary.primaryRoomId` faz a ponte. Postgres atual é single-process com estados voláteis de presença/RTC/games/grants. Ver `apps/server/prisma/schema.prisma:86–312` e repositórios Prisma.

## PROBLEMS

1. `App.tsx` concentra roteamento manual, snapshot, socket, RTC e controles visuais; risco de cleanup de Party ao trocar rota quando GX3 nascer.
2. Game ocupa uma layer de `MainStage` originalmente Media-first; fullscreen/layout não obtêm fronteira visual própria.
3. Persistência do provider YouTube foi resolvida por visibilidade especial no MainStage; uma rota Games desmontada precisa de política explícita de playback, não de iframe oculto.
4. `stageView` não é URL; refresh/back/deep link não representam a experiência.
5. Nomes “Room/Party/Session” e `roomId` se sobrepõem; duplicar models/IDs seria regressão, não separação.
6. Estado game privado não pode migrar para um contexto social global só para manter layout.

### DEPENDENCY_MAP

```text
AuthSession/User → GroupMember/role → SocialStore.primaryRoomId
  → RoomStore snapshot + Socket.IO room:join
       ├─ ChatMessage/Presence/CallRegistry/Screen slot
       ├─ Media state + QueueItem + PrismaMediaRepository
       │   ├─ YouTube adapter oficial
       │   ├─ Drive grant/ticket/Range + OAuth separado
       │   └─ House Library/MediaHub (groupId derivado de roomId)
       └─ PartyGames → Draw | Quiz | Cards → projeção por viewer
App.tsx/Party shell consome snapshot/socket, Call e projeções;
MediaStage e GameHub são consumidores visuais, não owners de domínio.
```

A dependência crítica para GX2 é que `App.tsx` não recrie socket/peers quando apenas o child visual muda. Para GX3 é que provider e player possam terminar sem alterar RoomStore, e GameHub possa remountar sem enviar `game:leave`. Para GX4 é que nenhum renderer de jogo tenha privilégio sobre `ChatMessage`, Call ou regras server-side.

### FAILURE_ANALYSIS

| Falha | Comportamento atual observado | Contrato futuro de recuperação |
|---|---|---|
| URL inválida/sem Casa | App consulta houses e exibe indisponível; server nega join | Child route nunca monta dados protegidos sem membership; alias não cria Room |
| Socket cai | Client fecha mic/share/peers; 5 s de grace; snapshot reautoriza | Manter shell e view, impedir actions incertas, rejoin/resync individual, mic OFF |
| Troca rápida de rota/Back | Hoje apenas `stageView`, sem URL | Epoch/abort de provider/viewer; última URL vence; socket/RTC estáveis |
| Último viewer Media sai | Hoje não existe tracking de view | Grace + CAS server pause, nunca comando de pause duplicado ou fila apagada |
| YouTube/Drive recusam playback | Provider mostra erro/gesto; estado Party continua | Erro fica na experiência; não derruba Call/Chat/Queue; retry obtém snapshot/ticket novo |
| Jogo termina ou servidor reinicia | Runtime efêmero; game snapshot pode ser null | Game route mostra Hub/estado vazio, nunca inventa resultado/secret; Media continua |
| Membro removido/logout | Server revoga Party/Call/share/Drive | Shell desmonta e aborta fetch/streams; rota profunda não reabre acesso |
| Persistência falha | Boot fail-fast; operações tratam indisponibilidade | GX não mascara erro com estado local nem executa migration automática |

## ARCHITECTURAL_GOALS

Uma comunidade, um roomId, um socket Party e uma Call por usuário/Party; Media e Games visuais independentes; transições locais e explícitas; retenção de chat/call/fila/game; dados privados projetados no servidor; provider compliance; links e refresh determinísticos; shell pequeno com engines específicos montados sob demanda; compatibilidade mobile/PWA. Não redesenhar regras dos jogos, fila, OAuth, papéis ou persistência neste ciclo.

## ALTERNATIVES

| Modelo | Compatibilidade/migração | Call, Chat, Presence | Media/Queue e Games | Segurança/mobile/futuro | Risco |
|---|---|---|---|---|---|
| A — Party = sessão social; Media/Games = experiences locais | Alta; preserva `primaryRoomId`, Prisma Room e protocolos enquanto cria shell/rotas incrementalmente | Um RTC e chat por Room; Presence `inParty` permanece; sem renegociação na navegação | Media continua autoritativa no Room, jogo único no mesmo Room; exige política de visualizadores/iframe | Isolamento visual melhora mobile; projeções privadas inalteradas; concorrência multi-Party deliberadamente não suportada | Médio: lifecycle/observadores Media |
| B — Media Party e Games Party separadas na Casa | Baixa; novos IDs, convites, migração de referências e room join | Ou duplica Call/Chat/presença ou precisa de terceiro canal; troca potencialmente derruba RTC | Fila e game naturalmente separados, mas compartilhar chat/call fica oneroso | Rotas simples, autenticação/Drive e privacidade duplicadas; ambiguidade no mobile | Alto: duas experiências viram dois Lumios |
| C — Social Session pai e Media/Game Sessions filhas | Média-baixa; novo domínio/IDs e possivelmente tabelas/protocolo | Pai pode possuir Call/Chat; child subscriptions aumentam sockets/eventos ou roteamento | Escala para várias sub-sessões simultâneas | Boa flexibilidade futura, mas custo de autorização/reconnect/URLs sem demanda comprovada | Alto: sobre-engenharia e migração |

**Selecionado A.** C seria justificável se multi-Party simultâneo fosse requisito real; hoje `primaryRoomId`, RoomStore, CallRegistry, PartyGames e contratos dão evidência forte a A. B não preserva a Call naturalmente. A separação é visual e de montagem/ownership, não duplicação de entidade social. Não equivale a “apenas adicionar rotas”: GX2 primeiro protege o lifecycle comum.

## SELECTED_ARCHITECTURE

```text
Group / Casa [houseId, persistente]
└─ Party = Social Session = Room primário [roomId, persistente]
   ├─ Social shell: auth/membership, socket, presença, Call, chat, share
   ├─ Media domain: currentMedia, revisions, Queue, autoplay, Hub
   └─ Game domain: 0..1 sessão efêmera por roomId, privados por viewer
      UI por cliente: /media OU /games (route local, não estado global)
```

O servidor não deve inferir que “toda Party está em Games” a partir da rota de uma aba. Game ativo e Media carregada podem coexistir; cada cliente visualiza uma experiência. Pode haver A/B no jogo e C em Media, todos na mesma call/chat. A única coordenação coletiva introduzida é a suspensão da reprodução quando **nenhum** cliente autorizado realmente visualiza Media (e não por alguém individual navegar). O share tem presença social independente da rota.

## HOUSE_MODEL

Casa permanece `Group`: membership/roles/invites/settings sociais/Social Library/atividade administrativa. `primaryRoomId` é a Party única e estável; criar Casa continua criando essa Room, mas entrar/sair não a recria. Ações Casa e revogação são validas em ambas as experiências. Home continua observadora leve e não participa da Party/Call. Nenhuma “Casa Games”. Uma Casa tem no máximo uma Party na primeira versão GX, mesmo se o Prisma admitir `Group.rooms[]`; múltiplas Parties ficam fora do produto e das APIs.

## SOCIAL_SESSION_MODEL

“Social Session” é a semântica da Party, **não** novo registro Prisma nem novo UUID. Identidade `roomId`; lifetime persistente da Room e lifetime efêmera de participação por socket. Responsável por pessoas, chat, Call, share, autorização e fanout, mas não por `selectedGame` ou modo Ambiente locais. Um participante pode ser socialmente presente e não estar jogando nem vendo mídia. No máximo um socket Party ativo por aba; Home socket se encerra ao entrar. Reconnect reusa o mesmo Room e refaz projeção autenticada.

## PARTY_MODEL

`Party` pública e `Room` interna continuam 1:1 na Casa. Convite continua para Casa/membership, não para uma experiência separada. Entrar em `/house/:houseId/media` ou `/games` une **uma** Party via `primaryRoomId`, sem criar outra. Deixar Party é navegar Home/sair da Casa/desconectar/ser revogado, não alternar experiência. Cleanup de call e jogos segue a distinção entre leave explícito, queda temporária e mudança visual.

## EXPERIENCE_MODEL

Experience = superfície visual local (`MEDIA | GAMES`), derivada da URL, não atributo da Casa ou Room. A escolha inicial é somente navegação. `screen share` é superfície local adicional/overlay controlado por shell, não terceira Party. Selecionar Game Hub/jogo e presentation mode são estados locais de UI; a **sessão** de jogo e o playback são compartilhados no servidor. O server pode manter contagem efêmera de espectadores Media para cumprir política de pausa; isso é occupancy técnico, não Presence social publicada.

## MEDIA_EXPERIENCE

Rota Media monta `MediaStage`/UniversalPlayer e MediaHub sob demanda. `currentMedia`, `queue`, `queueRevision`, `autoplayNext` e `media.revision` continuam em RoomStore/Postgres; Library é Casa. Ao montar, pedir/aplicar snapshot e realizar resync do provider sem gerar novo comando compartilhado. Ao desmontar, parar/destroy provider e cancelar tickets/requests/listeners; não limpar fila nem histórico. Presentation Video/Ambiente/fullscreen, volume e Hub são locais; podem voltar a defaults ou preferência local, sem tocar estado autoritativo. A rota Games não mantém `MediaStage` nem iframe YouTube montados.

## GAMES_EXPERIENCE

Rota Games monta Game Hub e renderer lazy de Draw/Quiz/Cards. `PartyGames(roomId)` mantém exclusão de um jogo ativo, regras, participantes, revisões e timers; navegação local não envia game leave/end. O frontend reabre projeção autorizada ao entrar/refrescar/reconectar; pode desmontar canvas/WebGL sem perder runtime. Voltar ao Hub é UI; deixar jogo é comando explícito; fechar a Party é lifecycle social. Componentes visuais recebem somente projeções por usuário e enviam intenções. Futuro Cards 3D/2.5D é opcional e lazy, sem lógica autoritativa ou segundo socket.

## CALL_OWNERSHIP

Call pertence à **Party/Social Session `roomId`**, não à Casa inteira nem à rota. Um usuário pode estar em uma Casa e fora da Party; Home não ouve voz. `CallRegistry(roomId,userId,socketId)` e RTC mesh ficam acima de Media/Games, com escopo por Room e epoch por socket. Na troca de rota não deve haver `room:leave`, `voice:leave`, `voice:join`, novo `getUserMedia`, novos peers/tracks ou reset de mute/deafen/device. `App.tsx` hoje já é o owner físico; GX2 deve extrair/organizar somente a fronteira do shell sem mudar protocolo e provar identidade das refs. Ao sair da Party, logout e revogação, encerrar; em queda real seguir V4: destruir captura e restaurar recepção com mic OFF.

Máquina conceitual: `NOT_JOINED → JOINING_RECEIVE_ONLY → JOINED_MIC_OFF ↔ JOINED_MIC_ON`; `DEAFENED` é flag ortogonal que silencia recepção e envio; `RECONNECTING` invalida tracks/capturas, fecha peers e retorna via snapshot a `JOINED_MIC_OFF`; `LEAVING → NOT_JOINED`. `ERROR` preserva Party/chat, permite retry legítimo. `getUserMedia` somente após gesto de ativar mic ou troca de input já autorizada enquanto mic ligado; nunca em entrada inicial, rota ou refresh automáticos.

## CHAT_OWNERSHIP

Chat social pertence à Party `roomId`, sobrevive troca de experiência e usa o mesmo histórico/composer no shell; não criar MediaChat/GameChat. Drafts podem ser locais por cliente; a persistência de mensagens é a existente. Game guesses/actions são protocolo `game:action` e estado de jogo privado, mesmo quando apresentados visualmente no feed. Eventos de sistema e feed público do jogo são projeções efêmeras separadas, não mensagens persistidas por acidente. Chat social pode acompanhar Games/Media em portrait/landscape/fullscreen conforme layout.

## MEDIA_OWNERSHIP

`RoomStore`/`PrismaMediaRepository` possuem playback/fila; `MediaStage`/adapters possuem somente reprodução local e capacidades do provider; `MediaHub` é UI. Casa possui library/favorites/collections e suas regras de privacidade. `queueRevision` não substitui `media.revision`; game revision é outro namespace. Transição visual não incrementa revisão por si; pausa autoritativa por zero visualizadores é comando de domínio, revisado e idempotente.

## GAME_OWNERSHIP

`PartyGames`/runtimes específicos são donos do jogo único por `roomId`; `GameHub` é seleção visual. A Call e a simples presença não inscrevem alguém como jogador. Participação/leave/rematch/end requerem comandos explícitos e validação server-side de role/coordenador/revision. Observadores recebem somente projeção própria. Segredos nunca passam por `PartyShell`, contextos globais, Home, Presence ou `localStorage`.

## SCREEN_SHARE_OWNERSHIP

Share pertence à Party/Call `roomId`, não à experiência Media nem ao MainStage. Track e slot sobrevivem à troca Media↔Games na mesma Party, **podem coexistir com Games**. O shell mantém indicador persistente, stop control e estado de autorização; cada rota escolhe uma apresentação visível ou minimizada, sem capturar segunda track e sem vídeo compartilhado oculto como única fonte de conteúdo. Fullscreen do jogo não deve desligar share; oferecer status/retorno acessível. Sair/revogar/desconectar real libera imediatamente, conforme V4. Não adicionar share de áudio da tela.

## ROUTING_MODEL

Rotas futuras canônicas: `/house/:houseId/media` e `/house/:houseId/games`; `/house/:houseId` é alias/redirect interno para `/media` preservando links anteriores, sem novo join. `houseId` da URL resolve `primaryRoomId` via bootstrap/GET autorizado; nunca aceitar `roomId` arbitrário de URL. `/`, `/login`, `/register`, `/app`, `/invite/:token`, `/account` mantêm semântica atual. GX3 pode continuar History API manual se garantir nested matching/Back/deep links; adicionar router formal só se reduzir risco de lifecycle, não é objetivo por si. Navegação Media↔Games usa pushState, `popstate` troca **somente** child route. Back para `/app` sai da Party exatamente uma vez. `replaceState` para alias evita loop. Refresh em rota direta reconstrói shell de servidor e restaura experiência da URL; não tenta ressuscitar estado local de GameHub. Acesso inexistente/sem membership retorna indisponível/403 sem expor snapshot; autenticação pendente redireciona com `next` seguro. Jogo já em andamento abre espectador/retorno autorizado; mídia em andamento sincroniza pela revisão atual; nenhuma rota cria sessão duplicada.

## INITIAL_EXPERIENCE

Na criação/entrada, escolha simples “Assistir/Ouvir” ou “Jogar” define **apenas a rota inicial daquela aba**. Não é `Room.mode`, não é persistida, não vincula convites, não muda a visão dos outros e pode ser alterada livremente. Criar Casa ainda cria uma Room; não criar uma Party por opção. Legacy `/house/:id` e convite entram em Media por padrão; UX pode oferecer seletor antes de entrar, sem wizard ou schema. Usuário com link direto Games respeita Games.

## EXPERIENCE_TRANSITION

Qualquer membro autenticado da Party pode alternar a **própria visualização** via controle explícito Media/Jogos; não exige papel de host, pois não muta sessão coletiva. Apenas ações dentro de Media/Game mantêm permissões existentes. Media→Games desmonta provider local de modo seguro, conserva socket/call/chat/snapshot/fila/game; Games→Media desmonta renderer, não abandona jogo, monta provider e sincroniza. A transição não é `room:leave`, `game:leave`, `voice:leave`, nova membership ou novo convite. Seleção local de jogo pode reiniciar visualmente ao voltar; servidor determina sessão ativa e projeção. Presence `inParty` permanece verdadeira em ambas.

## MEDIA_TO_GAMES_POLICY

Escolha: **navegação local + provider local encerrado + pausa coletiva somente ao zerar visualizadores Media**. Opção A “pausar sempre quando alguém abre Games” quebraria C que permanece assistindo. Opção B “mini YouTube visível na rota Games” invade o espaço de jogo e fullscreen mobile. Opção C pura “cada um local, servidor continua mesmo sem visualizador” mantém relógio/auto-next potencialmente incoerentes. Portanto GX3 precisa de registro efêmero de visualizadores Media autenticados por socket/Room, com atualização em entrada/saída/refresh/disconnect e tolerância breve para remount/reconnect. Se a contagem cai a zero e o playback segue `playing`, o servidor aplica pausa idempotente contra `mediaId+revision` atuais; não remove `currentItem` nem altera fila/autoplay. Ao retornar, Media mostra posição pausada e exige gesto explícito para retomar, salvo se outra pessoa manteve playback ativo. Se C continua em Media, playback e sync seguem para C; A/B em Games não rodam provider local. **Isto é especificação futura, não comportamento atual.** Evitar depender somente de evento unload; disconnect/TTL server-side deve convergir. Caso a contagem seja incerta durante queda, preferir pausa segura sem apagar estado.

## YOUTUBE_COMPLIANCE

Enquanto um cliente realmente reproduz YouTube, usa somente IFrame Player API oficial, único iframe visível, sem extraction, proxy de áudio, iframe fora da viewport, `display:none` tocando ou player duplicado. Ao mudar para Games, pedir pause/stop local e confirmar `destroy()`/cleanup antes de esconder/desmontar a superfície; nenhum player YouTube sobrevive invisível no shell. Não confundir pause local com comando compartilhado: o servidor pausa apenas na condição zero visualizadores. Retorno monta nova instância e converge pelo snapshot; pode requerer gesto de autoplay. A política deve ser conferida contra as regras atuais do provider antes de GX3 release; este GX1 não certifica conformidade jurídica.

## DRIVE_POLICY

Drive usa a mesma autoridade Media e a mesma pausa coletiva por zero visualizadores para previsibilidade, **não** porque possui a mesma restrição de iframe. Ao sair da rota, cancelar stream/ticket pendente, abortar fetch/Range e liberar provider. Reentrada requisita ticket próprio depois de validar sessão Lumio, membership, grant temporário, owner/conexão e item atual. Library reference jamais vira grant. Revogação/membership removal deve abortar fluxos e bloquear resync. Token OAuth criptografado no backend, ticket/cookie privados, `Range`/`no-store` preservados. Nenhuma mudança de scope, Google Identity ou OAuth em GX1.

## STATE_OWNERSHIP_MATRIX

`P` = persistente; `S` = compartilhado; `V` = privado por usuário/cliente. Sobreviver à rota **não** implica manter componente montado.

| State | Owner atual → futuro | P/S/V | Media↔Games | Reconnect source |
|---|---|---|---|---|
| Membership/roles | SocialStore/Prisma → Casa | P/S, projeção por membro | Preservar | GET/snapshot Casa |
| Presence online/inParty/lastSeen | SocialStore/socket → Casa/Party | lastSeen P; status S | Preservar, sem experience pública | Socket + House update |
| Chat social | RoomStore/ChatMessage → Party shell | P/S | Preservar UI/draft | Room snapshot/DB |
| Call peers/registro | App + CallRegistry → Party shell | efêmero/S | Mesmas refs/tracks | voice:join e signaling após queda real |
| Mute/deafen | App → Call shell | V; prefs locais | Preservar | preferência local; mic OFF após reconnect real |
| Device selection/volumes | App/localStorage → Call shell | V local | Preservar | `lumio.audio.v1`, capability check |
| Screen share | App/RoomStore/socket → Party shell | efêmero/S; track V | Preservar com indicador | `screen:state`; recaptura nunca automática |
| Current media/position/revision | RoomStore/Prisma → Media domain da Party | P/S | Preservar; pause zero viewers | Room snapshot/media:sync |
| Queue/current occurrence/revision | RoomStore/Prisma → Media domain da Party | P/S | Preservar | Room snapshot/queue:update |
| Autoplay setting | RoomStore/Prisma → Room/House setting | P/S | Preservar | Room snapshot |
| Presentation Video/Ambiente/fullscreen | App/MediaStage → experiência local | V, parte em localStorage | Pode desmontar; preferência preservada | localStorage/default |
| Social Library/favorites/collections | RoomStore/Prisma → Casa | P/S; Drive projetado V | Preservar | Media Hub API + update |
| Active game/type/session | PartyGames → Game domain da Party | efêmero/S com projeção V | Preservar | `game:snapshot` individual |
| Game participants/host | runtimes → Game domain da Party | efêmero/S | Preservar; não auto-join | projeção individual |
| Private word/answers/hand/deck | runtimes → mesmos runtimes | efêmero/V | Nunca mover ao shell | projeção individual autorizada |
| Game timer/deadline/revision | runtimes → Game domain da Party | efêmero/S limitado | Preservar | snapshot individual; UI calcula tempo local |
| Visualizer count Media (novo) | inexistente → servidor por socket/Room | efêmero/S técnico, não público | Atualizar com TTL | join/disconnect/route report autenticado |

## LIFECYCLE_MATRIX

Legenda: `P` preservar, `L` recarregar do servidor, `X` encerrar/limpar, `T` pausa local/desmonta renderer, `R` reconectar conforme V4, `–` não participa. Coluna Media inclui engine local e estado servidor separados; fila nunca é apagada por navegação.

| Transição | Socket | Call | Media | Queue | Game | Chat | Presence | Share | Por quê |
|---|---|---|---|---|---|---|---|---|---|
| Home→Media | join | join mic OFF | L/montar | L | L projeção se ativo | L | inParty | L estado; sem captura | Entrada real na Party |
| Home→Games | join | join mic OFF | estado L, engine não monta | L | L projeção/montar | L | inParty | L estado | Mesmo roomId |
| Media→Games | P | P | T provider local; servidor pausa só com zero viewers | P | P/montar UI | P | P | P, indicador | Troca local explícita |
| Games→Media | P | P | L provider/sync; não auto-resume se pausado | P | P/desmontar UI | P | P | P | Game não recebe leave |
| Media→Home | X/leave | X | X engine, servidor preserva estado | P no servidor | leave explícito da Party conforme runtime | P no servidor; UI X | inParty false | X se dono | Sair da sessão social |
| Games→Home | X/leave | X | sem engine; estado P | P | leave da Party, não end para todos | P no servidor; UI X | inParty false | X se dono | Mesmo cleanup |
| Refresh Media | R/join | R mic OFF | L/sync | L | L projeção | L | recomputar | L; captura não volta | JS/RTC reiniciam |
| Refresh Games | R/join | R mic OFF | L state sem provider | L | L individual | L | recomputar | L; captura não volta | URL define view |
| Reconnect Media | R/join | R mic OFF | L/rebase | L | L individual | L | grace→converge | X track; L estado | Queda não é navegação |
| Reconnect Games | R/join | R mic OFF | L state, sem engine | L | L individual/lock | L | grace→converge | X track; L estado | Sem replay de action |
| Logout | X | X | X engine; estado P | P | leave do usuário, sessão pode seguir | P | offline/inParty false | X | Revogar auth/sessão |
| Membership revoked | X forçado | X | X; revogar Drive | P para Casa; inacessível ao removido | leave/revogar projeção | inacessível | remove inParty | X | Segurança antes de UI |

Pausa por zero viewers pode ocorrer em qualquer linha que zere observadores, inclusive Home, refresh prolongado e disconnect; ela não é gatilhada por mero remount breve nem por um único cliente sair enquanto outros veem. Em refresh/reconnect, tracks não sobrevivem por design atual. Se o servidor reiniciar, Game efêmero pode desaparecer; Media/Queue/Chat persistem em produção.

## REALTIME_DOMAIN_MAP

| Eventos atuais | Domínio futuro | Escopo/autoridade |
|---|---|---|
| `room:join`, `room:leave`, `room:snapshot`, `room:settings`, `member:removed` | SOCIAL/PARTY | Socket autenticado, membership, `roomId` |
| `home:update`, `house:update`, `profile:update` | HOUSE | Projeção permitida por membership; sem game privado |
| `presence:update`, `presence:activity` | SOCIAL | Party/Casa, não selectedExperience |
| `chat:message`, `chat:typing` | SOCIAL | Chat `roomId`, rate/authorization |
| `media:sync`, `media:request-sync`, `media:command`, `room:mode` legado | MEDIA | Revision/mediaId/operationId e permissão |
| `queue:update`, `queue:history`, `queue:add`, `queue:play-next`, `queue:advance`, `queue:clear`, reorder e REST playlist | MEDIA | `roomId`, queueRevision, occurrence ID |
| `media-hub:update` | HOUSE/MEDIA | Invalidação mínima, reconsulta autorizada |
| `game:action`, `game:snapshot`, `game:state`, `game:draw` | GAME | `roomId`, session/round/revision; projeção por user |
| `voice:join`, `voice:leave`, `voice:peer-joined`, `voice:signal`, `voice:speaking` | CALL | Socket ativo no `CallRegistry`, destino exato |
| `screen:start`, `screen:stop`, `screen:state` | CALL/SOCIAL | Slot único e track P2P; payload público mínimo |
| Futuro aviso técnico de visualizador Media | MEDIA | Por socket autenticado; não é feed nem Presence público |

Não criar namespace/socket separado por experiência. GX3 deve atualizar contratos compartilhados antes de qualquer evento novo. Snapshots públicos Room não transportam privadas Game; `game:snapshot` é individual. Socket reconnect nunca reenvia mutação sem confirmação; apenas ressincroniza.

## SECURITY_BOUNDARIES

- Auth token Lumio é a identidade; Google Login não é Drive OAuth. URLs nunca outorgam acesso. Toda rota/REST/socket valida sessão, Casa e Party atuais no servidor.
- `room:join` valida `user.id` da sessão e membership; cada ação valida `joinedRoomId`/role/revision. Rota Media/Games não enfraquece isso. Não confiar em `houseId`, `roomId`, view ou botão disabled do cliente.
- Game private projections continuam por socket/usuário. Shell recebe somente metadados públicos; não espalhar `choices`, `secretWord`, `ownAnswer`, `myHand`, deck ou pending em contexto React global, log, Home ou cache PWA.
- Drive: grant/ticket efêmeros e específicos; arquivo salvo na Casa não dá acesso. Stream e Range passam pelo backend, com cookie/`no-store`; revogação aborta. Não mostrar metadata de outro membro sem projeção permitida.
- Chat, Call signaling e fila conservam rate limits, autorização e validação. `screen:start` precisa permissão e slot; captura local somente após gesto.
- Rotas profundas e `next` de auth devem manter same-origin; não usar redirecionamento aberto. PWA cache só assets estáticos, não snapshots/tickets.

## PERMISSIONS

Não há permissão nova para **olhar** Media/Games ou trocar rota local: membership basta. Criar Casa continua auth; entrar na Party continua membership. Play/pause/seek obedecem `RoomSettings.mediaControl`/`canControlMedia`; adicionar fila usa `queueControl`/`canAddToQueue`; limpar fila `QUEUE_MANAGE`; editar Library/Coleções/papéis usa permissões existentes. Iniciar/participar/encerrar jogo seguem `PartyGames` (participação e coordenação, revisão exata), não host de Casa automaticamente. Call `CALL_JOIN`; share `SCREEN_SHARE`; guests não compartilham. Uma pausa automática por zero viewers é operação interna do servidor, não poder atribuído a usuário. Se um membro estiver sem permissão Media, ainda pode abrir a view e assistir, mas não controlar.

## PRESENCE

Manter `online`/`inParty`/`lastSeen`; **não adicionar `experience` pública**. Como rota é local por aba, um mesmo usuário poderia ver Media e Games em abas distintas; um campo único seria falso/ambíguo e criaria vazamento de hábito. Visualizer Media é registro técnico efêmero por socket, sem exposição em `HouseMember`, feed ou House Activity. Game ativo pode continuar gerando resumo público allowlisted existente, sem implicar que todos participam. Troca de rota não gera evento de entrada/saída da Party nem atividade social. Call/speaking/share permanecem dimensões já existentes.

## DATA_MODEL_IMPACT

| Models atuais | Reuso | Possível mudança GX2–GX5 | Justificativa |
|---|---|---|---|
| `Group`, `GroupMember`, `HouseInvite`, `HouseActivity` | Integral | Nenhuma prevista | Casa/membership não mudam |
| `Room` e `primaryRoomId` em `SocialStore` | Integral | Nenhuma obrigatória | Uma Party por Casa; `mode` legado não vira `initialExperience` |
| `QueueItem`, `MediaHistory`, `ChatMessage` | Integral | Nenhuma prevista | IDs/escopo por Room continuam |
| `MediaItem`, `GroupLibraryItem`, `Playlist`, `HouseFavorite`, progress | Integral | Nenhuma prevista | Library já é Casa; canonical media preservada |
| `AuthSession`, `ExternalIdentity`, `GoogleDriveConnection` | Integral | Nenhuma prevista | Auth/OAuth fora do GX |
| Game/Call/Presence/visualizer | Runtime efêmero | Nenhuma tabela nesta versão | Sem requisito de persistir jogo, RTC ou view |

**Nenhuma migration é necessária ou recomendada para GX2/GX3 sob a arquitetura escolhida.** Caso produto futuro exija múltiplas Parties ou persistência de jogo/ocupação, exigir novo ADR, migração aditiva e QA de dados; não introduzir schema preventivo. GX1 não cria migration nem consulta banco de produção.

## REACT_TREE_TARGET

```text
AppRoot (auth/bootstrap/rotas públicas e Home; sem RTC na Home)
└─ HousePartyShell key=houseId/roomId (apenas /house/:id/*)
   ├─ Party socket + snapshot/reconnect + membership guards
   ├─ Call lifecycle/RTC refs + Share track/indicator
   ├─ Social Chat + PartyGameChatProvider público + Presence + nav
   ├─ Game projection subscription privada (apenas consumidor autorizado)
   └─ experience outlet, key=experience (única superfície ativa)
      ├─ MediaExperience → MediaStage → UniversalPlayer único,
      │                    Queue UI, lazy MediaHub/Library
      └─ GamesExperience → lazy GameHub → lazy Draw/Quiz/Cards renderer
```

Não são mandates nomes de novos providers; o contrato é **estabilidade de identidade do shell**, refs e subscriptions. `PartyGameChatProvider` atual está corretamente acima do MainStage e pode ser mantido; sua projeção pública não deve virar container para privados. `MainStage` atual pode ficar durante GX2. Depois de GX3, sua responsabilidade de multiplexar Media/Game deve acabar ou ficar apenas como componente de apresentação Media/share; não preservá-lo por dogma. Call/Chat/Queue não devem morar em cada rota. Benefício React: chunks de jogo e Hub carregam condicionalmente; listeners/intervals dos renderers têm cleanup; evitar re-render do shell por ticks de jogo/player (diretriz de estado transitório em refs e componentes isolados). Não manter iframe/WebGL só para não remountar RTC.

## MIGRATION_STRATEGY

1. **GX2 — Fundação social/call.** Cobrir identidade RTC/socket com testes; extrair fronteira lógica do shell de `App.tsx` sem mudar URLs nem MainStage, protocolo, auth, game ou mídia. Estabilizar cleanup por saída real vs mudança de view, ownership de `PartyGameChatProvider` e snapshot. Provar Home sem RTC e Party com apenas um socket. Compatibilidade total com `/house/:id`.
2. **GX3 — Separação visual.** Introduzir rotas canônicas, alias legado, escolha inicial e nav/Back/deep link/refresh; mover superfícies `MainStage` para `MediaExperience`/`GamesExperience` mantendo shell GX2. Implementar visualizer registry efêmero e pausa autoritativa de zero espectadores com idempotência/revision; provider cleanup YouTube/Drive e resync de retorno. Não reescrever `RoomStore` ou `PartyGames`.
3. **GX4 — Jogos V2.** Reestilizar Draw/Quiz/Cards nos limites da rota Games, com mobile, acessibilidade, opcional renderer 3D/2.5D lazy. Não mexer em IDs/socket/Call/Media/privacidade/autoridade das regras.
4. **GX5 — Integração.** Matriz multi-cliente, provedores reais, PWA/mobile, RTC/TURN, segurança e performance. Só então considerar release. Qualquer mudança de premissa (multi-Party, experiência coletiva, game persistence) exige ADR novo antes de implementação.

Rollback por fase: GX2 conserva UI/rota antiga e pode recuar extração sem data migration; GX3 mantém alias `/house/:id` e pode feature-gate a rota visual enquanto estado server existente continua íntegro; GX4 é renderer substituível; GX5 não introduz mudança de modelo. Não usar big-bang, duplicar sockets ou trocar ID.

## GX2_CONTRACT

**Entry:** uma Party por Casa/`primaryRoomId`; `App.tsx` possui socket Party, snapshot e RTC; `/house/:id` funciona; testes de G6/M3 e Call V4 verdes ou falhas documentadas. **Exit:** shell persistente acima de view Media/Game comprovado por identidade de socket, RTCPeerConnection, tracks e preferências em transição local; cleanup apenas em saída/queda real; mic OFF por default; Home leve; projeções Game privadas não entram no shell; sem drift de fila/player. **Non-goals:** novas rotas, novo sistema de Party, mudança de schema, visualizer registry, player hidden workaround, novo RTC/signaling, UI de jogos, migração Google/Drive, criação de Provider genérico excessivo. Alterar primeiro shared types se algum contrato existente precisar ser movido, sem mudar semântica.

## GX3_CONTRACT

**Entry:** shell GX2 estável e testes de identidade/cleanup automatizados. **Exit:** `/house/:id/media|games`, alias, inicial escolha local, nav explícita, Back/refresh/deep links sem novo socket/Call; game projection individual no route; YouTube 100% parado/destruído ao não estar visível; Drive requests cancelados; registro de viewers Media por socket autenticado, tolerância a remount e pausa server-side CAS quando zero; Media volta a posição/fila/revision determinísticas; share acessível nas duas rotas; guards para não membro. **Non-goals:** multi-Party, mais de um game, mudança de regra/3D, Media Session table, exigir experiência coletiva, refazer auth ou RoomStore. Transição deve ser idempotente mesmo com Back rápido/duas abas; desligar provider **antes** de ocultar e aceitar autoplay gesture no retorno.

## GX4_CONTRACT

Pode assumir `roomId`, Call/Chat/shell, URL Games, contrato de game projections e rota Media estáveis. Draw V4, Quiz V2, Cards V2 e mobile redesenham somente apresentação. Canvas/WebGL futuros só mostram projeção autorizada e enviam ações tipadas; não embaralham, pontuam, determinam vencedores ou conhecem segredo de terceiros. DOM acessível para informação/ações críticas e fallback sem WebGL. Renderer pode remountar; Party/Call/Media state não. Não ampliar payload privado nem criar novo canal de socket.

## GX5_CONTRACT

Deve provar Media→Games→Media com A/B/C; mesma Call/socket/Chat, mute/deafen/device e share; Queue/revisions/autoplay/history; Game voluntário/privado/late join; reconnect e refresh em ambas as rotas; Back/deep links/invite/sem membership; último viewer Media e concorrência; YouTube visível somente em Media, Drive grant/ticket/Range revogados corretamente; 2 tabs do mesmo usuário; mobile portrait/landscape/teclado/PWA; provider/autoplay bloqueado; carga e leaks; logs sem dados privados. Não declarar QA física Google/WAN/iOS sem executar de fato.

## TEST_STRATEGY

| Fase | Prova automatizada | Prova manual ainda necessária |
|---|---|---|
| GX2 | A/B/C loopback RTC, refs/tracks estáveis em view switch; mic OFF inicial; Home sem room:join; leave/revocation cleanup | Áudio humano, diferentes NAT/TURN e dispositivos |
| GX3 | Links Media/Games, alias, Back/refresh/reconnect, zero/um/dois viewers Media, CAS race, queue unchanged, Youtube adapter destroyed, Drive abort | YouTube/Drive reais, autoplay policy, browser Safari/Android |
| GX4 | Snapshots individuais Draw/Quiz/Cards, um jogo, observers, remount renderer, acessibilidade DOM/teclado/reduced-motion | Leitor de tela, toque/rotação, pessoas 2–8 |
| GX5 | E2E A/B/C multi-tab+late join+active game+share; M1–M3, S1/S2, PWA; soak/heap sampled | WAN/TURN, stream real, PWA instalada, mobile físico |

Usar fixture determinística somente para local/E2E, não endpoint de debug em produção. Reconnect não retransmite ações incertas automaticamente; snapshot converge. Casos de privacidade inspecionam payload Socket.IO bruto por identidade, não apenas DOM.

## PERFORMANCE

Shell mantém só socket/RTC/chat/presença; renderer Game, canvas/WebGL, MediaHub e player desmontam quando não relevantes. Uma transição não mantém iframe invisível nem engine GPU. Lazy imports já existentes de GameHub/Draw/Quiz/Cards e MediaHub preservados. Tempo do player e mic level ficam fora do state global da Party; evitar tick websocket por segundo e snapshots inteiros por ponto de desenho. Refs estáveis para listeners RTC; cleanup em unmount. Medir heap/CPU/upload em 2–8 clientes antes de release; mesh RTC escala upload ~N−1, sem afirmar que GX resolve isso. Visualizer registry deve ter TTL e payload mínimo.

## MOBILE

Uma aplicação responsiva, não fork mobile. Em portrait, Media prioriza player/chat composer com safe-area/VisualViewport; Games prioriza canvas/pergunta/mão e chat acessível. Landscape/fullscreen preservam shell/call e usam fullscreen local; browser chrome e teclado não devem obscurecer input/controles. `MediaStage` e Game canvas não devem coexistir ocultos consumindo memória no mobile; Drive stream é cancelado ao sair. Call controls acessíveis pelo microfone do composer como atual, mas sem desativar chat; share status sempre visível. PWA não promete offline Party e não recarrega automaticamente durante call.

## ACCESSIBILITY

Nav Media/Jogos como links com `aria-current`, foco restaurado ao heading da experiência após push/Back, anúncio de rota por live region sem perder foco do composer indevidamente. Keyboard/Escape mantêm semântica; focus trap apenas em overlays. Estados reconnect/pausa/erro em texto, não só cor/animação; targets touch ≥44 px, contraste, zoom, `prefers-reduced-motion`. Future Cards WebGL precisa alternativa DOM para ler mão própria, turno, ações/confirmar e resultado; nenhum dado privado em aria de observadores. Screen share e Call permanecem operáveis em qualquer rota.

## OBSERVABILITY

Futuro, sem telemetria neste GX1: eventos estruturados `party_shell_mount/unmount` (reason), `experience_transition` (from/to, roomId pseudônimo), `media_viewer_count_changed`/`media_paused_no_viewers` (revision), `call_reconnect`/`mic_reset`, `socket_rejoin`, `game_projection_restored`, `share_cleanup`. Contar sockets/peers/provider instances e latência de snapshot; nunca logar chat, palavra/resposta/mão, URL/ticket Drive, OAuth, SDP/ICE sensível ou token. Correlacionar por request/connection IDs técnicos; não transformar rota local em feed social.

## RISK_REGISTER

| Risco | Probabilidade | Impacto | Mitigação | Owner phase |
|---|---|---|---|---|
| R1 Call remount em nav | Alta sem boundary | Crítico | Shell estável, testes de identidade peer/track | GX2 |
| R2 Sockets duplicados | Média | Alto | Um owner por Party; contagem/cleanup E2E | GX2/GX3 |
| R3 YouTube oculto tocando | Alta se player mantido | Crítico | Stop/destroy antes do route unmount; provider real | GX3/GX5 |
| R4 Perda Media/Queue | Média | Alto | Estado no Room, snapshots/revisions; zero viewers CAS | GX3 |
| R5 Vazamento game privado | Média em refactor | Crítico | Projeção individual, inspeção wire A/B/C | GX2/GX4/GX5 |
| R6 Refresh rota sem estado | Média | Alto | Resolver Casa→Room, snapshot autenticado, alias | GX3 |
| R7 Snapshot obsoleto/duplicação | Média | Alto | Revision/CAS/operationId; não replay incerto | GX3/GX5 |
| R8 Share órfão na troca | Média | Alto | Track no shell, indicador/stop, cleanup real | GX2/GX3 |
| R9 Regressão mobile/teclado | Alta | Médio | Layout mobile-first, QA 320–430/landscape | GX3/GX4 |
| R10 Presence falsa por experience | Média | Médio | Manter inParty, não publicar rota local | GX3 |
| R11 Ambiguidade multi-Party | Baixa agora | Alto se expandir | Proibir explicitamente, ADR futuro | GX1/GX5 |
| R12 Overengineering | Média | Médio | Sem novo model/socket/provider obrigatório | GX2/GX3 |
| R13 Zero-viewer race/remount | Média | Alto | Grace/TTL, CAS revision, server authority | GX3 |
| R14 Drive grant revogado em rota | Média | Alto | Revalidar em ticket/Range, abort, no-store | GX3/GX5 |

## ADRS

Cada ADR é normativo para GX2–GX5; mudar decisão exige novo ADR e revisão dos contratos.

| ADR | Context | Options | Decision | Rationale | Consequences | Deferred questions |
|---|---|---|---|---|---|---|
| 01 Party/Social Session | `primaryRoomId` agrega domínios | A única Party; B duas Parties; C pai+filhos | A; Party=Social Session/Room atual | Preserva IDs/sockets/call e compatibilidade | Sem multi-Party agora | Multi-Party quando houver demanda real |
| 02 Route model | `stageView` sem deep link | rotas locais; rota coletiva; sem rota | `/house/:id/media|games`, alias legado | View é local, jogo e mídia podem coexistir | Shell acima de outlet; Back local | Escolha de biblioteca de router é implementação |
| 03 Call ownership | RTC em App, registro por Room | Casa; rota; Party | Party `roomId` | Home não é Call; troca não reconecta | Cleanup só leave/queda real | SFU/Call V5 fora GX |
| 04 Chat ownership | ChatMessage por roomId | Casa; game; Party | Chat social Party | Mesmo grupo conversa em ambas | Guesses/actions separados | Histórico/feed longo futuro |
| 05 Media in Games | YouTube não pode ocultar tocando | pause global imediato; mini player; stop local+zero viewers | Stop/destroy local; pause server se zero Media viewers | Não interrompe C que assiste, não oculta iframe | GX3 precisa viewer registry efêmero | Duração da grace calibrar em teste, default breve |
| 06 Game runtime | `PartyGames` um por Room | route-owned; novo game room; atual | Atual, server-authoritative | Navegação não encerra game nem vaza privado | Renderer livre para GX4 | Persistência de partidas futura |
| 07 Screen Share | Track P2P/call por Room | Media; Game; Party | Party/Call, visível/controlável em ambas | Share pode coexistir com Games | Shell tem indicador e cleanup | Layout de mini preview em GX3 |
| 08 Concurrency | Uma Room primária por Casa | múltiplas; única | Uma Party ativa por Casa | Evita migração grande e Call ambígua | Múltiplos subgrupos não suportados | Novo ADR/schema se produto exigir |
| 09 initialExperience | Criação hoje auto-abre Media | Room.mode; preferência global; rota | Parâmetro local de entrada/rota | Não bloqueia troca nem altera outros | Sem schema/migration | Texto exato do CTA em UX GX3 |
| 10 Presence | S2 online/inParty; rota local | expor experience; não expor | Manter S2; viewer técnico não público | Multi-tab torna campo único enganoso | House Activity não registra troca | Opt-in de status futuro |

## DEFERRED

Múltiplas Parties na mesma Casa; Call SFU/V5 e multi-instance Socket.IO/Redis; persistência de Game/Call; novo tipo de experiência; coerência exata do cache de idempotência Queue após restart; Media Session API/lock screen; Cards WebGL específico; ajuste fino de grace de visualizador e UX de share miniatura; analytics/social feed de experiência. **Não** são decisões fundamentais para GX2 sob o modelo A. Se o produto passar a exigir assistir e jogar em duas Parties sociais independentes simultaneamente, GX1 deve ser reaberto antes de coding.

## KNOWN_LIMITATIONS

Este é um design, não prova de implementação: zero-viewer pause e rotas dedicadas ainda não existem; `App.tsx` permanece monolítico; estado Game/Call/Presence é volátil e servidor único. Testes locais Chromium/loopback não cobrem YouTube/Drive reais, iOS/Android/PWA instalado, voz humana, redes WAN/TURN ou verificação regulatória YouTube. A política de paused-on-zero-viewers requer testes de corrida/tolerância antes de afirmar robustez. Nenhuma consulta ao banco ou deployment de produção foi feita.

## RESPOSTAS_OBRIGATORIAS

| Nº | Resposta explícita |
|---|---|
| 1 | Casa é `Group` persistente: comunidade, membership, papéis, convites, atividade e biblioteca. |
| 2 | Party é a sessão social/realtime da Room primária de uma Casa. |
| 3 | Room é registro persistido e agregado server-side da Party/mídia, também chave do fanout. |
| 4 | Party/Room/social session/socket room/call scope/media scope/game room usam `primaryRoomId`; Casa usa outro ID; game/auth sessions usam IDs próprios. |
| 5 | Casa → uma Party/Room social → duas experiências visuais locais, Media e Games. |
| 6 | Party será sessão social, não um tipo de experiência. |
| 7 | Media e Games são experiências na mesma Party, não Parties diferentes. |
| 8 | Não na primeira versão GX: uma Party primária por Casa. |
| 9 | Multi-Party é deferred e deliberadamente não suportado; exigir ADR/migration futuros. |
| 10 | Assistir/Ouvir ou Jogar escolhe rota inicial da aba após criação/entrada. |
| 11 | Não, escolha reversível, não persistida e não muda Room.mode. |
| 12 | Qualquer membro pode trocar a própria view; ações compartilhadas continuam com permissões existentes. |
| 13 | Troca é local; não muda a experiência de todos. |
| 14 | Media→Games preserva socket/Call/chat/membership/queue/currentMedia/revisions/library/game; provider local é encerrado; pausa server só se zero viewers. |
| 15 | Games→Media preserva tudo acima e jogo ativo; renderer desmonta, player monta/resync; não entra automaticamente na partida. |
| 16 | Call vive hoje nos refs/estado de `App.tsx`, com registro server `CallRegistry` por Room. |
| 17 | Deve viver no PartyShell/Social Session, acima das rotas de experiência. |
| 18 | `roomId` identifica Call; `socketId` identifica geração/peer ativo de usuário. |
| 19 | Não ao trocar rota; sim após queda real/refresh segundo Call V4. |
| 20 | Sim na troca: mute/deafen/device/tracks; na queda real mic e share voltam OFF, preferência local persiste. |
| 21 | Apenas gesto explícito para ligar mic ou troca de input já autorizada; não entrada/rota automática. |
| 22 | Chat social pertence ao Room/Party, visível pelo shell em ambas as rotas. |
| 23 | Não. Draw guess, Quiz answer e Cards action são comandos Game, não ChatMessage. |
| 24 | `RoomStore.currentMedia` e persistência Media da Room; player é apresentação. |
| 25 | `RoomStore`/Prisma `QueueItem` por `roomId`, revisão própria; UI não é autoridade. |
| 26 | Social Library pertence à Casa/`groupId`, projetada pelo Media Hub autorizado. |
| 27 | Cliente Games encerra provider local; servidor conserva item/fila/posição e pausa apenas se não houver viewer Media. |
| 28 | Não, YouTube invisível não continua tocando. |
| 29 | Iframe oficial para/é destruído antes de desmontar Media; uma nova instância visível recebe snapshot ao voltar. |
| 30 | Drive segue mesma política de estado/pausa por UX, embora sem restrição visual idêntica; ticket/stream abortados e revalidados. |
| 31 | Sim: mídia, posição, queue, autoplay e revisões permanecem no Room. |
| 32 | Screen Share vive na Party/Call, com slot server e track P2P. |
| 33 | Sim, com indicador/stop acessíveis em Games; não depende de Media. |
| 34 | `PartyGames(roomId)` server-side, não GameHub/rota. |
| 35 | Sim, um jogo ativo por Party, inclusive lobby/resultado. |
| 36 | Não; game participation é voluntária e distinta da Call. |
| 37 | Projeções individuais autenticadas; nenhum segredo no shell/global state/log/cache. |
| 38 | AppRoot → HousePartyShell persistente → outlet MediaExperience ou GamesExperience; Call/Chat/socket acima. |
| 39 | Auth guard, socket/snapshot, Call/share, Chat, Presence, nav e projeção pública Game. |
| 40 | Um socket Party por aba na Party; Home possui um socket leve distinto quando a aba está Home; não dois de experiência. |
| 41 | PartyShell possui socket Party; Home possui seu socket leve, ambos encerrados na troca de contexto. |
| 42 | URL Casa/experiência → auth/membership → primaryRoomId → join/snapshot → view correspondente; sem criar Room. |
| 43 | Reconstrói shell e estado do servidor; Call volta receive-only mic OFF; Game recebe projeção individual. |
| 44 | Back muda child route sem recriar Party; ao voltar Home, leave uma vez. |
| 45 | Não em status público: `inParty` basta. Viewer count Media é técnico e privado do servidor. |
| 46 | Não para GX2/GX3 sob modelo escolhido. |
| 47 | Nenhuma migration prevista; só futuro multi-Party/game persistido exigiria migrations aditivas com ADR. |
| 48 | A uma Party/duas experiences; B duas Parties; C Social Session pai e child sessions. |
| 49 | A. |
| 50 | Preserva IDs, Call, Chat, Queue, Game e segurança com menor migração; evita dois Lumios. |
| 51 | Call remount, socket duplicado, YouTube oculto, zero-viewer race, estado privado Game, refresh e Drive revogado; ver risk register. |
| 52 | GX2 estabiliza PartyShell, Call/socket/Chat ownership e lifecycle/cleanup sem rotas novas. |
| 53 | GX2 não cria rotas, schema, protocolos novos, player ou jogo novo, nem refaz OAuth. |
| 54 | GX3 cria rotas e transições, visualizer policy, cleanup do provider, deep link/refresh/Back, preservando shell. |
| 55 | GX4 assume Room/Call/Chat/rotas/projeções/Media estáveis; remodela somente renderers Game. |
| 56 | GX5 prova multi-cliente, Media↔Games, Call/Chat/Queue/Game/privacy, reconnect, providers, mobile, PWA e permissões. |
| 57 | Reusar SocialStore, RoomStore, Prisma models, CallRegistry, PartyGames, media adapters, Game runtimes, auth e contratos. |
| 58 | Desacoplar RTC/socket/snapshot de `App`/route render, GameHub de MainStage, provider Media da necessidade de ficar montado em Games. |
| 59 | Pode permanecer durante GX2; após GX3 deixa de ser multiplexador Media/Game, talvez seja só apresentação Media/share. |
| 60 | Sim, renderer Cards lazy lê projeção autorizada; não toca Call/Media nem regras server-side. |
| 61 | Sim, com apenas uma experiência pesada montada, shell estável, portrait/landscape e safe-area/teclado. |
| 62 | Sim: uma Casa, Party, socket, Call, Chat, Queue e game registry. |
| 63 | Não. Somente este documento foi criado. |
| 64 | Não. |
| 65 | Não houve commit, push nem deploy nesta etapa. |
| 66 | Typecheck/lint/build; repetição `npm test` 170 pass/6 skips/0 fail; E2E 14/14. Primeira execução de teste falhou intermitentemente e foi documentada. |
| 67 | Multi-Party, SFU, game persistence, WebGL exato, analytics e calibração de grace/UI share; fundamentos GX2 estão decididos. |
| 68 | GX2 READINESS: READY, condicionado à revisão/aprovação humana deste Design Bible; não é autorização de implementar/deploy. |

## READINESS_VERDICT

Contratos congelados: Casa≠Party; Party=Room/Social Session `primaryRoomId`; uma Party/Casa; experiências locais Media/Games; initialExperience só rota; Call/Chat/socket/share no shell `roomId`; Media/Queue server Room; Library Casa; game único/privado server Room; YouTube jamais oculto tocando; Drive revalida grant/ticket; estado visual local e Presence S2 intactos; rotas/Back/refresh/deep links e lifecycle especificados; GX2–GX5 com escopos próprios. Os itens deferred não impedem GX2.

**Baseline final:** typecheck, lint e build passaram; `npm test` 170/170 pass executáveis, 6 skips condicionais PostgreSQL; E2E 14/14; primeira tentativa de teste teve falha de processo isolada e não reproduzida. `git diff --check` e whitespace do documento sem erros (ver fechamento da auditoria). Isso comprova regressões locais atuais, não GX2 já implementado.

GX2 READINESS: READY
