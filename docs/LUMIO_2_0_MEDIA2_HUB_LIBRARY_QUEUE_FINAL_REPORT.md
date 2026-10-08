# Lumio 2.0 — MEDIA2: Media Hub, Library & Queue

Relatório de implementação e validação local. O código do checkout é a fonte de verdade; este documento não certifica provedores reais nem a infraestrutura hospedada. Nenhum commit, push, deploy, OAuth ou banco de produção foi alterado.

## 1. STATUS

MEDIA2 concluída no escopo local, com gates finais aprovados. Integrações reais YouTube/Drive e persistência PostgreSQL hospedada permanecem **UNVERIFIED** nesta etapa.

## 2. PRODUCT_SCOPE

Fluxo preservado: Casa → Party → descobrir mídia → biblioteca/coleções → fila colaborativa → UniversalPlayer. Somente YouTube, Google Drive e conteúdo previamente salvo; sem Games ou provider novo.

## 3. FROZEN_CONTRACTS

FF3.1 e UX1 permanecem congelados. Nenhum redesign amplo: no mobile, Player e Chat coexistem; Chat segue fixo e People, Queue e Add Media seguem no cabeçalho. MEDIA1 continua responsável pelo playback.

## 4. MEDIA1_BASELINE

MEDIA1 terminou com typecheck, lint, build, testes e E2E 16/16 na repetição, com ressalvas históricas de posição remota M1 e worker Playwright no Windows. MEDIA2 não reescreveu UniversalPlayer ou adapters.

## 5. WORKTREE

O checkout estava limpo antes da edição. As mudanças desta etapa são apenas nos arquivos listados em **FIXES** e **TESTS_ADDED**. Capturas locais de QA ficam em `artifacts/media2/`; capturas históricas regravadas pelo E2E foram restauradas de HEAD sem tocar no código de terceiros.

## 6. FILES_READ

Foram lidos `docs/AGENT.MD`, `docs/CLAUDE.MD`, `docs/MEDIA_HUB.md`, relatórios M1/M2/M3, FF3.1, LX0, UX1 e MEDIA1; e os componentes/serviços atuais de Hub, resolver, YouTube, Drive, biblioteca, fila, persistência, player e testes. Documentos antigos não foram tratados como prova de comportamento atual.

## 7. PRE_CHANGE_TESTS

