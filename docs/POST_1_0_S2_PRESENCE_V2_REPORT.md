# PÓS-1.0 — S2 Presence V2

Data: 29/09/2026. Base: `6842d72`. Escopo: single-instance, sem deploy, commit, push ou operação no banco de produção.

## STATUS

Implementação local de Presence V2 concluída. Typecheck, lint, build, testes, E2E e `git diff --check` aprovados; números exatos abaixo. Não equivale a homologação de dispositivos físicos, WAN ou múltiplas instâncias.

## BASELINE

Working tree limpo antes de S2. S1 já estava no HEAD. S1 reportou 154 testes aprovados, seis pulados condicionalmente por PostgreSQL, 11 E2E aprovados. Li AGENT, CLAUDE, Entry Flow, Social Architecture, Call V4, relatórios S1/G6, código de store/socket/UI e schema/migrations antes de editar. Capturas S1 locais serviram como referência visual anterior; os screenshots S2 foram gerados e abertos após as mudanças.

## AUDIT / S1_INTEGRATION

S1 usa `SocialStore` por Casa, `home:update` de resumos no socket Home autenticado e `house:update` de detalhes só para membros. Bootstrap/GET dão snapshot; Home não envia `room:join`, Call nem captura mídia. `HouseSummary` contém `onlineCount`, `partyCount`, `memberPreview` limitado a três e `partyActivity` coletivo. S2 não criou uma segunda Party, outro socket ou novo cálculo de atividade: amadureceu a origem de presença e fez o painel de membros consumir o `house:update` que já existia.

## OLD_PRESENCE_MODEL / PRESENCE_V2_MODEL

Antes: `ONLINE`/`IDLE`/`OFFLINE` vinham da agregação `activeUserSockets` por userId (não necessariamente foreground); `inParty` vinha de `roomConnections` e de flags no membro. Havia dois timers de cinco segundos. Porém `SocialStore.setPresenceForUser` e `setPresence` escreviam `lastSeenAt` em memória a cada atualização, inclusive join, fala/Call e IDLE. A Home exibia resumo realtime mas o painel aberto ficava no resultado HTTP inicial. Um vínculo criado enquanto a conta já estava online podia aparecer offline até a próxima conexão.

Depois: dimensões ortogonais continuam `online = presence !== OFFLINE` e `inParty`. `IDLE` é compatibilidade da atividade já existente e é mostrado simplesmente como “Online”; S2 não acrescentou rastreamento AFK. `lastSeenAt` só muda no trânsito efetivo para `OFFLINE`. Membros da Casa são renderizados em grupos estáveis: Party, online, offline, com ordem de ingresso/ID como desempate. Nenhuma atividade coletiva é atribuída à pessoa.

## ONLINE_SEMANTICS / PARTY_PRESENCE / OFFLINE_SEMANTICS

Online = ao menos um socket autenticado válido da identidade no backend, incluindo grace de saída ainda não vencido. Não significa disponível, atento ou em foreground. Na Party = ao menos uma conexão autenticada dessa identidade ingressou na Party daquela Casa e ainda não saiu/expirou após grace. Uma pessoa em duas abas da Party conta uma vez. Offline = nenhuma conexão válida restante depois da tolerância; logout explícito da última sessão força convergência sem esperar cinco segundos. Quem fecha uma aba mas mantém outra online não cai para offline.

## LAST_SEEN / DATABASE

`GroupMember.lastSeenAt` já existia (`20260925120312_member_last_seen`); `User.lastSeenAt` também existe. Nenhuma migration, `db push`, reset ou alteração em produção. Em memória, cada vínculo da conta recebe o mesmo instante ao efetivamente ficar offline; o adapter PostgreSQL já persiste User + GroupMember em uma transação no último disconnect. Criação de vínculo inicia com timestamp de ingresso, não prova uma visita anterior. Reconnect, mudança de House/Party, speaking, Call e heartbeat não escrevem último acesso. Cleanup da Party após o offline não o sobrescreve. Uma sessão normal gera **zero writes de presença durante atividade**; quando a última conexão expira, há uma transação com atualização de User e `updateMany` de GroupMember (e no logout final a mesma persistência). Outros fluxos de Casa têm suas próprias gravações. Last seen é exibido apenas em detalhes autorizados da Casa, com rótulos humanos; nunca em endpoint público.

