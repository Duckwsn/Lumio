# Pós-1.0 — M3 Queue V2

## STATUS

Implementação local concluída para revisão. Nenhum commit, push, deploy, alteração de produção ou migration foi executado nesta etapa. O encerramento do Marco Media depende de homologação manual real de YouTube/Drive, rede e dispositivos.

## BASELINE

Checkout inicial limpo em `master`. Antes de editar: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` e `git diff --check` passaram. Baseline: 128 testes de servidor passaram, 6 PostgreSQL foram ignorados por ausência do banco descartável; 33 testes web e 4 testes do service worker passaram; 13 E2E passaram. O M2 já tinha Social Library, favoritos compartilhados, coleções, recentes deduplicados e integração com a fila.

## AUDIT

Problemas concretos: um retry de `queue:add` com mesmo ID criava outra ocorrência; a verificação YouTube substituía o ID; movimentos eram sem ACK para a UI, podiam atravessar a ocorrência atual e bumpavam revisão até em no-op; `queue:remove` não validava revisão; `media:change` deixava o atual em posição não inicial; o painel misturava atual e próximos e escondia controles de ordem no desktop; o snapshot expunha recentes sociais deduplicados onde `Previous` exigia histórico operacional; lote não tinha limite efetivo nem idempotência. `queue:advance` já protegia mídia e ocorrência esperadas, e a revisão do playback já era independente da fila.

## EXISTING_QUEUE_ARCHITECTURE

`RoomStore` mantém fila por Party, `currentItem`, `currentMedia`, `queueRevision`, histórico e configurações. O Prisma já possui `QueueItem` com ID/posição/status e `Room.queueRevision`; runtime de produção usa o adapter PostgreSQL da Etapa 18. O servidor publica `room:snapshot`, `queue:update`, `media:sync` e `queue:history`. O frontend aplica revisões recebidas e o provider apenas apresenta o estado recebido. Entrada tardia e reconexão recebem snapshot completo. `mediaId` é o ID do provider, não da ocorrência. `operationId` dos comandos de playback existe para rastreio; não constitui sozinho deduplicação persistente.

## QUEUE_V2_DESIGN

Sequência autoritativa por Party, uma ocorrência atual no início quando selecionada, seguida por ocorrências próximas. A identidade canônica `provider + providerMediaId` continua separada de `QueueItem.id`. Nenhum segundo player ou caminho de playback foi criado. Limite explícito de 250 ocorrências. O painel é apenas uma projeção do estado do servidor, reutilizável em futura Media Party sem mover a autoridade para `MainStage`.

## NOW_PLAYING

Seção própria mostra título, provider, duração, autor, estado tocando/pausado/encerrado e ação contextual. Selecionar uma ocorrência futura a traz para a frente e remove a anterior da fila ativa, sem apagar os demais próximos. A revisão da fila sobe; o playback recebe nova revisão. Remover a ocorrência atual põe o player em `idle` e mantém os próximos, sem fingir que o item removido ainda está ativo.

## UP_NEXT

Seção própria ordenada pelo servidor com contagem, thumbnails/fallback, posições, autor e ações de reproduzir, mover e remover. A UI não reordena otimisticamente. Sem atual, as ocorrências aguardam início manual; sem próximos, o painel comunica explicitamente esse estado.

## PREVIOUS

Usa `room.history` operacional, não `recentHouseMedia` deduplicado da Social Library. O snapshot agora transmite até 100 reproduções operacionais sanitizadas. Reproduzir anterior cria uma nova ocorrência e segue o mesmo contrato de playback/histórico. Referências Drive no histórico público permanecem redigidas.

## QUEUE_IDENTITY

`QueueItem.id` identifica uma adição; dois IDs diferentes da mesma mídia são duplicatas intencionais. Reenviar mesmo ID pelo mesmo autor e mesma mídia é no-op sem incremento de revisão. Colisão de ID com autor ou mídia diferente é rejeitada. Os adapters YouTube/Drive preservam o ID recebido no caminho de adição.

## OPERATIONS

`queue:add`, `queue:play-next`, `queue:move`, `queue:remove`, `queue:clear`, `media:change`, avanço manual/automático e lote passam pelo servidor. `Clear Queue` preserva o atual e remove somente os próximos; no-op não incrementa versão. `Play Next` insere imediatamente após o atual, sem reproduzir diretamente. `Play Now` escolhe uma ocorrência adicionada e inicia pelo fluxo existente. Remoção do atual interrompe a mídia; remover um próximo não toca o player.

## REORDERING

Os botões contextuais mover para cima/baixo funcionam com teclado e toque. Desktop também usa essas ações; drag-and-drop foi adiado para evitar um segundo modelo de feedback concorrente. O servidor valida membership, permissão, ocorrência, revisão, posição e imobilidade do atual. Movimento sem efeito não grava nem retransmite.

## CONCURRENCY

A primeira operação na revisão R vence. Outra operação com R obsoleta recebe `ok:false`, revisão e fila atual. O cliente mantém a ordem confirmada pelo servidor e mostra erro que permite tentar novamente. Teste de integração cobre reordenação concorrente e remoção obsoleta; E2E cobre três contas, entrada tardia, lote, reconexão e dois pedidos de avanço.

## REVISION_MODEL

`queueRevision` versiona estrutura/ordem. `currentMedia.revision` versiona comandos de reprodução. `mediaId` não é a ocorrência. `queue:move` exige revisão; remover, selecionar mídia e avançar manualmente verificam a revisão quando enviada; `queue:advance` confere mídia e ocorrência esperadas. A revisão nunca é aplicada por comparação de título ou índice isolado.

## IDEMPOTENCY

Adição individual e Play Next reutilizam o ID da ocorrência em tentativa incerta; o cliente mantém o mesmo ID até confirmação. Lote aceita `operationId` UUID e um cache limitado a 256 operações por Party para impedir repetição enquanto o processo está vivo. Duplicatas intencionais exigem nova intenção/ID. O cache do lote não é durável após reinício, limitação conhecida; uma nova tentativa após restart pode exigir reconciliação pelo usuário.

## AUTOPLAY

`RoomSettings.autoplayNext` segue autoritativo. Com opção ligada, o servidor tenta o próximo disponível ao chegar ao fim. Desligada, marca o atual como encerrado e mantém o próximo. O painel distingue avanço automático, espera manual e ausência de próxima mídia. Não há autoplay local concorrente.

## DOUBLE_ADVANCE

O servidor confere `expectedMediaId`, `expectedQueueItemId` e estado `ended`/mudança de atual; o segundo pedido para a ocorrência anterior não avança a fila novamente. Testes de domínio e E2E exercitam a condição com mídias repetíveis.

## RECONNECT

O cliente recebe snapshot atual da Party, inclusive fila, revisão, atual e histórico; eventos com revisão anterior não podem restaurar ordem antiga. Intenções individuais incertas mantêm o ID em memória na aba; reiniciar a aba não mantém essa intenção. Em produção, dados da fila persistem via adapter PostgreSQL, mas grants Drive e cache de idempotência de lote são voláteis.

## LATE_JOIN

O terceiro cliente do E2E entrou depois de três adições e recebeu a ordem, revisão e mídia atuais. Não há reconstrução local da fila por eventos antigos.

## MULTI_TAB

Cada aba recebe o mesmo snapshot/eventos versionados. Não há coordenação específica entre abas além da autoridade do servidor; ações simultâneas competem por revisão.

## PERMISSIONS

Servidor é a fonte final. `queue:add`/Play Next: `RoomStore.canAddToQueue` segundo `queueControl`; lote requer `MEDIA_ADD` e controle de mídia para `playNow`/replace. Reordenar/remover/Play Now/Next/Previous: `canControlMedia` segundo `mediaControl`. Limpar: permissão social `QUEUE_MANAGE` (HOST/ADMIN). A UI esconde ações sem permissão, sem substituir validação no backend. GUEST depende da política para adicionar; não controla mídia em `everyone`.

## MULTI_HOUSE_ISOLATION

Todas as ações incluem `roomId`, exigem socket unido àquela Party e autorização de Casa. A fila, operações de lote e cache de intents são segmentados por Room/Casa. Exclusão de Casa limpa também o cache volátil correspondente.

## SOCIAL_LIBRARY_INTEGRATION

Favoritos, coleções e recentes mantêm mídia canônica. Favoritar/salvar não enfileira nem reproduz; escolher ação no Media Hub cria uma ocorrência nova na fila. Recentes sociais continuam agregados, enquanto `Previous` usa eventos operacionais não agregados.

## DRIVE_SECURITY

Referência salva não concede acesso ao arquivo. Adição individual revalida membro, proprietário da conexão e grant; lote filtra disponibilidade no momento da ação. Itens indisponíveis são contados explicitamente; se todos indisponíveis, operação é recusada. Títulos e metadados privados no histórico público continuam projetados sem vazamento. Nenhum scope OAuth foi alterado.

## MEDIA_HUB_INTEGRATION

Mantidos os fluxos de YouTube, Drive, Biblioteca, Favoritos, Histórico e Coleções. O cliente transmite `operationId` no lote; respostas de sucesso parcial informam itens Drive ignorados. Coleção excedendo 250 itens na fila é recusada atomicamente. O player só muda através das operações de Party.

## MOBILE

Fila continua painel secundário, preservando prioridade do player e chat persistente. Cartões compactos, botões de opções de 44 px e ações mover para cima/baixo sem exigir drag. Capturas 320/360/375/390/412/430 px não apresentaram overflow horizontal. O primeiro QA revelou quebra do botão para outra linha; corrigido e recapturado.

## ACCESSIBILITY

Seções nomeadas, botões com nomes explícitos, menu acionável por teclado, Escape fecha menu, estado expandido por `aria-expanded`, erro por `role=alert`, ações desabilitadas nos limites e alvos de toque no mobile. Movimento por botões substitui dependência de arrastar.

## PERFORMANCE

Sem polling novo; eventos e snapshots existentes continuam a atualizar a fila. Cache de operações de lote limitado, fila limitada a 250 e histórico público limitado a 100 no snapshot. Thumbnails carregam com `loading=lazy`; Media Hub mantém carregamento separado. Nenhuma dependência foi adicionada.

## SECURITY

Permissões e validações de provider continuam no servidor. Revisões antigas não sobrescrevem estado novo. Operações Drive conferem grant e membership. IDs de ocorrência não são credenciais. Nenhum token, segredo ou URL privada foi incluído em capturas ou relatório. Nenhuma alteração de CORS, sessão, OAuth, migrations ou produção.

## M1_REGRESSION

UniversalPlayer, adapters, Ambiente V2, música e sincronização não foram alterados. Testes unitários de provider/ambient e E2E M1 fazem parte da suíte completa.

## M2_REGRESSION

Biblioteca social, favoritos idempotentes, coleções, recentes e progresso foram preservados. O histórico público operacional da Party foi separado dos recentes sociais deduplicados; testes M2 de API/real-time e UI integram a suíte.

## CALL_REGRESSION

Código de WebRTC, áudio e signaling não foi alterado. O E2E existente de três clientes e testes RTC continuam como gate; a validação WAN/TURN real exige homologação fora do ambiente local.

## GAMES_REGRESSION

Draw, Quiz e Cards não tiveram contratos ou componentes alterados. Os E2E completos de jogos integram o gate.

## SCREEN_SHARE_REGRESSION

Compartilhamento de tela e `MainStage` não foram alterados. Testes existentes de isolamento e apresentação fazem parte dos gates; captura real em diferentes dispositivos ainda requer homologação.

## S1_S2_REGRESSION

Casas, membros, Presence V2, convites e atividade não foram alterados. Testes de isolamento entre Casas e presença permanecem na suíte.

## FUTURE_GX_COMPATIBILITY

Queue V2 não depende do jogo ativo. Sua autoridade permanece no servidor e sua apresentação pode ser reutilizada pela futura Media Party; nenhum recurso GX/M4 foi iniciado.

## TESTS

Antes de editar: typecheck, lint, build, 165 testes unitários/integrados aprovados (6 PostgreSQL skipped) e 13 E2E aprovados. Após editar: typecheck, lint, build e `npm test` aprovados. Contagem final: servidor 133 pass / 0 fail / 6 skip; web 33 pass / 0 fail; service worker 4 pass / 0 fail. Total 170 pass / 0 fail / 6 skip. Cinco novos testes de domínio cobrem identidade/retry, Play Next, reordenação, Play Now/histórico e lote/capacidade. O teste de integração existente foi ampliado para reordenação e remoção obsoletas. `git diff --check` aprovado.

## MULTI_CLIENT

Três contas/sessões reais locais. A reproduz, B adiciona, A adiciona, C entra tardiamente, B reordena, A tenta versão antiga, A remove, A adiciona coleção, B recarrega, A e C enviam avanço para a mesma ocorrência. A ordem e o atual convergiram no teste focal. Teste não comprova WAN, Google real ou TURN.

## E2E

Novo cenário M3 focal aprovado após ajustes do seletor mobile. O primeiro teste focal revelou um erro no seletor do teste (nome do botão mobile diferente do desktop), não um erro da aplicação. A captura revelou uma quebra visual real no mobile, corrigida. A primeira suíte completa terminou 13/14 por rate limit de cadastro de contas QA criado ao somar o novo cenário; o M3 agora reutiliza as contas QA do M2 quando a suíte roda inteira e cria contas próprias quando executado isoladamente. Execução completa final, sem edição de código durante o gate: **14 pass / 0 fail**.

## VISUAL_QA

Capturas geradas em `artifacts/m3/` (ignorado pelo Git): fila vazia desktop/mobile, povoada desktop/mobile, menu contextual, ordem após reordenação, autoplay desligado, título longo, lista longa desktop/mobile, Drive local não configurado e cada largura mobile 320/360/375/390/412/430 px. Foram abertas e inspecionadas as capturas da fila vazia desktop/mobile, povoada desktop/mobile, menu, reordenação, autoplay desligado, lista longa desktop/mobile, Drive local e as seis larguras; a recaptura mobile confirmou a grade corrigida. QA adicional com agent-browser: landing local em 390 px sem overflow; o QA específico da fila foi feito nos três navegadores do E2E. Estados ainda sem captura/homologação: arquivo Drive real com grant revogado, operação pendente prolongada e erro de rede.

## KNOWN_LIMITATIONS

- Idempotência de lote reside na memória do processo; em múltiplas instâncias ou após restart não garante exactly-once. Também não reverte um lote se a persistência falhar após mutação em memória, herdando o limite do fluxo de escrita existente.
- Drag-and-drop desktop foi adiado; há movimento acessível por botões.
- A UI mantém ID de tentativa individual somente enquanto a aba está viva. Recarregar após ACK perdido pode gerar nova intenção.
- O teste local não valida indisponibilidade real de YouTube/Drive, rede WAN nem qualidade de chamada com TURN.
- As capturas de operação pendente, erro de rede e Drive indisponível real ainda não foram feitas. A captura local mostra Drive não configurado, condição diferente de grant revogado. Não afirmar QA visual completo desses estados.

## MANUAL_REQUIRED

Homologar com duas ou três contas autorizadas: YouTube incorporável, arquivo Drive compartilhado e revogado, autoplay bloqueado pelo navegador, reconexão WAN, múltiplas abas, call com TURN e mobile físico. Verificar copy e comportamento do painel com títulos longos/lista extensa; decidir se cache de lote durável é necessário antes de escalar para múltiplas instâncias. Não alterar produção sem autorização.

## FILES_CHANGED

`packages/shared/src/index.ts`; `apps/server/src/store.ts`, `index.ts`, `store.test.ts`, `security.integration.test.ts`; `apps/web/src/App.tsx`, `components/MediaHub.tsx`, `styles.css`; `e2e/party.spec.ts`; `.gitignore`; `docs/MEDIA_HUB.md`; este relatório. Sem migration ou dependência nova.

## RESPOSTAS OBRIGATÓRIAS

1. Antes: fila por Party com ocorrência, revisão, autoplay/Previous e autoridade do servidor, mas painel misto e alguns contratos fracos.
2. Preservados: player universal, sync, YouTube/Drive, Biblioteca, favoritos, coleções, chat, call, jogos, tela e presença.
3. IDs de retry substituídos/duplicados, movimento sem ACK/no-op com bump, conflitos incompletos, atual não rebaseado, histórico social usado no painel.
4. Sequência de ocorrências versionada no servidor, atual separado e próximos ordenados.
5. Projeções `currentItem`/status e demais itens, em seções diferentes.
6. Usa histórico operacional e recria uma ocorrência para reproduzir.
7. `QueueItem.id`; mídia canônica é `provider + providerMediaId`.
8. Sim, IDs diferentes permitem a mesma mídia repetida.
9. Mesmo ID por retry é no-op; cliente reutiliza intento incerto; lote usa `operationId` volátil.
10. Botões mover cima/baixo enviam intenção com revisão; só servidor publica ordem.
11. A primeira vence; a obsoleta recebe versão/fila atual e pode ser repetida.
12. `queueRevision` para estrutura; `currentMedia.revision` para playback.
13. São recusados ou tornam-se no-op sem sobrescrever a fila nova.
14. Ação contextual autorizada, com versão e ACK.
15. Playback vira idle, atual sai; próximos permanecem.
16. Adiciona/seleciona ocorrência e usa `media:change`/play existente.
17. Sim, já existia; foi refinado com ID preservado e retry seguro.
18. Sim; remove próximos, preserva atual, sem bump em no-op.
19. Servidor avança se ligado; se desligado, marca ended e espera.
20. Podem solicitar, mas não confirmar dois avanços da mesma ocorrência.
21. Guardas por mídia, ID de ocorrência e estado atual.
22. `room:snapshot` com fila/versão/atual.
23. Novo snapshot autoritativo e eventos versionados convergem.
24. Mesmo servidor e revisão por Party; não há estado paralelo de aba.
25. Add conforme `queueControl`; controle/reordem/remover conforme `mediaControl`; Clear requer `QUEUE_MANAGE`; lote exige `MEDIA_ADD`.
26. Membership, `roomId` unido e caches segmentados por Room.
27. Ação do Media Hub cria ocorrência; favoritar sozinho não enfileira.
28. API de lote com ordem, revisão, limite, disponibilidade e feedback.
29. Conflito/capacidade rejeitam sem lote parcial; Drive indisponível é ignorado com contagem explícita, todos indisponíveis rejeita.
30. Não; grant é conferido na inserção/reprodução.
31. Mensagem de erro individual ou contagem de ignorados no lote.
32. Não; provider recebe somente estado autoritativo.
33. Sim, sem mudança de adapter.
34. Sim, apresentação local preservada.
35. Sim, com `operationId` adicionado ao lote.
36. Sim, recente social continua deduplicado.
37. Sim; painel da fila não desmonta a Call.
38. Não.
39. Não.
40. Sim; presença não é derivada da fila.
41. Não, autoridade e contrato estão fora do palco.
42. Sim, com outra apresentação sobre os mesmos contratos.
43. Votação existente foi preservada, expansão adiada para não alterar política social em M3.
44. Não.
45. Não; schema existente bastou.
46. Não.
47. 170 pass / 0 fail / 6 skip (133 servidor, 33 web, 4 service worker; 6 PostgreSQL sem banco descartável).
48. 14/14 E2E passaram na execução completa final.
49. Fila vazia desktop/mobile; povoada desktop/mobile; reordenação; menu; autoplay desligado; lista longa desktop/mobile; Drive local não configurado; 320, 360, 375, 390, 412 e 430 px.
50. Cache de lote volátil, sem drag desktop e validação externa pendente.
51. Providers reais, WAN/TURN, mobile físico, Drive revogado, bloqueio de autoplay e estados visuais faltantes.
52. Pronto para revisão técnica local; encerramento do Marco Media somente após homologação manual e decisão sobre idempotência durável.
