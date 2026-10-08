# LUMIO 2.0 — SYNC1 Authoritative Playback Final Report

Data da execução: 2026-10-08 (America/Sao_Paulo)

## 1. STATUS

SYNC1 LOCAL PASS — REAL PROVIDER/WAN VALIDATION PENDING — READY FOR SOCALL1. Alterações limitadas ao protocolo de playback e reconciliação do snapshot. Sem causa demonstrada para a ocorrência histórica M1.

## 2. PRODUCT_SCOPE

Somente autoridade e consistência do playback. Sem mudança de UI, Home, Chat, Call, OAuth, providers, schema ou Queue V2.

## 3. FROZEN_CONTRACTS

FF3.1 e UX aprovados preservados. Política LX0/GX3 de Media viewers e pausa com grace de 1.5 s preservada. Queue occurrence ID, CAS de fila e `queue:advance(expectedMediaId, expectedQueueItemId)` preservados.

## 4. MEDIA2_BASELINE

MEDIA2 documenta local pass e providers reais/PostgreSQL hospedado UNVERIFIED. Operações `operationId` em batch de Queue têm cache de processo; não foi ampliado esse contrato.

## 5. WORKTREE

Worktree limpo no início (`git status --short`, `git diff`, `git diff --stat` sem saída). Sem alterações do usuário preexistentes. Sem commit, push, deploy ou operações em banco.

## 6. FILES_READ

Lidos `docs/AGENT.MD`, `docs/CLAUDE.MD`, `docs/MEDIA_HUB.md`, relatórios M1/M2/M3, GX3, LX0, FF3.1, UX1, MEDIA1 e MEDIA2; código de `RoomStore`, `MediaViewerRegistry`, Socket.IO, `MediaController`, `MediaProvider`, `MediaStage`, `App`, schemas compartilhados, testes e harness E2E. Código atual prevaleceu sobre histórico.

## 7. PRE_CHANGE_TESTS

`typecheck`, `lint`, `build`, `npm test` e `git diff --check`: PASS. `npm test`: servidor 92 PASS/6 SKIP, web 39 PASS, SW 4 PASS. E2E baseline: 16/17; M1 passou. GX2 falhou uma vez: dois eventos `room:leave` capturados contra um esperado; execução isolada subsequente passou. Uma tentativa isolada posterior teve erro ENOENT ao fechar/capturar artefatos Playwright. Sem retry automático configurado (`retries: 0`). Duração do E2E baseline: 248.7 s. Runner sem crash reportado.

## 8. ARCHITECTURE_INVENTORY

Fluxo observado: browser autentica Socket.IO → ingressa em `room:join` → recebe `room:snapshot` → App aceita somente versões atuais → `MediaStage` envia intenção semântica → Socket.IO valida membership/permissão e `RoomStore` altera estado/revisão → servidor emite `media:sync` e salva snapshot de mídia/fila quando aplicável → cada `MediaController` reconcilia adapter local. `MediaViewerRegistry` registra socket/aba e arma pausa somente se nenhuma aba Media permanecer após 1.5 s. Fila conserva ocorrências distintas; adapter fornece apresentação local.

## 9. AUTHORITATIVE_STATE

`RoomStore.currentMedia` é autoritativo no processo. Backend único; estado realtime e presença são efêmeros. PostgreSQL salva fila/configuração/histórico e mídia persistente via repository, mas playback ativo é reinicializado no boot.

## 10. STATE_MODEL

`MediaState`: `mediaId`, provider, tipo, título, estado, posição, duração, playbackRate, `startedAt`, `updatedAt`, `controlledBy`, `revision`. Queue usa `QueueItem.id` como ocorrência e `queueRevision` para estrutura. `operationId` é UUID/string por comando de cliente; não é armazenado em tabela/cache do protocolo de playback. Servidor calcula posição efetiva e rebaseia `startedAt` no snapshot.

## 11. INVARIANTS