## MULTI_TAB / MULTI_DEVICE / CONNECTION_REGISTRY

`activeUserSockets: Map<userId, Set<socketId>>` e `roomConnections: Map<roomId, Map<userId, Set<socketId>>>` permanecem no processo. Dois dispositivos se comportam como duas conexões da mesma identidade; não se coleta dispositivo nem se expõe socketId. Fechar uma de duas abas não reduz `onlineCount` nem `partyCount` quando a outra ainda sustenta a Party. `RoomStore` também mantém membros por identidade lógica; snapshots e contagens não duplicam sockets.

## GRACE_PERIOD / RECONNECT / ORDERING / STALE_PROTECTION

Conservados os cinco segundos já utilizados antes de S2 para conta e Party, a fim de preservar o comportamento de refresh/reconnect, sem inventar timeout novo. O retorno cancela o timer anterior; cada callback confere que continua sendo o timer atual e que não surgiu conexão nova. Reconnect antes de cinco segundos mantém online/Party sem piscar; depois da expiração há nova transição online e `lastSeenAt` permanece o momento da saída anterior. Perda prolongada em mobile depende do liveness/ping-pong interno do Socket.IO, não de heartbeat customizado S2. Restart limpa o registry efêmero; clientes reconstroem por conexão/join e o banco não é tomado como fonte de online.

## LOGOUT / CLEANUP / MEMBERSHIP_CHANGES

Logout HTTP revoga o token e desconecta apenas os sockets dessa sessão. Se outro token/dispositivo permanece, a conta continua online. Se era a última sessão, cancela timers pendentes, marca offline/persiste last seen e limpa a Party imediatamente quando não há outra conexão dela. Saída normal da Party não faz logout nem altera membership. Remoção/exclusão continuam revogando acesso e limpando room/Call/share/grace; o fanout de Home/detalhes revalida membership em cada socket. Timer de Party vencido confere membership antes de emitir, para não reviver Casa removida.

## HOUSE_PROJECTION / MULTI_HOUSE / MEMBER_PREVIEW / HOUSE_DETAIL / SORTING

Todos os resumos, detalhes e eventos são filtrados pelas Casas do usuário; não há lista global. Criar ou aceitar uma Casa com socket já conectado agora marca o novo vínculo online imediatamente. O preview S1 continua limitado a três e ordenado Party > online > outros; `+N` usa total real. O painel “Casa e membros” carrega via GET, acompanha `house:update` no mesmo socket Home e refaz snapshot após reconnect; resposta HTTP antiga não sobrescreve update mais novo recebido. A lista usa “Na Party”, “Online” ou “Visto recentemente/há minutos/horas/ontem/dias”. Roles são independentes. Em 320–430 px, controles administrativos quebram linha de modo consistente e status permanece legível, inclusive nome longo.

## REALTIME / SOCKET_ARCHITECTURE / SNAPSHOT / DELTAS

Snapshot Home: `/api/bootstrap` ou `/api/houses` + `home:update` autenticado no connect; detalhe da Casa: GET ao abrir. Atualizações: `home:update` e `house:update` existentes, sem nova subscription ou socket. Optamos por snapshot/detalhes em vez de deltas por membro porque Casas são pequenas e o protocolo já os fornece. O servidor só emite mudanças de status da conta quando a dimensão mudou; Home deduplica `house:update` ignorando campos de Call/speaking que seu painel não apresenta, além da deduplicação existente de resumos. O socket Home não entra na Party nem na Call. Não foi criado contador paralelo de revisão de presença; timers com identidade + snapshot autoritativo de reconnect protegem a ordenação. GET em reconnect recupera eventual lacuna do painel.

## PRIVACY / SECURITY / DATA_MINIMIZATION

`home:update` carrega só resumos das Casas próprias; preview contém id público, nome, avatar/cor, status de conexão e `inParty`. `house:update` é o contrato de detalhes da Casa já existente, entregue apenas a membros e com perfil público (`publicUser`); inclui roles, lastSeen e informações administrativas conforme permissão, nunca token bruto de convite. Nenhum payload de presença novo contém e-mail, subject Google, OAuth scopes/tokens, Drive grants/tickets/URLs privadas, IP, localização, user agent, device, sessionId, socketId, segredo de jogo, mão ou deck. Tentativa de ler Casa de terceiro retorna 404 e join alheio é negado. O Home não converte Game/Media/Call em presença individual; House Activity S1 continua resumo coletivo isolado.

