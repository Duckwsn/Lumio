# GX3 — Dedicated Party Routes & Experiences

## STATUS

Implementado localmente; sem commit, push, deploy, migração ou mudança em produção. A revisão humana deve confirmar o resultado em navegadores reais antes de publicação.

## BASELINE

Antes das alterações: árvore Git limpa; `typecheck`, `lint`, `build`, `npm test` e 15/15 cenários E2E passaram. O baseline usava `/house/:houseId` e `stageView` local para mídia/tela/jogos, mantendo o MediaStage montado em Jogos. PostgreSQL descartável não estava disponível nesta execução (Docker Desktop Linux Engine não respondeu).

## GX1_CONTRACT_COMPLIANCE

Uma única Party e uma única Room por Casa, com Chat/Call/Presence/Queue/GameRuntime compartilhados. A URL agora seleciona só a experiência local. Jogos não contém iframe YouTube, vídeo Drive nem player de mídia oculto. O servidor pausa autoritativamente a ocorrência atual após o último espectador sair. A escolha inicial não virou Presence ou coluna de banco.

## GX2_CONTRACT_PRESERVATION

`useHousePartyShell` continua acima do outlet de experiências. Sua chave de lifecycle permanece token + House + Room, sem dependência de `/media` ou `/games`. Socket, peers RTC, tracks de microfone e display, mute/deafen, Chat e draft sobrevivem à troca. Somente a saída real da Party desmonta o shell.

## ROUTING_BEFORE

`App.tsx` usava History API manual e extraía todo o sufixo após `/house/` como House ID. Jogos era estado visual `stageView=game`, sem URL dedicada. A troca não podia ser restaurada por Back, Forward ou refresh.

## ROUTING_AFTER

`parsePartyRoute` reconhece `/house/:houseId/media`, `/house/:houseId/games`, o alias legado e rejeita sufixos inválidos. `partyPath` codifica o House ID. O House ID decodificado, não a experiência, é a identidade do transport. Navegação usa `pushState`; `popstate` reconstrói o outlet. O alias usa `replaceState` para `/media`, preservando query string e sem entrada extra no histórico.

## PARTY_SHELL

Identidade da Casa, navegação, conexão, Chat, Call, presença e controles compartilhados continuam acima das experiências. A seleção local não envia `room:leave`, `room:join`, `voice:leave` ou `voice:join`.

## SHARED_PARTY_CHROME

Header, navegação Media/Jogos, pessoas, convite, menu da Casa, perfil, Chat, fila e Dock continuam únicos. Os botões da navegação mantêm `aria-label` quando o texto é escondido em telas estreitas.

## MEDIA_EXPERIENCE

`MediaExperienceStage` monta o único `MediaStage` e alterna localmente com a visualização de Screen Share. Ambiente, controles, Volume, Theater, Sync V2, fila e Media Hub continuam com a implementação existente.

## GAMES_EXPERIENCE

`GamesExperienceStage` monta GameHub sem MediaStage. O mesmo Screen Share da Party pode ser aberto a partir de Jogos. Draw, Quiz e Cards continuam no runtime autoritativo do servidor; esconder/remontar o GameHub não é entrar/sair da sessão do jogo.

## LEGACY_ROUTE

`/house/:houseId` é canonicalizada para `/house/:houseId/media`. Convites existentes que levam à Casa abrem `/media`. Rota desconhecida sob `/house/` mostra erro seguro, sem ingressar numa Room arbitrária.

## INITIAL_EXPERIENCE

O diálogo de criação de Casa oferece Assistir/Ouvir ou Jogar; os cartões de Casa também oferecem entrada direta em Jogar. É somente destino inicial de navegação. Não há campo persistente, nova Room ou migration. O usuário pode trocar a qualquer momento.

## EXPERIENCE_SWITCH

O header atualiza a URL local. Ações explícitas que iniciam reprodução a partir da fila ou do Media Hub abrem `/media` antes de iniciar o playback; adicionar à fila sem reproduzir não força a troca. Outros participantes não navegam automaticamente.

## BROWSER_BACK_FORWARD

`popstate` atualiza a experiência sem alterar a identidade do Party shell. Teste E2E GX3 cobre Back e Forward com o mesmo House ID.

## DEEP_LINKS