Antes da edição: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` e `git diff --check` passaram. `npm run test:e2e`: 16/16 passaram. Os seis testes PostgreSQL condicionais ficaram skipped sem banco de teste configurado.

## 8. ARCHITECTURE_INVENTORY

`MediaHub.tsx` apresenta Descobrir, Biblioteca, Playlists, Histórico e Google Drive. `MediaResolver.ts` normaliza URLs. O backend valida HTTP/Socket.IO; `RoomStore` é a fonte de verdade da fila e da biblioteca da Casa. `PrismaMediaRepository` salva/restaura estado no modo PostgreSQL. Socket.IO distribui snapshots/revisions; `MediaViewerRegistry` coordena ocupação real. UniversalPlayer consome o estado de reprodução, sem comandar a fila sozinho.

## 9. MEDIA_HUB

O modal, abas, busca, resultados, ações de fila, estados vazios, feedback e fechamento foram mantidos. A intervenção de UI ficou limitada a erro de consulta inválida, criação em andamento e texto que agora inclui áudio do Drive.

## 10. YOUTUBE_SEARCH

Busca oficial existente, com validação de 3–100 caracteres, paginação e estados de quota/erro. A busca A seguida de B já usa cancelamento e generation; E2E com resposta A atrasada confirmou que B permanece. Consulta acima de 100 agora mostra erro específico no cliente e no servidor, sem requisição inútil nem botão de retry impossível.

## 11. YOUTUBE_URLS

O resolver aceita ID puro completo e URLs HTTPS em hosts oficiais para `watch`, `youtu.be`, `embed`, `shorts` e `live`, com parâmetros adicionais. IDs incompletos/sufixados, protocolo inseguro e domínios parecidos não são aceitos. Não há bypass de embed.

## 12. YOUTUBE_NORMALIZATION

Resultados preservam provider, video ID e metadados recebidos da API. Duração desconhecida não é fabricada; thumbnail e embeddability não são inferidas como garantidas. O fallback de link/oEmbed não substitui validação real de incorporação.

## 13. DRIVE_DISCOVERY

Descoberta mantém arquivos compatíveis e pastas do Meu Drive via backend existente; sem busca global ou explorador de documentos. Áudio adicionado em MEDIA1 permanece no mesmo Hub e nas ações de biblioteca/fila.

## 14. DRIVE_FOLDERS

Breadcrumb, abertura, retorno, atualização e cache curto foram preservados. Mudança de pasta aborta requisição obsoleta e limpa página de retry pendente. Cenários reais de pasta removida e revogação durante navegação não foram exercidos.

## 15. DRIVE_AUDIO

E2E sintético confirmou dois arquivos de áudio descobertos, uma entrada por ID após páginas sobrepostas, e ação de adicionar à fila visível em viewport mobile. MIME elegível não garante codec; MEDIA1 continua a sinalizar falha de codec no Player.

## 16. DRIVE_AUTH

Google Login e autorização Drive continuam separados. Estados conectado/desconectado são exibidos. Esta etapa não solicitou scopes nem modificou OAuth, refresh token ou credenciais. Expiração e revogação reais não foram validadas nesta rodada.

## 17. DRIVE_PRIVACY

Fluxos existentes checam membership/owner grants e emitem tickets de mídia no servidor; referências não são tokens de acesso. Não houve teste hospedado de acesso cruzado, revogação, exclusão de membro ou URL direta nesta etapa; SEC2 continua necessário.

## 18. DRIVE_PAGINATION

Defeito reproduzido: erro na segunda página fazia “Tentar novamente” recarregar a primeira, sem recuperar a continuação. Corrigido para repetir o pageToken falho; entradas são mescladas por Drive ID antes da ordenação. E2E prova segunda página 503 → retry da mesma página → dois itens sem duplicata. Limite de cache permanece 50 pastas/60 s.

## 19. DRIVE_METADATA

IDs, nomes, MIME/tipo e metadados opcionais vêm do backend; não se inventa duração, tamanho, thumbnail nem suporte de codec. A mídia privada não recebe URL pública persistente por esta correção.

## 20. LIBRARY_ARCHITECTURE

Biblioteca de mídia, favoritos e coleções são estado compartilhado da Casa no `RoomStore`; o ator da mutação é registrado onde aplicável, mas favoritos não são privados por usuário. Histórico é derivado de reprodução. Não foi criada segunda biblioteca nem migrado ownership.

## 21. FAVORITES

Adicionar/remover usa identidade canônica e endpoints existentes; os testes M2/rotas existentes cobrem persistência local. O conjunto de favoritos pertence à Casa, não a uma identidade individual. A etapa não muda essa semântica. Repetição real entre abas e restart PostgreSQL continua fora da validação desta rodada.

## 22. HISTORY

Histórico é gerado por reprodução efetiva, não por busca ou simples aparição no Hub; a projeção pública é limitada. Late join lê snapshot. Esta etapa não mudou regras de histórico.

## 23. COLLECTIONS

Coleções/Playlists existentes mantêm criação, edição e ordem próprias. Duplo clique rápido em “Criar” reproduziu dois POSTs; guard síncrono em ref e estado `Criando…` deixam apenas uma operação ativa. O mesmo guard foi aplicado ao criador no seletor de playlists. Nenhuma coleção paralela foi introduzida.

## 24. PLAYLISTS

Playlist é entidade da biblioteca da Casa; adicionar playlist à fila é operação explícita (append/next/replace), não sincronização automática. Itens indisponíveis são filtrados pela regra existente; `operationId` pode tornar retry batch idempotente enquanto a instância vive.

## 25. MEDIA_IDENTITY

`mediaIdentity` distingue provider e ID canônico. Ocorrência da Queue usa seu próprio UUID, distinto do ID YouTube/Drive e do registro da biblioteca/histórico. Títulos não são identidade.

## 26. DUPLICATION_POLICY

Duas ocorrências legítimas da mesma mídia podem coexistir; dois usuários com IDs distintos também. Retry com o mesmo ID ainda presente não duplica. Páginas Drive sobrepostas agora são deduplicadas por arquivo, que é diferente de deduplicação global de fila.

## 27. QUEUE_ARCHITECTURE

`RoomStore` autoritativo guarda ordem, item atual, revision e comandos; Socket.IO publica atualizações. React mostra/aciona, mas não é fonte de verdade. Persistência de produção passa por `PrismaMediaRepository`.

## 28. QUEUE_ADD

Adição preserva ocorrência e autor. Repetição intencional com novo UUID funciona; retry do mesmo UUID presente não duplica. Limite de 250 itens permanece.

## 29. QUEUE_PLAY_NEXT

Insere após item atual, sem alterar a identidade desse item. Revision opcional protege conflito quando fornecida. Caso de dois atores é coberto em teste de store.

## 30. QUEUE_REORDER

Reorder usa ID de ocorrência e CAS por revision; rejeita snapshot antigo ou movimentação inválida do item atual. Teste novo de lista com 100 itens confirma isso.

## 31. QUEUE_REMOVE

Remoção existente checa identidade e revision no Socket.IO; item já removido retorna feedback sem remoção arbitrária. Nenhuma alteração de contrato foi necessária nesta etapa.

## 32. QUEUE_CLEAR

Clear remove apenas a espera, preservando a mídia atual. Revision antiga é conflito. Novo teste cobre ambos em fila longa.

## 33. QUEUE_AUTOPLAY

Avanço/autoplay continua no servidor e no estado sincronizado, com indisponíveis tratados pela lógica existente. Não foi criada fila local ou progresso fictício.

## 34. QUEUE_LONG_LISTS

Teste com 100 ocorrências confirma identidade única, ordem mutável e clear seguro; teto existente de 250 não foi alterado. E2E visual histórico M3 cobre fila estreita; carga de 250 itens com usuários hospedados não foi medida.

## 35. QUEUE_CONCURRENCY

Store testa dois atores adicionando mesmo media ID com ocorrências diferentes e operação stale rejeitada. M3 mantém E2E multiusuário para fila. Isso não constitui prova de multi-instância distribuída em produção.

## 36. CAS_REVISION

Revision é comparada em mutações de ordem/clear/batch; o cliente deve atualizar snapshot diante de conflito. `PrismaMediaRepository` usa atualização condicional por revision na gravação. Não houve mudança de schema/migration.

## 37. OPERATION_ID

`operationId` da adição batch é associado ao usuário e deduplicado em cache do processo. Isso não é deduplicação durável: restart pode perder o registro; retry de item individual depois que a ocorrência saiu da fila também pode voltar a adicionar. Débito explícito para política futura, sem alteração arriscada nesta fase.

## 38. SNAPSHOT_RECONNECT

Late join/reconnect recebe snapshot autoritativo e revision. Testes preexistentes de M3/S2 continuam sendo gate de regressão. Nesta fase não foi modificada a sincronização de playback, que pertence à SYNC1.

## 39. PERMISSIONS

HTTP/Socket.IO exigem usuário e Casa/Party elegível; ações respeitam papéis existentes. MEDIA2 não amplia papéis nem simplifica autorização. Auditoria ofensiva completa de Drive/Queue ainda pertence a SEC2.

## 40. PERSISTENCE

Modo local/E2E utiliza storage de teste; produção usa PostgreSQL via Prisma. Testes condicionais de restart PostgreSQL foram **skipped** sem banco de teste, logo esta rodada não certifica persistência hospedada. Nenhuma operação em banco de produção foi feita.

## 41. TRANSACTIONS

Repositório Prisma escreve estado relacionado em transação e faz CAS de revision; a operação de fila não foi reestruturada nesta etapa. Não se reivindica atomicidade entre instâncias além do contrato comprovado pelos testes existentes.

## 42. MULTIUSER

Regressões M2/M3 testam duas sessões locais; teste novo isola dois atores na store. Nenhum segundo login real ou provedores reais foram usados aqui.

## 43. MEDIA1_REGRESSION

MEDIA1 permanece intacta: YouTube iframe, buffering, erro/retry, duração desconhecida, troca de mídia e Drive áudio. Testes de player passaram no gate unitário; E2E completo é registrado abaixo.

## 44. ERROR_RECOVERY

Erro paginado Drive agora retenta a página certa; busca longa mostra causa e não oferece retry sem chance; lista pode receber outra mídia sem travar. Falhas reais de quota/401/codec dependem de provider e não foram provocadas com credenciais reais.

## 45. FEEDBACK

Mantidos `role=alert`/`status` existentes. Criação mostra `Criando…` e botão desabilitado; busca longa comunica limite de 100 caracteres. Texto Drive passou a incluir vídeos e músicas.

## 46. MOBILE

Capturas com conteúdo sintético em 320×568, 360×640, 390×844, 430×932 e 844×390; asserção de ausência de overflow horizontal. A aba Drive permanece acessível por rolagem horizontal do cabeçalho. Player/Chat não foram redesenhados.

## 47. ACCESSIBILITY

Labels/roles do Hub preservados, feedback de erro/status observável, botões em andamento desabilitados. Auditoria WCAG manual completa e teste com leitor de tela não foram executados.

## 48. PERFORMANCE

Busca A/B usa abort/generation para não renderizar resposta obsoleta. Drive usa cache limitado e paginação; merge por mapa é linear por página. Não foram medidos Core Web Vitals nem quota real.

## 49. YOUTUBE_REAL_VALIDATION

**UNVERIFIED.** E2E interceptou a API com resposta sintética para testar concorrência e UI; não pesquisou a Data API real nem verificou embed de conteúdo hospedado. Nenhuma credencial foi lida ou alterada.

## 50. DRIVE_REAL_VALIDATION

**UNVERIFIED.** E2E usou status/listagem sintéticos, sem OAuth real, bytes Range, grants/tickets ou arquivo privado real. Testes de integração existentes desses mecanismos passaram localmente, mas não provam a conta hospedada.

## 51. EVIDENCE_MATRIX

| Área | Evidência | Limite |
| --- | --- | --- |
| Link YouTube/Drive | 2 testes unitários novos, red→green | Sem provider remoto |
| Busca rápida/longa | E2E sintético, red→green para erro longo | Sem quota real |
| Drive página 2 | E2E 503→retry e dedup, red→green | Sem API Drive real |
| Coleção duplo clique | E2E conta POSTs, red→green | Uma sessão local |
| Queue CAS/identidade | 2 testes de store novos + M3 | Sem cluster hospedado |
| Visual | Capturas `artifacts/media2/` | Fixtures sintéticos |

## 52. FINDINGS

Quatro defeitos reproduzidos: retry do Drive voltava à página 1; consulta longa recebia mensagem enganosa; parser aceitava URL parcialmente válida/referência Drive em domínio falso; duplo clique criava duas coleções. Concorrência de busca A/B já estava correta e foi congelada em E2E. Limitações de dedup durável da Queue não foram confundidas com defeito resolvido.

## 53. FIXES

`apps/web/src/components/MediaHub.tsx`: retry paginado, dedup Drive, validação/feedback de busca, guarda de criação, texto de áudio. `apps/web/src/media/MediaResolver.ts`: URL/ID estritos. `apps/server/src/index.ts`: erro 100 caracteres específico. Sem schema, migration ou player modificado.

## 54. TESTS_ADDED

`apps/web/src/media/MediaResolver.test.ts`: 2 testes. `apps/server/src/store.test.ts`: 2 cenários de fila. `e2e/party.spec.ts`: um cenário MEDIA2 abrangendo Drive paginado, busca, duplo clique e viewports. Casos críticos foram observados falhar antes da correção e passar depois.

## 55. VISUAL_QA

Inspecionadas capturas de Drive áudio desktop/mobile, busca B vencedora, coleção desktop/mobile e fila M3 mobile. Nenhum overflow, truncamento impeditivo ou mudança FF3.1 observados. Navegador local padrão em `localhost:5173` hospedava outro projeto nesta máquina, portanto não foi usado como evidência do Lumio; as capturas do E2E isolado são a prova visual válida.

## 56. FINAL_TEST_GATES

`npm run typecheck`: PASS. `npm run lint`: PASS. `npm run build`: PASS. `npm test`: PASS (6 testes PostgreSQL condicionais skipped). `npm run test:e2e`: **17/17 PASS** em 4,1 min. `git diff --check`: PASS. Não interpretar skips como execução PostgreSQL.

## 57. DIFF_REVIEW

Diff restrito a resolver, Hub, mensagem de validação, testes e documentação. Sem dependências novas, migrations, escopos OAuth, credenciais, alteração de produção, commit, push ou deploy. As quatro capturas históricas regravadas pelo Playwright foram restauradas de HEAD; as evidências novas ficam em `artifacts/media2/`.

## 58. KNOWN_DEBT

Validar YouTube e Drive reais com conta autorizada; testar PostgreSQL de teste/restart e acesso privado entre usuários; medir fila em 250 itens/cluster; especificar dedup durável para `operationId` e retries após retirada do item; testar leitor de tela. SYNC1 deve tratar confiabilidade de playback multiusuário, sem assumir que MEDIA2 a certificou.

## 59. FINAL_VERDICT

**MEDIA2 LOCAL PASS — REAL PROVIDER VALIDATION PENDING — READY FOR SYNC1.** Não há afirmação de certificação de produção.
