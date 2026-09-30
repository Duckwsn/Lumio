# PÓS-1.0 — M2 Social Library

Data: 30/09/2026. Execução local, sem commit, push, deploy ou operação no banco de produção por este trabalho. No início o HEAD era `5be462d` com M1 não commitado; durante a execução o usuário publicou M1 como `128db67`. Nenhuma alteração M1 foi descartada.

## STATUS

Implementação M2 local concluída, sujeita à revisão e à homologação manual indicada abaixo. A Social Library reutiliza o Media Hub e o domínio de Casa já existentes. Nenhuma funcionalidade M3 ou GX foi implementada. Os gates finais constam em TESTS/E2E.

## BASELINE

Antes das alterações M2: `npm run typecheck`, `npm run lint`, `npm run build` e `npm test` aprovados; 158 testes passaram e seis testes PostgreSQL condicionais foram ignorados. `npm run test:e2e`: 12/12 aprovados. `git diff --check`: aprovado. Checkout M1 ainda tinha alterações locais, posteriormente commitadas pelo usuário enquanto o M2 prosseguia.

## AUDIT

O inventário foi feito sobre código, endpoints, socket, UI e schema existentes antes de escolher a implementação.

## EXISTING_LIBRARY_FEATURES

| Recurso antes do M2 | Classificação | Decisão |
|---|---|---|
| Histórico por ocorrência de play, usado também pela fila/Previous | Existente e funcional; apresentação repetitiva | Preservar ocorrências internas, deduplicar apenas a projeção social. |
| Biblioteca por Casa e catálogo canônico de `MediaItem` | Existente e funcional | Reutilizar. |
| Favoritos da Casa | Existente mas incompleto: `POST` toggle não era idempotente | Trocar por set/unset explícitos. |
| Playlists, itens únicos, CRUD, ordem e fila em lote | Reutilizável; edição de nome sem versão | Tratar como coleções M2 e exigir versão na edição. |
| Progresso pessoal/continue watching | Existente e funcional | Não transformar em favorito pessoal. |
| Hub com Descobrir/Biblioteca/Playlists/Histórico/Drive | Existente e funcional | Ajustar fluxos/estados, sem reconstrução. |
| YouTube Data API e IFrame Player | Existentes | Não adicionar provider/scraping. |
| Drive OAuth, navegação Meu Drive, grants/tickets e streaming Range | Existentes; projeção de biblioteca expunha metadata privada | Manter autorização, restringir projeção e busca. |
| House Activity, Presence V2, Call, Games | Existentes e fora do domínio M2 | Não acoplar nem emitir novo feed/presença. |
| Queue V2, favorito pessoal novo, GX | Fora do M2 | Não implementar. |

## ARCHITECTURE

A Social Library usa os contratos e repositórios do Media Hub existente; não cria runtime próprio nem conexão de realtime separada.

## HOUSE_OWNERSHIP

Dados de biblioteca são indexados pelo identificador da Casa (`groupId`/`houseId`), não por React, Call, jogo ou apresentação do MainStage. A Party primária gera eventos reais de reprodução. `RoomStore` mantém estado ativo e agregados por Casa; em produção `PrismaMediaRepository` persiste histórico, catálogo, favoritos, biblioteca e playlists. A UI atual é consumidora dos contratos `/api/media-hub/:roomId`, não proprietária dos dados. O backend deriva a Casa do `roomId` e revalida membership.

## DATA_MODEL

Reutilizados os modelos `MediaHistory`, `GroupLibraryItem`, `MediaItem`, `HouseFavorite`, `Playlist` e `PlaylistItem`. `GroupLibraryItem` é único por `(groupId, provider, providerMediaId)`; `MediaItem` por `(provider, providerMediaId)`; `HouseFavorite` por `(groupId, mediaId)`; `PlaylistItem` por `(playlistId, mediaId)` e `(playlistId, position)`. Índice de histórico `(roomId, playedAt)`, de coleção `(groupId, updatedAt)` e de ordem `(playlistId, position)`. Relações de Casa/Party/Playlist têm cascades pertinentes; catálogo `MediaItem` permanece referenciado.