Ambas as rotas novas são acessíveis diretamente, com bootstrap de autenticação e membership HTTP/Socket.IO existentes. Identificadores malformados e experiências desconhecidas não iniciam Party.

## REFRESH

Refresh em Media e em Jogos é coberto pelo E2E. Como refresh é uma nova página, o socket reconecta e a associação à Room é refeita; isso difere da troca local de experiência.

## MAINSTAGE

O multiplexador `MainStage` antigo foi removido. Dois componentes de experiência recebem apenas os dados de apresentação necessários. As expectativas antigas de manter o mesmo nó DOM do player foram atualizadas para exigir desmontagem/remontagem; não foram simplesmente removidas.

## MEDIA_PROVIDER_LIFECYCLE

Saída de `/media` desmonta `MediaStage`, destrói o adapter e seus recursos locais. Retorno cria um provider novo e aplica o snapshot de mídia do servidor. Máximo de um provider local. Isso não remove `currentMedia`/Queue do RoomStore.

## YOUTUBE_COMPLIANCE

O YouTube continua na IFrame Player API oficial. O adapter pausa antes de destruir o iframe; não há iframe escondido em Jogos, áudio extraído ou player paralelo.

## DRIVE_PROVIDER_LIFECYCLE

O adapter Drive já aborta tickets pendentes, pausa e remove `src` ao destruir. GX3 o desmonta ao sair de Media e recria um único vídeo/ticket autorizado ao voltar. Grants e OAuth não mudaram.

## MEDIA_VIEWER_REGISTRY

`MediaViewerRegistry` mantém `Map<roomId, Set<socketId>>` apenas em memória. Eventos mínimos `experience:media:enter/leave`; o servidor deriva socket ID, valida token pelo middleware, House membership, Room ingressada e roomId exato. Enter/leave duplicados são idempotentes. Não há evento público ou tabela.

## VIEWER_IDENTITY

Viewer é aba/conexão Socket.IO, não usuário. O mesmo usuário pode ter uma aba em Media e outra em Jogos; somente a primeira conta. Disconnect, Party leave, troca de Casa, logout e revogação removem a conexão. Reconnect re-registra somente depois do snapshot de rejoin autorizado.

## ZERO_VIEWER_POLICY

Quando o último viewer sai, uma janela de 1,5 s permite handoff/reconnect curto. Se ninguém entrar, `RoomStore.pauseIfCurrent` calcula a posição efetiva e pausa uma única vez com revisão normal. Preserva item atual, fila/revisão, autoplay e History. Retorno a Media não retoma automaticamente. Avanço automático via `queue:advance` é recusado com zero viewers.

## ZERO_VIEWER_RACES

Novo enter cancela o timer. O callback confere identidade do timer, count zero, Room existente, mediaId, revisão, queueItemId e `state=playing`; timer antigo, pause manual ou mídia encerrada/substituída não podem pausar a ocorrência nova. `saveMedia` arma a mesma política quando alguma ação legítima inicia playback sem viewers. Exclusão da Casa e shutdown limpam timers.

## CURRENT_MEDIA

Permanecem selecionados mediaId, título, provider, item da fila e posição após pausa. `controlledBy` anterior é preservado na pausa automática; não existe controlador fictício adicional.

## QUEUE

A fila, seus IDs/ordem e `queueRevision` não são alterados pelo viewer registry. Queue V2/M3 continua autoritativa no RoomStore.

## AUTOPLAY

`autoplayNext` permanece como preferência. Enquanto não houver viewer, `queue:advance` não avança invisivelmente. Com viewer, a regra de fim e autoplay existente permanece.

## MEDIA_HISTORY

A pausa não chama `recordHistory`; voltar à rota também não chama play. Reproduzir manualmente o mesmo item usa a proteção existente por `historyItemId`, sem duplicar uma ocorrência por remount.

## GAME_RUNTIME

PartyGames continua na Room do servidor, independentemente do outlet. Nenhum comando novo de gameplay foi criado por GX3.

## GAME_PARTICIPATION

Entrar/sair da apresentação não envia `game:join`/`game:leave`; participação, timer e partida continuam no servidor. Ao voltar, GameHub consulta `inspect` e recebe a projeção atual.

## GAME_PRIVACY

