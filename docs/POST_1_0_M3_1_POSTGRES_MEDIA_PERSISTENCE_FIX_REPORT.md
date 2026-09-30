# M3.1 — PostgreSQL Media Persistence Investigation & CI Hotfix

## STATUS

Correção isolada do teste de persistência PostgreSQL pós-M3.1, sem mudança de runtime, schema, GX1 ou produção. Revisão humana pendente; sem commit/push/deploy. O `POST_1_0_GX1_PARTY_ARCHITECTURE_DESIGN_BIBLE.md` preexistente foi preservado sem edição.

## ORIGINAL_CI_FAILURE

O CI informou `2 !== 1` em `apps/server/src/prismaMediaRepository.integration.test.ts:45` no teste “PostgreSQL queue, library, favorites, playlist, history and progress survive restart”. O erro era **`snapshot.queueRevision`**, não `queue.length`, favoritos ou histórico. A execução local reproduziu a mesma falha com PostgreSQL 16-alpine descartável e todas as quatro migrations versionadas aplicadas.

## REPRODUCTION

1. Working tree inicial: só o Design Bible GX1 não rastreado, pertencente à etapa anterior; nenhum diff funcional existente.
2. Docker Desktop local iniciado; contêiner descartável `lumio-m31-ci-postgres`, PostgreSQL 16-alpine, banco isolado `lumio_test` em porta local separada. Não foi usado banco de desenvolvimento persistente, hospedado ou de produção.
3. `prisma migrate deploy` aplicou as quatro migrations de `apps/server/prisma/migrations` nesse banco vazio.
4. O teste original, **sozinho**, falhou com `actual: 2`, `expected: 1` na assertion da linha 45. Logo, a falha não depende de ordem, paralelismo ou resíduos de outros testes.
5. Depois da correção, o mesmo teste foi repetido isoladamente, consultando `Room.queueRevision` e os IDs/posições reais de `QueueItem` antes e depois do restore. Passou.

O teste cria IDs exclusivos com UUID para usuário, Casa, Party e mídia; `finally` remove somente suas entidades. A instância de adapter “restart” é novo `RoomStore` + novo `PrismaMediaRepository` usando o mesmo PrismaClient/conexão, **não** restart completo do servidor ou do PostgreSQL.

## FAILING_ASSERTION

`assert.equal(snapshot.queueRevision, 1)` (antes da correção). O teste executava `addQueueItem(...)` e, posteriormente, `changeMedia(...)` para selecionar aquela ocorrência, antes de salvar. `addQueueItem` chama `bumpQueue` uma vez; `changeMedia` chama `bumpQueue` outra vez. `updateMedia(..., "play")` muda playback revision, não queue revision. Portanto a sequência legítima é `0 → 1 → 2`.

## ENTITY_BEING_COUNTED

Não se contavam entidades. `actual: 2` era o **contador monotônico de mutações da fila** (`queueRevision`) após adicionar e selecionar uma única ocorrência. `expected: 1` era expectativa obsoleta de uma só mutação. `queue.length` era 1 e sua assertion imediatamente anterior passou no CI e localmente.

## EXPECTED_SEMANTICS

M3 Queue V2 define `QueueItem.id` como identidade da ocorrência, `provider + providerMediaId` como identidade canônica da mídia e `queueRevision` como versão da estrutura/ordem/seleção da fila. Uma mesma mídia pode aparecer duas vezes com IDs diferentes, intencionalmente; reenvio do mesmo ID/autor/mídia é no-op. Selecionar a ocorrência atual é uma mutação distinta de adicioná-la e deve avançar a revisão. Playback `media.revision` é independente.

## ACTUAL_SEMANTICS

Antes do primeiro restart: uma ocorrência no `RoomStore`, `currentMedia.state = playing`, `queueRevision = 2`. Após `PrismaMediaRepository.saveHouse`: uma row `QueueItem` com o mesmo ID de ocorrência, provider, providerMediaId e posição 0; row `Room.queueRevision = 2`. Após criar novos `RoomStore`/repository e chamar `load()`: uma ocorrência com o mesmo ID e `queueRevision = 2`; playback volta intencionalmente a `idle`, histórico/biblioteca/favorito/playlist/progress continuam. A fronteira 1→2 é **a ação `changeMedia` anterior à gravação**, não um insert duplicado nem restore.

## DATABASE_STATE

As novas assertions consultam explicitamente `Room` e `QueueItem` no banco do teste após `saveHouse`: revisão 2, exatamente **uma row** de fila com ID `item.id` e posição 0. Depois, o teste refaz a mesma adição após restart: revisão e row count não mudam. Em seguida adiciona uma ocorrência nova da mesma mídia com ID `repeated.id`, salva e consulta duas rows ordenadas por posição 0/1, mesmo `providerMediaId`, IDs distintos. UUIDs mudam por execução e não são credenciais; o teste compara os IDs concretos por igualdade, sem depender de valores fixos. Não há `operationId` neste cenário de adição individual: a chave idempotente é o occurrence ID.

## RESTORE_STATE