## DATABASE_MIGRATIONS

M2 não altera schema Prisma nem cria migration: a estrutura existente cobre a necessidade. Nenhuma migration foi aplicada em produção.

## MEDIA_IDENTITY

`provider + providerMediaId` é a identidade canônica. Títulos iguais podem representar mídias distintas e não são chave. Duplicatas intencionais continuam permitidas na fila, mas não em favoritos ou numa mesma coleção.

## HISTORY

`RoomStore.recordHistory` registra a primeira transição autoritativa para `play` de uma ocorrência na fila. Replay após `ended` gera nova ocorrência legítima. Pesquisa, navegação Drive, thumbnail, enqueue sem reprodução, pause, seek, buffering, heartbeat e reconexão não criam histórico. O runtime guarda até 300 ocorrências por Party para o comportamento de Previous. A Social Library agrega por identidade canônica dentro dessa janela, mostra última reprodução e `playCount`, ordena da mais recente para a mais antiga e oferece paginação com até 60 registros por consulta; Hub carrega 30 por página e bootstrap limita recentes a 50. A contagem é da janela retida, não vitalícia. O histórico Socket.IO é limitado e redige referências Drive privadas.

## FAVORITES

Favoritos são compartilhados por Casa. `PUT /favorite` salva, `DELETE /favorite` remove; o antigo `POST` é alias idempotente de salvar, não toggle. O backend emite atualização e persiste apenas quando o estado muda. Biblioteca e banco têm chaves únicas, impedindo duplicata até com dois membros. Player/Now Playing consulta um endpoint pequeno de status por identidade, faz set/unset somente após confirmação e exibe erro sem confirmar visualmente operação falha. Hub, histórico e coleções reutilizam ação Heart; remover favorito não remove mídia da biblioteca/coleção.

## COLLECTIONS

Coleções reutilizam Playlists compartilhadas: criar, abrir, renomear/descrição opcional, adicionar/remover mídia, excluir, reordenar e ação individual de fila. Há controle alternativo de ordem por botões além de drag-and-drop. Renomear e reordenar usam `expectedUpdatedAt`: versão obsoleta devolve 409, sem sobrescrever a edição alheia. Uma coleção aberta e excluída por outro membro retorna à lista com aviso. Limites: 50 coleções por Casa e 500 mídias únicas por coleção. A fila em lote anterior continua disponível; M2 não implementa Queue V2. Estado vazio e miniatura ausente têm fallback.

## PERMISSIONS

| Ação | HOST | ADMIN | MEMBER | GUEST/não membro |
|---|---|---|---|---|
| Ver Hub/histórico/coleções | Sim | Sim | Sim | Não |
| Salvar/remover biblioteca e favoritos (`LIBRARY_MANAGE`) | Sim | Sim | Sim | Não |
| Criar/editar coleção e itens (`PLAYLIST_CREATE/EDIT`) | Sim | Sim | Sim | Não |
| Excluir coleção (`PLAYLIST_DELETE`) | Sim | Sim | Não | Não |
| Adicionar mídia à fila (`MEDIA_ADD`) | Sim | Sim | Sim | Não |
| PlayNow/substituir fila | Conforme política da Party | Conforme política | Conforme política | Não |

Servidor é autoridade; esconder/desabilitar botões no cliente não substitui `requireRoomMember` e `requireRoomPermission`. Os papéis e permissões existentes não foram modificados.

## YOUTUBE

Escritas M2 aceitam somente ID YouTube válido de 11 caracteres, título limitado a 180 caracteres, `channelTitle` limitado a 120, duração finita até 24 h e thumbnail oficial `i.ytimg.com`. URL/thumbnail arbitrárias enviadas para salvar não são persistidas. Não há scraping, URL extraída de playback, artista/álbum/gênero inventados nem novo escopo. O título vindo do cliente permanece texto sanitizado/limitado, não é uma verificação remota de metadata; ver limitações.

## DRIVE_PRIVACY