GX3 não altera projeções de Draw/Quiz/Cards, segredo, alternativas ou mãos privadas. Os testes existentes de privacidade foram preservados.

## CALL_CONTINUITY

Call permanece no shell GX2. O E2E com dois clientes verifica identidade de socket, peer e tracks e ausência de novos captures ao alternar cinco vezes.

## MIC_DEAFEN_DEVICES

Mute, deafen e seleção de dispositivos permanecem no estado do shell, não nos stages. GX3 não invoca `getUserMedia` por troca de rota.

## SCREEN_SHARE

O display track e slot do servidor pertencem à Party/Call. Ambos os stages oferecem visualização do mesmo share; Games não precisa montar MediaStage para isso. Sair de Media não chama `getDisplayMedia` nem para o share.

## CHAT

Chat é único, no Party shell. Draft, mensagens, scroll e status sobrevivem à navegação. A tecla Escape de Jogos não intercepta foco em campo editável.

## PRESENCE

`inParty` e presença social não mudam ao trocar experiência. Viewer registry não é Home Presence nem perfil/analytics.

## RECONNECT

Disconnect remove viewer antigo; rejoin recebe snapshot; se a aba ainda está em Media, emite enter após autorização. Grace curta reduz pausa durante handoff sem transportar socket ID antigo.

## HOUSE_CHANGE

House ID muda a chave do shell: antiga Party/Call/renderer são liberados. O servidor remove viewer da Room antiga ao `room:leave`/disconnect e não o transfere à Casa nova.

## LOGOUT

Logout revoga a sessão e desconecta sockets associados, disparando cleanup de viewer. A experiência não é persistida como preferência de conta.

## REVOCATION

Remoção de membro limpa explicitamente viewer antes de desconectar o socket; exclusão de Casa limpa registry/timers da Room. Middleware recusa enter sem membership.

## SECURITY

Evento não permite informar socketId/count nem mexer no viewer de outro socket/Room. Auth/CORS/role checks existentes continuam. Nenhuma alteração em OAuth, Drive grants, segredos, schema ou dados de produção.

## PWA_AND_DIRECT_ROUTES

`vercel.json` já reescreve URLs desconhecidas para `index.html`; manifest cobre `/` e começa em `/app`. Nenhuma alteração versionada em Vercel/service worker foi necessária. Auth e mídia privada não entram em cache offline.

## PERFORMANCE

MediaStage não consome provider, iframe, vídeo ou ticket em Jogos. Registro de viewers é O(1) por evento e efêmero. A duração de 1,5 s é curta para handoff, sem polling. O chunk de stages é lazy; GameHub e jogos mantêm lazy loading existente.

## ACCESSIBILITY

Navegação Media/Jogos tem rótulo e `aria-current`. O rótulo continua disponível a leitores de tela nas larguras em que o texto visual é ocultado. Foco do Hub e Escape respeitam diálogos/campos editáveis.

## MOBILE

Experiências compartilham Chat/Call mobile. Games usa toda a área do palco sem painel compacto de YouTube. Testes existentes cobrem 320, 360, 375, 390, 412 e 430 px; screenshots GX3 específicos em 320/390/1440 px.

## POSTGRESQL

GX3 não cria migration nem altera o esquema. O runtime Prisma usa o `saveMedia` existente para a pausa. Teste novo com PostgreSQL descartável não executado porque Docker Desktop Linux Engine estava indisponível; nenhum banco de produção foi acessado. Os testes PostgreSQL existentes ficaram skipped pela mesma falta de banco de teste.

## TESTS

`typecheck`, `lint`, `build` e `npm test` foram executados na versão final. Testes de domínio cobrem parsing de rotas, identidade/idempotência por socket, handoff, pausa CAS e marker stale. `npm test`: servidor 136 aprovados, 6 skipped (PostgreSQL sem Docker), web 35 aprovados, Service Worker 4 aprovados; 175 aprovados, 0 falhas e 6 skipped no total. `git diff --check` passou.

## E2E

Baseline: 15/15. GX3 adiciona cenário de duas abas, playback com um/zero viewers, resume manual, Queue/History preservados, Back/Forward, refresh e screenshots. A primeira execução completa após GX3 teve 13/16: dois testes antigos ainda exigiam elementos/foco da UI anterior, e M1 ultrapassou o timeout de entrada sob carga. Atualizei os seletores, preservei foco de teclado na navegação de mídia e ampliei apenas a espera de bootstrap do M1; os três cenários passaram isoladamente. A segunda execução completa passou **16/16** em 6,0 min. Nenhum teste foi suprimido.