| ID | Resultado | Evidência / limite |
|---|---|---|
| SYNC-INV-01 | PASS local | Uma `RoomRecord.currentMedia` por Party. |
| SYNC-INV-02 | PASS local | Mutação síncrona no processo; CAS de revisão rejeita intenção antiga. Multi-instância não faz parte da infraestrutura. |
| SYNC-INV-03 | PASS, escopo da sessão | Incremento monotônico; reinício reseta playback efêmero e a reconexão agora aceita snapshot novo. |
| SYNC-INV-04 | PASS | Revisão exata rejeita obsoleto/futuro; clientes filtram revisão antiga. |
| SYNC-INV-05 | PASS local | Igual revisão playing não aceita posição regressiva; maior revisão vence. |
| SYNC-INV-06 | PASS | `mediaId` não substitui `QueueItem.id`; avanço verifica ambos. |
| SYNC-INV-07 | PASS local | Play/Pause usa posição calculada no servidor; teste cobre cliente atrasado. |
| SYNC-INV-08 | PASS local | Seek é comando explícito com posição e CAS; provider sincroniza snapshots. Distribuição de drift não medida. |
| SYNC-INV-09 | PASS local | Providers cancelam gerações/tickets obsoletos; testes de troca e ended tardio. |
| SYNC-INV-10 | PASS local | Snapshot no reconnect e resync do player; reset de revisão testado após restart. Restart de processo integrado não executado. |
| SYNC-INV-11 | PASS local | M1/M3 E2E exercitam late join (resultados finais na seção E2E). |
| SYNC-INV-12 | PASS local | Volume/mute não estão em `MediaState`; controle fica no player local. |
| SYNC-INV-13 | PASS local | `queue:advance` compara mídia/ocorrência e impede avanço duplicado. |
| SYNC-INV-14 | PASS local | Viewer socket/aba, idempotência e CAS cobertos por testes GX3. |
| SYNC-INV-15 | PASS local | Viewer identity por socket; GX3 testa duas abas. Não se implementa liderança de playback entre abas. |
| SYNC-INV-16 | PARTIAL | Validação/CAS ocorre antes da mutação; falha tardia de persistência pode deixar estado em memória alterado. Não foi reproduzida com DB disponível. |
| SYNC-INV-17 | PARTIAL | Retry com mesma revisão é rejeitado; playback `operationId` não tem deduplicação explícita/durável. Reconnect orienta por snapshot, sem replay automático. |
| SYNC-INV-18 | PASS local | Duração 0 continua desconhecida; posição não é clampada ficticiamente. |
| SYNC-INV-19 | PASS local | Autoplay bloqueado é estado local e não altera estado de servidor. |
| SYNC-INV-20 | UNVERIFIED WAN | Convergência local exercitada; sem providers reais, WAN ou medição distribuída sustentada. |

## 12. EVENT_ORDERING

Eventos são emitidos após mutação no backend de processo único. Clients filtram revision. Testes cobrem stale queue, media e ended; pacote/reordenação WAN não foi simulado.

## 13. REVISION

`RoomStore.updateMedia` agora aceita apenas `revision === currentMedia.revision`, rejeitando tanto revision antiga quanto futura. Cada comando aceito incrementa revision. Cliente ignora revision inferior; evento com mesma revision só pode avançar posição playing para frente.

## 14. OPERATION_ID

`operationId` obrigatório no schema de comandos não era usado pelo Store. CAS pela revisão impede reexecução do mesmo comando depois do primeiro incremento, enquanto ambos observam a mesma revisão. Não há dedupe persistente por operationId; impossibilidade de ACK é resolvida com snapshot, sem retry cego. Limite Queue batch da MEDIA2 permanece registrado e fora de correção.

## 15. CONCURRENT_COMMANDS

Teste unitário confirma que comando com revision futura não altera o Store e que comando com revisão já consumida é rejeitado. Mesma revisão concorrente implica primeira mutação síncrona aceita e posteriores stale rejeitadas. Play/Pause/Seek concorrentes através de 5/10 usuários e ordem sob rede simulada: UNVERIFIED.

## 16. PLAY_PAUSE

Correção: comandos Socket.IO Play/Pause/Rate ignoram a posição observada pelo adapter local e mantêm a posição efetiva calculada no servidor; somente Seek pode escolher posição. Reproduz regressão com seek autoritativo em 30 s e participante informando localmente 0. Teste vermelho confirmou retorno incorreto; após correção passa.

## 17. SEEK

Seek usa posição finita validada por Zod, não negativa, clampada apenas quando duração conhecida. Provider Drive valida `Number.isFinite`; YouTube passa valor não negativo. Seek próximo do fim/concorrente e duração desconhecida têm cobertura unitária limitada; WAN UNVERIFIED.