Salvar Drive exige que o próprio usuário resolva o arquivo via OAuth autorizado; persiste ID, título obtido do Drive, tipo, duração e MIME necessários, nunca tokens, ticket, header, URL de stream ou credencial. Para outro membro da Casa, a projeção troca título por “Arquivo privado do Google Drive” e omite thumbnail, duração, MIME, metadata, criador e URL. A busca filtra **depois** dessa projeção, impedindo inferência do nome pelo total/resultados. Eventos `queue:history` enviados a toda a Party também são redigidos.

## DRIVE_AUTHORIZATION

Referência salva **não concede acesso**. A disponibilidade de fila é reavaliada pelo grant temporário existente, pela conexão ativa do dono e pela membership dele; sem grant o item é marcado “Acesso necessário” e a ação de fila é desabilitada/recusada. Se o proprietário explicitamente adiciona o arquivo à fila e cria grant, o modelo Drive existente permite aos membros autorizados da Party reprodução temporária via ticket/cookie — isso é ação separada de salvar na biblioteca. Grant revogado/expirado, desconexão ou arquivo removido devem falhar de forma controlada na fila/player sem derrubar Party. OAuth e scopes permanecem inalterados.

## API_CONTRACT

- `GET /api/media-hub/:roomId`: biblioteca paginada (1–60), favoritos, recentes até 50, resumo de coleções até 50; filtro/busca autorizados.
- `GET /api/media-hub/:roomId/history`: recentes deduplicados, paginação 1–60.
- `GET /api/media-hub/:roomId/status?provider=...&providerMediaId=...`: estado pequeno para Now Playing.
- `POST/DELETE /api/media-hub/:roomId/library`: salvar/remover item.
- `PUT/DELETE /api/media-hub/:roomId/favorite`: set/unset; `POST` legado significa set.
- `POST /playlists`, `GET/PATCH/DELETE /playlists/:playlistId`, `POST/DELETE /playlists/:playlistId/items`, `PUT /playlists/:playlistId/order`: contratos de coleção existentes reforçados com validação, rate limit, limites e versão para rename/order.
- `POST /playlists/:playlistId/queue`: fluxo de fila existente, com revisão e verificação de disponibilidade; não há escrita direta no provider.

Todos exigem sessão verificada e membership derivada do roomId. IDs, provider, metadata, nome, posição e paginação são validados. Escritas reutilizam `apiRateLimit` (30/min para criação/exclusão de coleção; 60/min para favorito, biblioteca e demais edições). `GET` não publica a biblioteca no Home/House Activity.

## REALTIME

Não há segundo socket. `media-hub:update` envia somente `{houseId, kind}` para a room Socket.IO da Party afetada; não transmite a biblioteca inteira. Clientes reconsultam dados autorizados após evento.

## MULTI_HOUSE_ISOLATION

Sockets de outra Casa não recebem evento; REST da Casa X devolve 403 a C pertencente somente à Y. Remoção de membro passa pelas mesmas verificações de membership e pela política de sockets existente; um ID antigo de coleção não autoriza novo GET.

## RECONNECT

`App` incrementa revisão do Hub também ao receber snapshot de recuperação; o Hub descarta respostas de refetch antigas por geração. A/B/C convergem por evento ou refetch na entrada/reconexão.

## CONCURRENCY

Set/unset de favorito e inclusão de item são idempotentes por identidade. No runtime de um processo, operações são serializadas pela ordem de requisições; índices únicos do Prisma reforçam integridade. Rename/order usam comparação `updatedAt` e 409 para estado obsoleto. Remoção simultânea de item é idempotente se a coleção ainda existe; coleção excluída retorna 404 e fecha a vista no cliente após atualização. O adapter de mídia ainda trabalha por snapshots de Casa e não foi redesenhado para múltiplas instâncias de API concorrentes; ver limitações.

## MEDIA_HUB_INTEGRATION

As cinco áreas existentes continuam. Biblioteca ganhou vazio específico para favoritos, histórico mostra contagem, coleções oferecem fila/favorito por item e estado de acesso necessário.

## PLAYER_INTEGRATION