## VISUAL_QA

Screenshots geradas pelo E2E em `artifacts/gx3/` (Media/Games em 320, 390 e 1440 px). Inspecionei `games-320.png`, `media-390.png`, `games-1440.png` e `media-1440.png`: navegação e Chat cabem em 320/390 px, o Game Hub possui palco próprio e o player só aparece na experiência Media. Os assets de fixture brancos não representam o visual real do YouTube/Drive. Não substitui Android/iOS reais.

## G4_INTERMITTENT_STATUS

O cenário G4 passou no baseline e na execução final (49,9 s). Nenhuma lógica de Quiz foi alterada.

## FILES_CHANGED

Código: `App.tsx`, `HousesHome.tsx`, `MediaHub.tsx`, `PartyStages.tsx`, `MainStage.tsx` (removido), `MediaProvider.ts`, `experienceRoute.ts`, `mediaViewerRegistry.ts`, `store.ts`, `index.ts`, contrato `packages/shared`, CSS e comentários de shell. Testes: novas unidades de rota/registry e E2E GX3; assertions GX2/G0/mobile atualizadas para o contrato novo. Docs: `ENTRY_FLOW.md`, `AGENT.MD`, `CLAUDE.MD`, este relatório.

## MIGRATIONS

Nenhuma.

## KNOWN_LIMITATIONS

Viewer registry é em memória e pressupõe a instância única do servidor atual; horizontalização futura requer coordenação distribuída. Pausa automática não é rollback transacional se a persistência falhar; a falha é registrada sem expor segredo. Não houve ensaio com Google Drive real, OAuth hospedado, TURN WAN ou banco PostgreSQL descartável nesta etapa.

## MANUAL_QA_REQUIRED

Validar em Android/iOS/PWA instalados: refresh/deep link, autorização de autoplay YouTube, Drive com arquivo próprio, teclado mobile, fullscreen paisagem, chamada com STUN/TURN WAN, share com e sem permissão e navegação entre Casas. Validar deploy preview em Vercel/Render antes de produção. Sem automação de deploy nesta etapa.

## GX4_READINESS

Arquiteturalmente GX4 pode consumir as duas rotas e o shell comum sem recriar Party/Call. Os gates locais passaram; QA humano em dispositivos reais continua recomendado antes de release público.

## Respostas obrigatórias (1–100)