## 18. AUTHORITATIVE_POSITION

`getEffectiveMedia` calcula `position + max(0, Date.now()-startedAt)/1000*playbackRate` quando playing, clamp apenas para duração positiva, e retorna `startedAt` rebaseado ao snapshot. Paused mantém posição base. Relógio é do servidor; não se usa relógio do cliente como verdade do backend.

## 19. DRIFT

Adapters corrigem drift acima de 2.5 s em sync normal e 1.25 s em sync forçado. Esses são limiares existentes, não uma garantia medida. Harness não coletou distribuição de drift nem percentis multiuser.

## 20. DRIFT_CORRECTION

Correção ocorre em `sync` por snapshot/comando/resync; sem loop de comandos WebSocket de posição. UI lê o playhead local a cada 500 ms, sem publicar continuamente. Buffering local não pausa todos.

## 21. M1_INTERMITTENCY

M1 localizado em `e2e/party.spec.ts`: três browsers, adapter YouTube sintético e late join; asserção remota exige posição >1 após seek. Código/harness rastreados. M1 passou no baseline da SYNC1; não surgiu trace que atribuísse a ocorrência histórica. Não há prova da geração/ready/autoplay/zero-viewer como causa histórica. A ocorrência permanece NÃO EXPLICADA, não declarada corrigida. Harness M1 usa YouTube fixture, não provider real; latência/reordenação controladas não estão implementadas.

## 22. BACKGROUND_FOREGROUND

App pede `media:request-sync` quando a aba volta a visible. E2E mobile e resync existentes exercitam parte do ciclo; matriz curta/longa, timers suspensos e mídia alterada oculta: UNVERIFIED.

## 23. MULTI_TAB

Cada aba usa socket e viewer identity próprios; volume/mute são locais. GX3 E2E exercita duas abas e viewer handoff. Três abas com reconnect simultâneo: UNVERIFIED.

## 24. MEDIA_VIEWER_REGISTRY

Map Party→Set(socketId), enter/leave idempotentes, remoção no disconnect/leave/troca; não colapsa por userId. Inspeção de Socket.IO e testes GX3 confirmam lifecycle principal.

## 25. ZERO_VIEWER_POLICY

Grace 1500 ms intacto. Último viewer sai → marker com mediaId/revision/queue occurrence → callback verifica count=0 e identidade → pausa uma vez. Segundo viewer cancela; marker obsoleto não afeta nova ocorrência. Testes GX3 passam.

## 26. LATE_JOIN

Snapshot traz estado efetivo e rebase do relógio. M1 e M3 cobrem late join sintético; provider real/buffering/duração desconhecida na rede real: UNVERIFIED.

## 27. RECONNECT

Socket reconecta e recebe `room:snapshot`; intents não são reenviadas automaticamente. App aceita snapshot de conexão recuperada mesmo se revisão caiu após reinício. `MediaStage` reseta filtro local de revision no token de resync. Teste unitário valida evento stale recusado e revisão menor aceita somente após reset.

## 28. DISCONNECT_DURING_COMMAND

Fluxo não assume que ausência de ACK significa não execução; cliente não repete comando pendente e atualiza pelo snapshot. Falha real entre emitir comando e ACK não foi injetada.

## 29. SOCKET_IO

Namespaces/rooms e validação atuais preservados. Middleware autentica sessão; handlers exigem Room ingressada, membership e permissão. Um listener por socket no setup existente. Ataques profundos de reconnect storm pertencem à SEC2.

## 30. SNAPSHOTS

Snapshot combina fila e playback do mesmo processo; playback inclui posição efetiva/rebase. `App` mantém revisão mais nova e não permite que snapshot playing na mesma revisão reduza posição. Um reconnect confirmado supera cache local anterior. Sem atomicidade multi-processo alegada.

## 31. STALE_EVENTS

Revision menor/futura rejeitada no servidor para playback; cliente rejeita revision antiga. Mídia/ocorrência protegidas em ended e fila. Testes de YouTube ended antigo, ticket Drive e fila stale existentes passaram na suíte unitária.

## 32. MEDIA_SWITCHING

A→B→C e preservação do iframe/API YouTube em M1 E2E. Drive aborta ticket e metadata/listeners da geração anterior. Callbacks de provider antigo não alteram controller novo segundo testes adapter.

## 33. QUEUE_INTEGRATION