Now Playing ganhou apenas um botão discreto de favorito, fora do palco e dos controles do UniversalPlayer. Abrir o Hub não remonta o player, Chat ou Call; a mídia não é reproduzida diretamente por componente de biblioteca.

## QUEUE_INTEGRATION

Toda entrada na fila passa pelo socket/endpoint autoritativo existente, com políticas de controle e revisão.

## MOBILE

Inspecionados desktop e 320/360/375/390/412/430 px. A coleção aberta usa linha compacta e ações em segunda linha no mobile; não há scroll horizontal acidental no documento/Hub nas larguras verificadas. Navegação por tabs continua rolável, fechamento retorna à Party.

## ACCESSIBILITY

Botão Heart possui `aria-label`/`aria-pressed`; estado salvo é comunicado também em texto no Now Playing. Ações de ordem/remover têm nomes acessíveis e alvos mínimos de 44 px no mobile. Formulário de edição recebeu labels explícitos. Erros/feedback usam regiões `alert`/`status`. Leitor de tela e teclado físico em dispositivo real ainda requerem homologação humana.

## PERFORMANCE

Sem polling por tick ou busca a cada seek. Now Playing consulta status só quando identidade/revisão do Hub muda. Biblioteca e histórico paginados; coleções só carregam itens ao abrir; dados resumidos de listas são limitados. Eventos Socket.IO transportam apenas aviso pequeno. O runtime conserva limites físicos de 300 ocorrências, 500 itens da biblioteca, 50 coleções e 500 itens por coleção.

## SECURITY

Filtros Drive operam sobre projeção autorizada. Sem novos secrets, dependências, scopes ou endpoints de upload. Gravações passam por validação, membership, permissão e rate limit. Arte YouTube salva usa domínio oficial.

## S1_S2_REGRESSION

M2 não modifica S1/S2, rotas da Casa ou presença.

## M1_REGRESSION

UniversalPlayer/adapters, sync, fullscreen e Ambiente não foram alterados. O Hub abre como overlay sem desmontar MainStage.

## GAMES_REGRESSION

Runtimes e protocolos de Games não foram alterados; a suíte E2E anterior cobre as partidas existentes.

## CALL_REGRESSION

WebRTC e permissões de microfone não foram alterados; o Hub não desmonta a Call. Homologação em rede real ainda pendente.

## FUTURE_GX_COMPATIBILITY

Modelo/API de Casa podem ser consumidos por uma futura Media Party sem migrar conceitos; M2 não implementa GX.

## TESTS

- Baseline: 158 pass, 6 skips PostgreSQL; 12/12 E2E.
- Final: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `git diff --check` aprovados. `npm test`: servidor 128 pass/6 skip, web 37 pass, total 165 pass/6 skip/0 fail.
- Testes M2 novos: identidade/dedup/ordem/Drive redigido; favorito idempotente e isolamento; coleção com versão, item único, remoção e exclusão; busca Drive sem oráculo de nome; HTTP/Socket com membros A/B em X e C em Y, alteração compartilhada, reconnect, permissão de exclusão e conflito 409.
- Uma extensão do cenário visual M2 inicialmente expirou porque o menu “Mais opções” permanecia aberto sobre o botão de fila após cancelar edição; o trace mostrou a interceptação do clique. O roteiro passou após fechar o menu; nenhuma mudança de produto foi necessária. Uma execução de `npm test` em paralelo à suíte E2E apresentou três timeouts de inicialização em integrações antigas de sockets (Cards, Draw e S1/S2). A repetição isolada de `npm test` passou com 165 pass/6 skip/0 fail, indicando contenção de recursos como causa provável; os testes não foram reduzidos.
- PostgreSQL condicional não foi executado sem instância de teste; testes de Drive usam mock, não conta real. Nenhuma escrita em produção.

## MULTI_CLIENT

A/B/C autenticados: A salva favorito pelo Now Playing, B vê no Hub e cria coleção, A adiciona mídia, B adiciona item à fila, C entra tardiamente. Teste HTTP/Socket adicional cobre Casa X/Y, permissão, CAS e reconnect.