1. Rotas finais: `/house/:houseId/media` e `/house/:houseId/games`.
2. Legacy: substituição local por `/media` com `replaceState`.
3. Experience: local por aba.
4. Presence: não ganhou campo de experience.
5. Banco: experience não foi persistida.
6. Migration: nenhuma.
7. `initialExperience`: destino visual inicial.
8. Permanência: não é permanente; pode trocar.
9. Troca: navegação explícita no header, Home ou botão Voltar à mídia.
10. Party shell: não é recriado pela troca.
11. Party socket: não é recriado.
12. `room:leave`: não é emitido por troca.
13. `room:join`: não é emitido por troca.
14. `voice:leave`: não é emitido por troca.
15. `voice:join`: não é emitido por troca.
16. Peer: não é recriado por troca.
17. Mic: não é recapturado por troca.
18. Share: não é recapturado por troca.
19. Mute: preservado.
20. Deafen: preservado.
21. Dispositivo selecionado: preservado.
22. Draft do Chat: preservado.
23. `inParty`: permanece verdadeiro até a saída real.
24. Screen Share: continua no shell e acessível nos dois stages.
25. MainStage: removido e dividido em stages específicos.
26. MediaExperience: `MediaExperienceStage` + `MediaStage`.
27. GamesExperience: `GamesExperienceStage` + `GameHub`.
28. UniversalPlayer em Games: não.
29. Iframe YouTube oculto em Games: não.
30. Vídeo Drive oculto em Games: não.
31. Provider Media destruído ao sair: sim.
32. Provider recriado ao voltar: sim.
33. Ressync: snapshot/media:sync autoritativos alimentam novo provider.
34. Providers locais simultâneos: no máximo um.
35. Viewer Media: socket autenticado, ingressado na Room, cuja aba está em `/media`.
36. Identidade do viewer: socket ID, não userId.
37. Duas abas do mesmo usuário: dois viewers se ambas estão em Media.
38. Enter idempotente: Set por socket ID.
39. Leave idempotente: remoção só se presente.
40. Disconnect: limpa viewer.
41. Revogação: limpa explicitamente e desconecta.
42. Logout: desconecta sockets revogados e limpa viewer.
43. Viewer persistido: não.
44. Viewer na Presence: não.
45. Um viewer restante: playback continua.
46. Zero viewers: pausa autoritativa após 1,5 s se ainda aplicável.
47. Grace: 1,5 s.
48. Timer stale: identidade do timer + cancelamento no enter + CAS de mídia.
49. Handoff A→B: B cancela timer antes da pausa.
50. Revisão stale: `pauseIfCurrent` rejeita revisão/ocorrência diferente.
51. Zero-viewer limpa Queue: não.
52. Zero-viewer limpa currentMedia: não.
53. Zero-viewer muda autoplay: não.
54. Zero-viewer cria History: não.
55. Já pausada: nenhum bump adicional.
56. Corrida com ended: estado/revisão/ocorrência revalidados; avanço com zero viewers recusado.
57. Back preserva shell: sim, com mesmo House ID.
58. Forward preserva shell: sim.
59. Refresh `/media`: sim, ingressa novamente após bootstrap.
60. Refresh `/games`: sim, sem montar MediaStage.
61. Deep link `/media`: sim, sujeito a auth/membership.
62. Deep link `/games`: sim, sujeito a auth/membership.
63. Não membro: bloqueado por bootstrap/House e validação Socket.IO.
64. House X→Y: encerra recursos da antiga e ingressa na nova.
65. Media→Games envia `game:leave`: não.
66. Games→Media envia `game:join`: não.
67. Participação em jogo: continua voluntária.
68. Segredo Draw: projeção privada inalterada.
69. Estado privado Quiz: projeção privada inalterada.
70. Mão Cards: projeção privada inalterada.
71. Jogo ativo enquanto jogador vê Media: continua server-side.
72. Timer Game: continua server-side.
73. Volta a Games: `inspect` traz projeção atual.
74. Chat: um único serviço/estado no shell.
75. Call controls: os mesmos do shell, sem duplicação por experience.
76. Presence: nenhuma semântica nova de visualização.
77. Share em Games: sim, stage tem seletor próprio de tela.
78. PWA/direct reload: rewrite versionado existente e reload E2E local.
79. Vercel: nenhuma alteração versionada necessária.
80. Service Worker: nenhuma alteração necessária.
81. PostgreSQL: não retestado; Docker daemon indisponível.
82. M3.1: testes não-PostgreSQL passam; persistência real não retestada.
83. Queue V2: regressões existentes e cenário GX3 passaram.
84. Social Library: regressões existentes passaram.
85. Call V4/GX2: regressões de peer/track/socket passaram.
86. S1/S2: regressões existentes passaram.
87. G0–G6: testes existentes preservados e atualizados apenas onde GX3 mudou o contrato do player.
88. G4: baseline e execução final passaram.
89. Typecheck: passou.
90. Lint: passou.
91. Build: passou.
92. `npm test`: passou.
93. Testes pass/fail/skip: 175/0/6; os skipped exigem PostgreSQL de teste.
94. E2E: 16 passaram, 0 falhas na execução final.
95. Cenários E2E: 16 previstos e 16 aprovados.
96. Larguras mobile abertas: 320, 360, 375, 390, 412 e 430 px; GX3 em 320/390.
97. Screenshots inspecionadas: GX3 Games 320/1440 e Media 390/1440 px; as outras duas larguras também foram capturadas.
98. QA humano pendente: Android/iOS/PWA, Google Drive real, YouTube real, STUN/TURN WAN, OAuth hospedado.
99. Decisão GX1 alterada: não; GX3 implementa separação e política de viewer previstas.
100. GX4 pode começar sem refazer Party: sim nos gates locais; revisão humana de dispositivos reais ainda é recomendada antes de release público.

## FINAL_VERDICT

GX3 READY TO FREEZE — GX4 READY
