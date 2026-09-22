# Lumio Media Hub V2

## Escopo

O Media Hub é o centro de mídia da Casa. Ele reúne descoberta, biblioteca compartilhada, favoritos compartilhados, histórico e playlists sem criar outra sala ou desmontar o player atual.

## Conceitos

- `MediaItem`: representação canônica identificada por `provider + providerMediaId`.
- `HouseLibraryItem`: mídia que alguém decidiu guardar na Casa.
- `HouseFavorite`: marca compartilhada da Casa; favoritar também garante que a mídia esteja na biblioteca.
- `HouseHistoryEntry`: registro criado na primeira transição real para playback de uma mídia.
- `Playlist` e `PlaylistItem`: coleção persistente e ordenada da Casa.
- `QueueItem`: ocorrência colaborativa na fila da Party, com autor, posição, status e horário.

Biblioteca, favorito, histórico, playlist e fila são estados independentes. Adicionar à fila não salva automaticamente na biblioteca e adicionar à playlist não favorita.

## API

- `GET /api/media-hub/:roomId` — resumo paginado, filtros, histórico e playlists.
- `POST|DELETE /api/media-hub/:roomId/library` — salva ou remove da biblioteca.
- `POST /api/media-hub/:roomId/favorite` — alterna favorito compartilhado.
- `POST /api/media-hub/:roomId/playlists` — cria playlist.
- `GET|PATCH|DELETE /api/media-hub/:roomId/playlists/:playlistId` — detalhe, edição e exclusão.
- `POST|DELETE /api/media-hub/:roomId/playlists/:playlistId/items` — itens da playlist.
- `PUT /api/media-hub/:roomId/playlists/:playlistId/order` — ordem completa validada pelo servidor.
- `POST /api/media-hub/:roomId/playlists/:playlistId/queue` — adiciona ao final, a seguir, substitui ou reproduz.

Todos os endpoints validam sessão, membership e permissões no backend.

## Realtime e fila

Cada mutação incrementa `queueRevision`. Reordenações com revisão obsoleta são rejeitadas e o servidor retransmite a ordem atual, permitindo rollback/convergência no cliente.

Eventos principais:

- `queue:update(queue, revision)`
- `queue:play-next`
- `queue:clear`
- `queue:advance`
- `media-hub:update`

O provider envia `ended`; o cliente solicita `queue:advance` com a mídia esperada. Depois do primeiro avanço, pedidos concorrentes com o ID anterior se tornam no-op. O servidor registra histórico, escolhe o próximo item, atualiza fila/revisão e transmite mídia e fila.

## Lumio Player e sincronização

O servidor é a autoridade do playback. Cada estado de mídia possui uma `revision` monotônica, e comandos compartilhados incluem `mediaId`, `revision` e `operationId`. O servidor descarta comandos referentes a outra mídia ou a uma revisão já ultrapassada.

O tráfego realtime é orientado a eventos: `play`, `pause`, `seek`, `rate`, mudança de mídia, entrada/reconexão, retorno de background e checkpoints esparsos. O tempo corrente lido do provider serve apenas à UI local e não é publicado em polling. Ao retornar de background, o cliente pede o snapshot autoritativo e converge sem transformar a correção em um novo comando.

Volume e mute são preferências locais. Play, pause, seek e velocidade pertencem à Party. O avanço automático respeita `RoomSettings.autoplayNext`; com a opção desligada, a mídia termina e o próximo item permanece na fila.

O YouTube usa apenas o IFrame Player API oficial. O adapter de Google Drive existente é uma preparação técnica; seleção de arquivos, OAuth e a experiência completa de provider continuam reservados para a Etapa 9.

## Experiência musical

A opção local “Visualização: Ambiente” adiciona capa, título, criador e fundo discreto ao palco. Ela não cria outro player, não reinicia o conteúdo e não altera a preferência dos demais participantes. YouTube continua no iframe oficial existente.

## Persistência

O schema Prisma e a migration `0005_media_hub_v2` definem mídia canônica, playlists, favoritos da Casa, posições, índices e revisão da fila. O servidor atual ainda usa o adapter em memória; refresh do navegador preserva dados, mas reiniciar a API os apaga.

## Validação da Etapa 7

- Typecheck, lint, 21 testes e build passaram.
- Fluxo real validado no navegador: signup, criação de Casa, busca real no YouTube, salvar, favoritar, criar playlist, adicionar item, reproduzir playlist, abrir Media Hub durante playback, convite, segundo membro, biblioteca/favorito compartilhados, reproduzir a seguir e avanço da fila.
- Auditoria axe do Media Hub: zero violações após ajuste de contraste.
- Limitação da validação: a automação confirmou duas identidades sequencialmente, mas não manteve três browsers concorrentes ativos para um teste de corrida visual completo. As regras de revisão e avanço idempotente estão cobertas por testes de domínio.