Queue V2 intacta: CAS estrutural, occurrence IDs, remove current, autoplay, `queue:advance` com `expectedMediaId` e `expectedQueueItemId`. Não houve reescrita de Queue.

## 34. ENDED_AUTOPLAY

Store recusa advance repetido para mesmo estado ended; duas ocorrências da mesma mídia se distinguem pelo item ID. E2E M3 cobre três clientes. Duration 0 não fabrica posição final.

## 35. AUTOPLAY_BLOCKED

Browser blocked é evento local. `resumeFromGesture` usa último snapshot; não emite mudança global nem Play loop. Cobertura sintética Drive/YouTube passa; browser real pendente.

## 36. BUFFERING

Buffering é estado local do adapter e UI; não altera estado autoritativo/pausa os demais. M1 exercita buffering sintético. Perda WAN e buffering prolongado de provider real: UNVERIFIED.

## 37. UNKNOWN_DURATION

Server mantém `duration=0` e conserva posição/seek sem clamp fictício. Adapter e late join possuem testes; avanço depende de `ended`, não de timer fabricado.

## 38. VOLUME_MUTE

Não sincronizados no protocolo. App persiste preferência local do player; Call Deafen segue trilha independente. Reconnect não recebe volume do servidor.

## 39. PROVIDER_DIFFERENCES

YouTube usa IFrame API oficial; Drive usa HTMLMediaElement, ticket abortável, metadata readiness e `play()` bloqueável. Não foi utilizado provider real nesta fase.

## 40. DETERMINISTIC_TESTS

Testes unitários usam Store e adapters sintéticos. Nova cobertura de revision, posição local atrasada, snapshots equal revision e reset de revision está determinística. Não foram adicionados timers reais/sleeps para sincronização.

## 41. LATENCY_MATRIX

Baixa/moderada/alta/assimétrica/jitter/perda/reordenação simuladas: SKIPPED — harness atual não oferece rede controlável. Nenhuma declaração de WAN.

## 42. MULTIUSER_MATRIX

2 clientes: testes GX2/GX3/M1/M3 existentes. 3 clientes: M1/M2/M3 E2E. 5 e 10: SKIPPED, sem harness apropriado. Não é benchmark de escala.

## 43. STRESS_RESULTS

Sequência finita de operações sob latência artificial/reconnect storm: SKIPPED. Casos de fila/ended/reconnect existentes são funcionais, não stress de produção.

## 44. UNIT_TESTS

Final: servidor 93 PASS, 0 FAIL, 6 SKIP condicionais; web 41 PASS, 0 FAIL; service worker 4 PASS, 0 FAIL. Duração do `npm test`: 45.3 s. Inclui testes adicionados em Store/MediaProvider.

## 45. INTEGRATION_TESTS

Integração Socket.IO existente passa no conjunto server. PostgreSQL persistência/restart não executado: seis testes condicionais SKIPPED por DB ausente. Não houve alteração de schema/migration.

## 46. E2E

Baseline 16/17: GX2 falha isolada do playback, contagem room:leave 2 vs 1; GX2 isolado passou em repetição posterior. E2E completo final: 17/17 PASS em 3.2 min, sem retries automáticos nem crash. O primeiro E2E pós-código foi 16/17 por crash do worker FF3 People (`3221226505`); FF3 People isolado passou 1/1. Repetições M1: dois cenários completos passaram; o terceiro foi interrompido por crash do worker (`3221226505`), sem falha de assertion. Segunda execução E2E completa passou todos os cenários, incluindo M1 e GX2.

## 47. REAL_PROVIDER_VALIDATION

`YOUTUBE_SYNC_REAL = UNVERIFIED`; `DRIVE_SYNC_REAL = UNVERIFIED`. Fixtures locais não certificam API, conta, autoplay, bytes Drive ou CDN.

## 48. PERSISTENCE

Prisma salva fila/configuração/histórico com CAS `queueRevision`; playback ativo não persiste e reinicia idle. PostgreSQL tests SKIPPED; sem banco de produção/credenciais alterados. Playback `operationId` não é durável.

## 49. SECURITY_PRESERVATION

Sessão, membership, grants, roles, Socket.IO auth, isolamento de House e privacidade Drive não alterados. Logs de debug não adicionados. Nenhuma credencial lida.

## 50. OBSERVABILITY