## PERFORMANCE / ACCESSIBILITY / MOBILE

Sem polling de presença nem heartbeat customizado. Home mantém o refresh de metadados de 20 segundos herdado de S1 como fallback, não `fetchPresence` por segundo. Last seen é formatado no render com granularidade de minutos ou maior; sem tick de socket ou biblioteca nova. `home:update` deduplica serialização; o painel só recebe estado React quando os campos sociais relevantes mudam, evitando rerender por speaking. Rótulo textual acompanha cor e é legível por screen reader, sem `aria-live` repetitivo. Lista estável evita salto por eventos de Call. QA visual aberto em 320, 390, 430 e 1440 px; desktop e mobile mantêm identidade Lumio sem “painel Discord”. Sem teste físico de leitor de tela.

## PARTY_REGRESSION / GAMES_REGRESSION / CALL_REGRESSION / MEDIA_REGRESSION

Party mantém snapshot/membership por identidade. Draw, Quiz e Cards não foram alterados; Home recebe só a House Activity coletiva. Call/WebRTC/voice registry, mic e tela não foram modificados; mudanças de speaking não determinam online. Player, sync, YouTube, Drive e fila não foram modificados. O E2E existente cobre entrada, chat, navegação, games e mídia local; Google/Drive/RTC físico continuam requerendo homologação manual.

## TESTS / MULTI_CLIENT / E2E / VISUAL_QA

Resultado dos gates finais: **156 testes aprovados, zero falhos, seis pulados** (servidor 121/0/6, web 31/0/0, service worker 4/0/0); **11/11 E2E completos** e E2E focal de Casas repetido após os últimos ajustes. Typecheck, lint, build e `git diff --check` passaram. Integração Socket.IO com A/B/C em X e A/D em Y cobre isolamento, GET negado, dois sockets do mesmo usuário na Party (contagem única), fechamento de uma aba, reconnect curto com timer antigo, offline real/lastSeen, criação e convite enquanto online, remoção, exclusão e logout imediato da última sessão. Teste UI Home/House em Chromium com três contextos e segunda aba valida rótulos, contagem e que Home não entra na Party/captura. Testes locais usam e-mail/contas sintéticas e banco file efêmero; seis cenários PostgreSQL são condicionais.

Capturas S2 geradas em `artifacts/s2/` (ignoradas no Git) e abertas/inspecionadas: `s2-home-desktop.png`, `s2-home-320.png`, `s2-home-390.png`, `s2-home-430.png`, `s2-house-members-desktop.png`, `s2-house-members-320.png`, `s2-house-members-390.png`, `s2-house-members-430.png`, `s2-mixed-presence.png`, `s2-online-members.png`, `s2-offline-members.png`, `s2-long-names.png`. Baseline visual veio das capturas S1 já existentes. A inspeção encontrou controle de remoção isolado em 430 px e status offline baixo contraste; ambos foram corrigidos e screenshots afetados regenerados/abertos. O fixture local `scripts/draw-game-qa.cjs --presence` acrescenta um membro offline com nome longo somente em QA efêmero, nunca em produção.

## KNOWN_LIMITATIONS / MANUAL_REQUIRED

Registro de presença é process-local; não suporta múltiplas réplicas sem coordenação externa. Uma aba mobile suspensa só é declarada offline após detecção do transporte e grace. `IDLE` herdado da Party continua internamente, mas a UI S2 não afirma AFK. Contagens podem convergir por eventos separados conta/Party na fronteira do grace; o estado final é autoritativo. QA real pendente: Android Chrome, iOS Safari/PWA, background/foreground, bloqueio de aparelho, troca Wi-Fi/dados, 2–8 amigos, WAN/TURN, leitores de tela, várias Casas e remoção de membro durante Party. Não publicar nem executar migration para S2.

## FILES_CHANGED