## E2E

O cenário M2 com três navegadores e seis larguras móveis passou na repetição direcionada (1/1). A suíte completa após a ampliação visual passou **13/13**, incluindo regressões S1/S2, Games, Call, mobile e M1 (8,3 minutos).

## VISUAL_QA

Capturas **abertas e inspecionadas** em `artifacts/m2/` (pasta local ignorada no Git): baseline `hub-desktop-before.png`, `library-empty-before.png`, `playlists-empty-before.png`, `history-empty-before.png`, `hub-320-before.png`, `hub-390-before.png`, `hub-430-before.png`; depois `hub-desktop-after.png`, `m2-hub-open-desktop.png`, `m2-favorites-desktop.png`, `m2-favorites-empty.png`, `m2-recents-desktop.png`, `m2-drive-unavailable.png`, `m2-create-collection.png`, `m2-edit-collection.png`, `m2-collection-empty.png`, `m2-add-to-collection.png`, `m2-collection-open-desktop.png`, `m2-collection-320.png`, `m2-collection-360.png`, `m2-collection-375.png`, `m2-collection-390.png`, `m2-collection-412.png`, `m2-collection-430.png`, `m2-error.png` e `m2-party-player-preserved.png`. O screenshot com YouTube real no navegador de QA local falhou por limitação do iframe; os estados povoados e mobile foram capturados pelo E2E isolado e inspecionados, sem tratar falha do embed headless como falha de layout. Não há overflow observado.

## KNOWN_LIMITATIONS

1. Homologar com duas contas Google reais: A com Drive, B sem conexão/permissão, grant ativo e revogado, arquivo removido, expiração, Range/seek e erro de quota. A suíte local não prova permissões reais do Google.
2. Projeção de biblioteca evita nome privado, mas a referência de arquivo e o fato de existir item restrito são visíveis a membros da Casa; não use a biblioteca para esconder a própria existência de um item. Também um arquivo explicitamente enfileirado via grant pode ser visto pela Party conforme o desenho Drive anterior.
3. Adapter Prisma de mídia persiste snapshots no modelo de processo único. Concorrência horizontal em várias réplicas não foi homologada; limites de 50×500 coleções não equivalem a benchmark de escrita em carga.
4. Testes PostgreSQL estão condicionais/skip neste ambiente; fazer ensaio com banco descartável e backup antes de produção. Não houve migration M2.
5. YouTube salvo aceita título textual limitado do cliente, sem nova chamada de validação remota; não constitui certificação da metadata. Embed YouTube real pode estar indisponível em headless/por política do vídeo.
6. Homologar Android/iOS/PWA, teclado virtual, leitor de tela, Call WAN/TURN e reconexões de rede reais. Ações de biblioteca não devem disparar nova captura de microfone.

## MANUAL_REQUIRED

As verificações 1, 4 e 6 acima exigem homologação manual antes de publicar a etapa; não foram simuladas como se fossem testes com serviços reais.

## FILES_CHANGED

`packages/shared/src/index.ts`; `apps/server/src/socialLibrary.ts`, `socialLibrary.test.ts`, `socialLibrary.integration.test.ts`, `store.ts`, `store.test.ts`, `index.ts`; `apps/web/src/components/NowPlayingFavorite.tsx`, `MediaHub.tsx`, `App.tsx`, `styles.css`; `e2e/party.spec.ts`; `.gitignore`; `docs/AGENT.MD`, `docs/MEDIA_HUB.md`, `docs/GOOGLE_DRIVE.md` e este relatório. Alterações M1 iniciais pertenciam ao usuário e foram preservadas.

## RESPOSTAS OBRIGATÓRIAS (1–50)