Sem instrumentação persistente adicionada. Harness registra provider sintético e asserts; nenhum token/cookie/URL privada foi gravado.

## 51. PERFORMANCE

Teste de latência local do servidor observado: Socket.IO action→remote snapshot 3.8/2.1/1.2 ms em n=3 (teste funcional, não medição de playback/WAN). Sem profiling de memória, seek count distribuído ou escala.

## 52. FINDINGS

P2 corrigido: comandos podiam aceitar revisão futura e consumir posição stale enviada pelo provider em Play/Pause/Rate, permitindo rewind pelo browser lento. Cliente também aceitava snapshot/evento com mesma revisão e posição menor. Reconnect após restart poderia reter revisão local maior que novo processo.

UNVERIFIED: causa da intermitência UX1 M1; falha de persistência depois de mutação em memória pode deixar divergência local se DB falhar; operationId de playback não possui dedupe própria; provas WAN/providers reais indisponíveis.

## 53. FIXES

1. `RoomStore.updateMedia` exige revision exata e ignora posição local em ações não-Seek originadas por protocolo. Teste vermelho reproduziu revisão futura aceita/posição resetada; teste verde valida future/retry rejection e posição 30 s conservada.
2. `shouldApplyMedia` evita regressão de posição com mesma revision e mesma mídia. Maior revision ainda permite seek intencional para trás.
3. Em snapshot de reconnect, App substitui cache local independente de revision; `MediaStage` reseta filtro local de revisão quando token de resync muda.

## 54. EVIDENCE_MATRIX

| Evidência | Resultado |
|---|---|
| Store future/retry revision + stale position | RED antes da correção; GREEN depois |
| Equal-revision snapshot monotonicity | PASS |
| Controller reconnect revision reset | PASS |
| `typecheck` | PASS, 19.3 s |
| `lint` | PASS, 17.1 s |
| `build` | PASS, 21.7 s |
| `npm test` | PASS, server 93 + web 41 + SW 4; 6 SKIP PostgreSQL/bootstrap condicionais |
| `test:e2e` baseline | 16/17; uma falha GX2 intermitente fora de playback |
| `test:e2e` pós-código 1 | 16/17; FF3 worker crash `3221226505`; isolado PASS |
| `test:e2e` pós-código 2 | 17/17 PASS, 3.2 min, retries=0 |
| M1 repeat-each=3 | 2 PASS; uma execução interrompida por worker crash `3221226505` |
| `git diff --check` final | PASS |
| YouTube/Drive real, WAN | UNVERIFIED |

## 55. KNOWN_DEBT

- A ocorrência histórica M1 (posição remota 0 uma vez) não foi reproduzida causalmente.
- Operações playback usam CAS revision, não dedupe explícita por operationId.
- Mutação em memória antes de persistência DB bem-sucedida pode precisar rollback/transação em memória; sem PostgreSQL local para reproduzir.
- Operações `operationId` de batch Queue voláteis conforme MEDIA2.
- Sem matriz de latência controlada, 5/10 clientes, providers reais ou WAN.
- E2E baseline GX2 teve falha intermitente de `room:leave` e erro Playwright de cópia de artefatos em uma execução isolada.

## 56. FINAL_GATES

Baseline: typecheck/lint/build/test/diff-check PASS; E2E 16/17. Final: typecheck/lint/build/test/diff-check PASS; E2E 17/17 PASS em execução completa final. Uma execução completa imediatamente anterior teve 16/17 por crash do worker FF3; cenário isolado passou. M1 repetido: 2 execuções PASS e uma interrompida por crash do worker. `retries: 0`.

## 57. DIFF_REVIEW

Alterados código do Store/backend, helper de reconciliação, App, MediaStage e testes correspondentes. Sem alteração visual, Queue contracts, schema, migration, provider, OAuth, produção, commit ou push. Rever `git status --short` final para separar outputs de screenshot gerados pela suíte.

## 58. FINAL_VERDICT

`SYNC1 LOCAL PASS — REAL PROVIDER/WAN VALIDATION PENDING — READY FOR SOCALL1`. Gate E2E final passou 17/17. Uma execução anterior registrou crash de worker Windows; repetição completa e cenário isolado passaram. Não se afirma que a intermitência M1 histórica foi explicada ou corrigida. Providers reais, PostgreSQL de teste e WAN permanecem UNVERIFIED.