`PrismaMediaRepository.load()` lê rows e monta `PersistedMediaHouse`; `RoomStore.restoreHouse()` atribui `room.queueRevision = input.queueRevision`, recria cada item da fila uma vez e redefine `currentItem`/clock de playback para idle por design. Primeiro restore: 1 item, revisão 2. Segundo restore após duplicata intencional: 2 itens com IDs distintos e ordem intacta, revisão 3. Não há reaplicação de `addQueueItem` na hidratação nem projeção duplicada.

## ROOT_CAUSE

Assertion antiga em `prismaMediaRepository.integration.test.ts` fixava revisão 1, mas a operação `changeMedia` do próprio teste já exigia revisão 2 após M3. O código de produto em `apps/server/src/store.ts` (`addQueueItem`, `changeMedia`, `bumpQueue`) e o adapter Prisma estavam coerentes. A falha reproduzida em banco vazio isolado elimina contaminação como causa; inspeção de rows e IDs elimina duplicação de persistência/restore.

## CLASSIFICATION

**STALE_TEST.** Não é PRODUCT_BUG, TEST_ISOLATION, RESTORE_BUG ou PERSISTENCE_BUG. O teste foi escrito para semântica anterior da revisão; o CI habilitou o teste PostgreSQL que havia sido pulado no baseline local sem banco.

## FIX

Alterado **somente** `apps/server/src/prismaMediaRepository.integration.test.ts` (além deste relatório): o teste agora prova revisão 1 após adição e retry no-op; revisão 2 após seleção; revisão 2 e uma row no PostgreSQL; igualdade da revisão persistida/restaurada; retry da mesma ocorrência sem duplicação depois do restart; nova ocorrência da mesma mídia com outro ID, revisão 3, duas rows ordenadas, e segundo restore fiel. Não se substituiu simplesmente `1` por `2`; a expectation deriva da sequência de operações e da row autoritativa.

## WHY_THE_FIX_IS_CORRECT

Uma revisão monotônica é um contador de alterações, não de elementos. Se alterássemos o `RoomStore` para manter revisão 1, perderíamos o evento de seleção do item corrente e poderíamos aceitar operações obsoletas, regredindo M3. As novas assertions distinguem rigorosamente `QueueItem.id`, mídia canônica, revisão e restore, e verificam Postgres em vez de inferir integridade apenas do snapshot.

## QUEUE_OCCURRENCE_SEMANTICS

`item.id` original é preservado em uma row antes/depois do primeiro restore. `repeated.id` novo, com mesmo provider/providerMediaId, cria segunda ocorrência legítima em posição seguinte. O segundo restore preserva exatamente `[item.id, repeated.id]` e `queueRevision = 3`. Não existe deduplicação por título ou mídia canônica.

## IDEMPOTENCY

`addQueueItem` com mesmo ID/autor/mídia é no-op antes e depois do restart; não aumenta `queueRevision` ou row count. IDs diferentes são intenções diferentes. O cache `operationId` de batch enqueue é volátil e **não** foi alterado; exactly-once de lote através de restart não é prometido pelo M3. Este teste não cobre batch com operationId, cuja limitação continua documentada no relatório M3.

## POSTGRESQL_RESTART

O teste específico passou isolado após a correção. A suíte PostgreSQL completa rodou via `npm test` com `LUMIO_TEST_DATABASE_URL` apontando exclusivamente ao banco descartável: auth, Drive connection, Media/Queue/Library, House/membership/invite e House deletion passaram. O teste separado de bootstrap compilado permaneceu **1 skip condicional** no `npm test`, como no CI anterior; foi então executado isoladamente com seu opt-in `LUMIO_BOOT_QA=1` e **passou**. `smoke:production` e `smoke:postgres-flow` também passaram, inclusive fluxo de API e restart real do processo do backend contra o PostgreSQL local.

## M2_REGRESSION

O mesmo teste conserva assertions de library, favorites, playlist item e continue-watching. A suíte completa cobre favoritos idempotentes, recentes deduplicados, collections, ordem, House isolation e projeção privada Drive. Nenhuma lógica M2 foi modificada.

## M3_REGRESSION

Novas assertions PostgreSQL cobrem uma ocorrência, retry, duplicata intencional, identidade, ordem e revisions através de dois restores. A suíte completa executa os testes de Queue V2 (reorder CAS, Play Next, batch, remove current, ended idempotente, autoplay). Nenhuma lógica M3 foi modificada.

## GX1_IMPACT

Nenhum. O GX1 já separa revisão de fila, ocorrência e mídia canônica; a evidência reforça essa distinção. Seu arquivo não foi alterado. GX2 não foi iniciado.

## MIGRATIONS

Nenhuma criada ou modificada. As quatro migrations existentes foram aplicadas **somente** ao banco descartável local para reproduzir o CI. Nenhuma migration foi aplicada em produção.

## TESTS

Teste focal original: falhou `2 !== 1`. Teste focal corrigido: passou. `npm run typecheck`, `npm run lint`, `npm run build`: passaram. `npm test` com PostgreSQL: **138 pass / 0 fail / 1 skip** no servidor, **33 pass** web e **4 pass** service worker, total **175 pass / 0 fail / 1 skip**. O único teste pulado foi executado isoladamente com opt-in e passou (1/1). Os dois scripts oficiais de smoke PostgreSQL/produção local passaram. `git diff --check` passou; o relatório não rastreado foi checado separadamente quanto a whitespace.