1. Já existiam biblioteca, favoritos, histórico, playlists, Media Hub, catálogo, progresso e fila; ver AUDIT.
2. Todos esses componentes foram reutilizados, além de OAuth/grants Drive e permissões da Casa.
3. Modelo final: recentes deduplicados, favoritos da Casa e coleções compartilhadas (Playlists).
4. Pertence à Casa; a Party gera os eventos de playback.
5. Identidade: par provider + providerMediaId, nunca título.
6. Primeira transição autoritativa para play de uma ocorrência e replay após ended.
7. Não, pesquisar não gera histórico.
8. Não, enfileirar sozinho não gera histórico.
9. Agrega ocorrências por identidade, conserva última data e contagem na janela.
10. 300 ocorrências persistidas no runtime por Party; consulta deduplicada em páginas até 60, Hub 30; resumo 50.
11. Compartilhados por Casa; não foi criado favorito pessoal novo.
12. Set/unset idempotente, mapa do runtime e unique `(groupId, mediaId)` no Prisma.
13. Playlists existentes viraram coleções com CRUD e itens únicos.
14. Sim, `position` persistida; ordem exige versão e itens completos.
15. Ver tabela PERMISSIONS; MEMBER não exclui coleção.
16. Nenhuma migration M2.
17. Nenhuma migration aplicada em produção.
18. ID, título limitado, channelTitle quando disponível, thumbnail oficial e duração válida; sem playback URL.
19. ID, título obtido do Drive, tipo, duração e MIME necessários; nunca credenciais/ticket/URL privada.
20. Não. Favorito/referência Drive não cria grant.
21. Redação de nome/thumbnail/duração/MIME/metadata/URL para outro membro; busca pós-projeção.
22. Grant expirado torna item indisponível até nova autorização/seleção; fila/player recusam sem derrubar Party.
23. Arquivo removido falha na resolução/reprodução e requer remoção/reseleção; não é assumido disponível pela metadata salva.
24. Ver API_CONTRACT: GET Hub/histórico/status, biblioteca, favorito, playlists e fila existentes/reforçados.
25. `requireRoomMember/Permission` consulta Casa do roomId e papel do usuário autenticado.
26. Evento pequeno `media-hub:update`, seguido de refetch autenticado.
27. Não há novo socket.
28. A/B recebem evento da Party X; C entra depois e lê estado atual autorizado. C de outra Casa não recebe X.
29. Snapshot recuperado incrementa revisão e refetch; geração impede resposta antiga sobrescrever nova.
30. Set/unset e item add idempotentes; rename/order CAS 409; delete 404/idempotência de item.
31. Dados e broadcast são por Casa/room, com REST 403 fora da membership.
32. Perde REST/Socket conforme regras existentes de revogação; ID antigo não permite GET.
33. Reutiliza cinco áreas e seus cards/ações; sem segunda aplicação.
34. Now Playing consulta status pequeno, envia PUT/DELETE, confirma após resposta, mostra erro sem sucesso falso.
35. Ação Fila do item usa API/socket existente e checks do servidor.
36. Não altera diretamente provider.
37. Não; E2E verificou mídia atual igual durante ações de biblioteca.
38. Sim, a Call permanece na árvore; homologação WAN manual pendente.
39. Sim; nenhuma presença de biblioteca criada.
40. Não; runtimes/protocolos de Games não alterados.
41. Sim; M1/UniversalPlayer não foram reescritos e suíte de regressão passou.
42. Não; contratos/dados pertencem à Casa.
43. Sim, a futura Media Party pode consumir os mesmos contratos.
44. Nenhuma dependência nova.
45. Nenhuma mudança de OAuth ou scopes Drive.
46. Final: 165 pass, 0 fail, 6 skip condicionais PostgreSQL.
47. 13/13 E2E aprovados.
48. Ver lista explícita em VISUAL_QA; imagens 320/390/430, desktop, favoritos vazios/povoados, recentes, coleção vazia/aberta, criação/edição, erro e Drive foram abertas.
49. Ver KNOWN_LIMITATIONS: Drive real, PostgreSQL, multi-instância, metadata YouTube e dispositivos.
50. Homologar Google Drive real A/B, rede/Call, aparelhos móveis/PWA/acessibilidade e banco descartável/backup antes de release.

**Resultado E2E final:** 13 aprovados, 0 falhas, 0 skips (suíte completa).