`apps/server/src/{index.ts,socialStore.ts,socialStore.test.ts,houseActivity.integration.test.ts}`; `apps/web/src/{App.tsx,presence.ts,security.test.tsx,styles.css,components/HousesHome.tsx,components/SocialDialogs.tsx}`; `e2e/party.spec.ts`; `scripts/draw-game-qa.cjs`; `.gitignore`; `docs/AGENT.MD`; `docs/SOCIAL_ARCHITECTURE.md`; este relatório. Sem mudanças em Prisma, Auth/OAuth, regras de jogos, Call ou Media.

## RESPOSTAS OBRIGATÓRIAS

1. Antes, “online” era `presence != OFFLINE`, mantido por sockets agregados; o `lastSeenAt` era alterado indevidamente em transições não-offline.
2. Depois, online significa ao menos um socket autenticado válido ou grace ainda vigente; nunca atenção/disponibilidade.
3. “Na Party” significa presença válida da identidade na Party da Casa.
4. São dimensões ortogonais: online e `inParty`.
5. Offline significa nenhuma conexão válida depois do grace, ou logout final explícito.
6. Grace de conta e Party: cinco segundos.
7. Valor preservado da infraestrutura S1, que já amortecia refresh/reconnect.
8. Refresh desconecta/reconecta dentro do grace sem offline visual.
9. Reconnect curto cancela timer antigo e conserva estado.
10. Reconnect tardio volta online a partir de novo socket; last seen registra a saída anterior.
11. Abas são `Set<socketId>` por userId, com contagem por pessoa.
12. Dispositivos usam o mesmo agregado por userId, sem perfil de dispositivo.
13. Sim, fechar uma de duas abas mantém online.
14. Duas abas da mesma Party contam uma pessoa.
15. Callback confere identidade do timer atual e ausência de conexão nova; reconnect cancela timer.
16. Last seen muda no trânsito efetivo a offline; logout final antecipa.
17. Campo exibido é por membership de Casa, mas recebe a transição global da conta; há também campo User.
18. Zero writes durante atividade; no último offline, uma transação com update User + updateMany GroupMember.
19. Não há heartbeat customizado S2.
20. Não aplicável: Socket.IO já detecta liveness.
21. O socket autenticado existente transporta `home:update`/`house:update`; Party usa o mesmo servidor Socket.IO.
22. Não foi criado socket novo.
23. Home não entra na Party.
24. Home não entra na Call.
25. Não coleta device info.
26. Não coleta IP/localização para presença.
27. Presença individual não mostra Game.
28. Game session coletiva não prova participação/visão individual.
29. Sim, `partyActivity` S1 é separado.
30. Bootstrap/GET + `home:update` no connect; detalhes por GET ao abrir.
31. Sem delta novo: snapshots pequenos pelos eventos existentes, deduplicados.
32. Não há revision nova; timer identity, cancellation e snapshot de reconnect protegem stale.
33. Remoção revoga Party e membership; fanout filtra em cada envio e GET nega.
34. Cada Casa é projetada somente para seus membros; usuário multi-House recebe cada resumo próprio.
35. Preview: id/nome/avatar/cor/status/inParty; detalhe autorizado: perfil público, role, lastSeen e demais campos já permitidos.
36. Proibidos e-mails de terceiros, socketId, IP/device, OAuth/Drive tokens, tickets/URLs privadas e segredos de jogo.
37. Não houve migration.
38. Não houve mudança de Auth/OAuth (somente cleanup no endpoint de logout já existente).
39. Não houve mudança nos runtimes/regras Games.
40. Não houve mudança em WebRTC/Call.
41. Testes: 156 aprovados, zero falhos, seis PostgreSQL condicionais pulados.
42. E2E: 11/11 completos; cenário focal Casas repetido após ajustes finais.
43. Capturas abertas: lista exata em VISUAL_QA.
44. Homologação física/multiplayer real/WAN/TURN/acessibilidade humana continua manual.

### Checklist manual curto

- Desktop: duas abas, refresh/reconnect, fechar uma/última, logout, duas Casas e remoção de membro durante Party.
- Mobile: Android Chrome e iOS Safari/PWA, background/bloqueio/retorno, alternância Wi-Fi/dados e suspensão longa.
- Multiplayer: 2–8 amigos, entradas/saídas, Party/Games/Call/Media sem atribuir atividade coletiva a indivíduo.