## E2E

`npm run test:e2e`: **14/14 passou**, incluindo M2 multi-browser e M3 Queue V2 com três clientes, reorder, ação stale, late join, batch e reconnect. Esta correção não altera frontend nem fluxo runtime; o E2E não usa providers Google/YouTube reais.

## FILES_CHANGED

`apps/server/src/prismaMediaRepository.integration.test.ts` e este relatório. O Design Bible GX1 aparece como arquivo não rastreado preexistente e foi preservado; não pertence ao hotfix. Nenhum código de produto alterado.

## KNOWN_LIMITATIONS

“Restart” neste teste é recriação do store/repository na mesma conexão DB, não reinício de processo. O restore zera playback ativo intencionalmente. Batch `operationId` não é durável após restart; isso é limitação M3 preexistente, não a falha do CI. QA PostgreSQL em contêiner local não equivale a banco hospedado ou carga multi-instância.

## PRODUCTION_ACTION_REQUIRED

Nenhuma migration, reset, `db push` ou alteração de dados. Após revisão humana, o usuário pode fazer commit/push manualmente para rerodar CI. Não executar deploy neste hotfix. O contêiner/banco descartável local foi parado e removido após os gates; nenhum banco de produção foi acessado.

## RESPOSTAS_OBRIGATORIAS

| Nº | Resposta |
|---|---|
| 1 | `actual: 2` era `snapshot.queueRevision` após add + changeMedia. |
| 2 | `expected: 1` era a assertion obsoleta de uma revisão para duas mutações. |
| 3 | Não; o PostgreSQL tinha uma row QueueItem, com revisão 2 no Room. |
| 4 | Não houve duplicação em restore/projeção. |
| 5 | Não; falhou isoladamente antes da correção. |
| 6 | Não; falha determinística isolada e no CI. |
| 7 | Não; IDs únicos, banco vazio e reprodução isolada. |
| 8 | No cenário original não; o teste ampliado cria segunda ocorrência intencional distinta. |
| 9 | Cenário original não; teste ampliado reenvia o mesmo occurrence ID antes/depois do restore. |
| 10 | Nenhum `operationId` é usado nesse caminho individual; o occurrence ID identifica a tentativa. |
| 11 | `item.id` e `repeated.id`, UUIDs únicos gerados pelo teste e comparados nas rows/restores. |
| 12 | Sim, revisão sobe por add e seleção, não pelo número de itens. |
| 13 | Sim, a assertion de revisão 1 estava obsoleta. |
| 14 | Não foi demonstrado bug de produto. |
| 15 | Expectativa fixada em 1 apesar de `changeMedia` incrementar revisão. |
| 16 | `apps/server/src/prismaMediaRepository.integration.test.ts`; runtime `store.ts` está correto. |
| 17 | Corrigir/fortalecer apenas teste de integração, sem tocar runtime. |
| 18 | Não. |
| 19 | Sim, com assertions de DB, restore, retry e duplicata intencional. |
| 20 | Revisão 2 corresponde a duas mutações; restauração deve igualar o valor persistido. |
| 21 | Sim, IDs distintos da mesma mídia sobrevivem ao segundo restore. |
| 22 | Sim para adição individual com mesmo occurrence ID; batch pós-restart mantém limitação preexistente. |
| 23 | Sim, IDs/ordem/revisão persistidos e restaurados no teste. |
| 24 | Sim, assertion e regressão M2. |
| 25 | Sim, regressão M2 de recentes deduplicados. |
| 26 | Sim, playlist item/ordem nos testes de persistência/M2. |
| 27 | Sim, continueWatching/progress no teste focal e suíte. |
| 28 | Sim, testes de isolamento de Casa na suíte. |
| 29 | Sim, lógica inalterada e testes de projeção Drive. |
| 30 | Sim: os testes PostgreSQL regulares passaram; o único opt-in de bootstrap foi executado isoladamente e passou, assim como os dois smokes. |
| 31 | Sim: 175 pass, 0 fail, 1 skip condicional. |
| 32 | Sim: 14/14. |
| 33 | Sim. |
| 34 | Sim. |
| 35 | Sim. |
| 36 | Sim, também com checagem adicional do relatório não rastreado. |
| 37 | Não. |
| 38 | Não. |
| 39 | Não. |
| 40 | Sim, tecnicamente pronto para novo CI após commit/push manual; nenhum deploy foi executado. |

## FINAL_VERDICT

Raiz identificada e reproduzida em PostgreSQL descartável; expectativa obsoleta corrigida com prova direta de rows, IDs, revisão e dois restores. Suíte PostgreSQL, bootstrap opt-in, smokes, typecheck, lint, build, E2E e whitespace passaram. Invariantes M2/M3 preservados e nenhum trabalho GX2 incluído. Revisão humana e commit/push permanecem com o usuário.

M3.1 CI FIX: READY
