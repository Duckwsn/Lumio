# Lumio Media Hub V3

> Registro histórico das etapas 7/8/14. As afirmações abaixo de que fila, biblioteca e playlists ainda vivem só em memória foram superadas pela Etapa 18: o runtime atual usa PostgreSQL quando `PERSISTENCE_MODE=postgres`. Consulte [DEPLOYMENT_18.md](DEPLOYMENT_18.md) e [DEPLOY_HANDOFF_REPORTS.md](DEPLOY_HANDOFF_REPORTS.md) para o estado presente.

## Escopo

O Media Hub é o centro de mídia da Casa. Ele reúne descoberta, biblioteca compartilhada, favoritos compartilhados, histórico e playlists sem criar outra sala ou desmontar o player atual.

## Conceitos

- `MediaItem`: representação canônica identificada por `provider + providerMediaId`.
- `HouseLibraryItem`: mídia que alguém decidiu guardar na Casa.
- `HouseFavorite`: marca compartilhada da Casa; favoritar também garante que a mídia esteja na biblioteca.
- `HouseHistoryEntry`: registro criado na primeira transição real para playback de uma mídia.
- `Playlist` e `PlaylistItem`: coleção ordenada da Casa; no runtime atual ainda é mantida em memória.
- `QueueItem`: ocorrência colaborativa na fila da Party, com autor, posição, status e horário.

Biblioteca, favorito, histórico, playlist e fila são estados independentes. Adicionar à fila não salva automaticamente na biblioteca e adicionar à playlist não favorita.

## API

- `GET /api/media-hub/:roomId` — resumo paginado, filtros, histórico e playlists.
- `GET /api/media-hub/:roomId/history?cursor=&limit=` — histórico paginado da Casa, mais recente primeiro.
- `POST|DELETE /api/media-hub/:roomId/library` — salva ou remove da biblioteca.
- `POST /api/media-hub/:roomId/favorite` — alterna favorito compartilhado.
- `POST /api/media-hub/:roomId/playlists` — cria playlist.
- `GET|PATCH|DELETE /api/media-hub/:roomId/playlists/:playlistId` — detalhe, edição e exclusão.
- `POST|DELETE /api/media-hub/:roomId/playlists/:playlistId/items` — itens da playlist.
- `PUT /api/media-hub/:roomId/playlists/:playlistId/order` — ordem completa com `expectedUpdatedAt`; conflito `409` exige carregar a versão atual.
- `POST /api/media-hub/:roomId/playlists/:playlistId/queue` — adiciona ao final, a seguir, substitui ou reproduz; requer `revision` da fila e devolve quantidade de itens indisponíveis ignorados.

Todos os endpoints validam sessão, membership e permissões no backend.

## Realtime e fila

Cada mutação incrementa `queueRevision`. Reordenações com revisão obsoleta são rejeitadas e o servidor retransmite a ordem atual, permitindo rollback/convergência no cliente. A mesma mídia pode aparecer mais de uma vez na fila: cada ocorrência possui `QueueItem.id` próprio. O status de reprodução, a remoção, o avanço e o `ENDED` referem-se à ocorrência, não apenas ao par provider/media ID.

Eventos principais:

- `queue:update(queue, revision)`
- `queue:play-next`
- `queue:clear`
- `queue:advance`
- `media-hub:update`

O provider envia `ended`; o cliente solicita `queue:advance` com mídia e ocorrência esperadas. Depois do primeiro avanço, pedidos concorrentes tornam-se no-op. O histórico é criado somente no primeiro `play` da ocorrência, não em `seek`, reconexão ou entrada na fila. O servidor pula itens indisponíveis de forma limitada pelo tamanho da fila e transmite mídia e fila.

## Lumio Player e sincronização

O servidor é a autoridade do playback. Cada estado de mídia possui uma `revision` monotônica, e comandos compartilhados incluem `mediaId`, `revision` e `operationId`. O servidor descarta comandos referentes a outra mídia ou a uma revisão já ultrapassada.

O tráfego realtime é orientado a eventos: `play`, `pause`, `seek`, `rate`, mudança de mídia, entrada/reconexão, retorno de background e checkpoints esparsos. O tempo corrente lido do provider serve apenas à UI local e não é publicado em polling. Ao retornar de background, o cliente pede o snapshot autoritativo e converge sem transformar a correção em um novo comando.

Volume e mute são preferências locais. Play, pause, seek e velocidade pertencem à Party. O avanço automático respeita `RoomSettings.autoplayNext`; com a opção desligada, a mídia termina e o próximo item permanece na fila.

O YouTube usa apenas o IFrame Player API oficial. O Google Drive usa OAuth separado da autenticação Lumio, um explorador por pastas no Media Hub e streaming protegido pelo backend; consulte `docs/GOOGLE_DRIVE.md` para configuração e limitações.

## Experiência musical

A opção local “Visualização: Ambiente” adiciona capa, título, criador e fundo discreto ao palco. Ela não cria outro player, não reinicia o conteúdo e não altera a preferência dos demais participantes. YouTube continua no iframe oficial existente.

## Persistência

O schema Prisma e a migration `0005_media_hub_v2` definem mídia canônica, playlists, favoritos da Casa, posições, índices e revisão da fila. O servidor atual ainda usa o adapter em memória; refresh do navegador preserva dados, mas reiniciar a API os apaga.

## Fluxo V3 e limites

- Cinco áreas: Descobrir, Biblioteca, Playlists, Histórico e Google Drive. Descobrir pesquisa apenas YouTube com debounce, cancelamento, geração de request e paginação. Trocar de aba não apaga a consulta digitada.
- A biblioteca pesquisa apenas os itens da Casa no backend local, com filtros e paginação. Favoritos são calculados para toda a biblioteca, não somente para a primeira página.
- Google Drive só consulta status e lista pastas ao abrir sua aba. Não há busca no Drive. Os vídeos usam as mesmas ações contextuais do YouTube; um `fileId` continua sem conceder acesso sozinho.
- Adição à fila e início de reprodução aguardam confirmação do servidor antes do feedback positivo. Playlist para fila é um lote com revisão; itens do Drive sem grant ativo são ignorados e relatados. Replay após `ended` reinicia do começo e cria um novo evento legítimo no histórico.
- O servidor valida acesso e permissões mesmo que a interface oculte ações. A playlist continua sem duplicatas de mídia por regra atual; a fila aceita duplicatas intencionais.
- A migração do adapter de Casa/Party/Media Hub para banco transacional permanece pendente. Os índices Prisma existentes são preparação, não garantia de persistência runtime ou transações entre processos.

## Validação da Etapa 7

- Typecheck, lint, 21 testes e build passaram.
- Fluxo real validado no navegador: signup, criação de Casa, busca real no YouTube, salvar, favoritar, criar playlist, adicionar item, reproduzir playlist, abrir Media Hub durante playback, convite, segundo membro, biblioteca/favorito compartilhados, reproduzir a seguir e avanço da fila.
- Auditoria axe do Media Hub: zero violações após ajuste de contraste.
- Limitação da validação: a automação confirmou duas identidades sequencialmente, mas não manteve três browsers concorrentes ativos para um teste de corrida visual completo. As regras de revisão e avanço idempotente estão cobertas por testes de domínio.

## Estado atual — M2 Social Library

As seções acima descrevem marcos históricos. Desde a Etapa 18, o runtime de produção usa PostgreSQL/Prisma para a biblioteca; desenvolvimento isolado pode usar o adapter local. M2 reutiliza as tabelas existentes: histórico de reprodução por Casa (ocorrências limitadas a 300), biblioteca/favoritos compartilhados e playlists como coleções. A consulta de recentes agrega por `provider + providerMediaId`, ordena pela última reprodução e mostra contagem dentro da janela; a fila continua a guardar ocorrências distintas. Biblioteca tem limite de 500 itens/Casa e páginas de até 60; coleções têm limite de 50/Casa e 500 itens/coleção. Renomear e reordenar exigem versão atual; favoritos são set/unset idempotentes.

O evento `media-hub:update` envia somente Casa e tipo de mudança aos sockets autorizados da Party. O cliente refaz a consulta após o evento e após reconexão. Nenhuma ação da biblioteca toca diretamente o provider: a fila e o playback continuam autoritativos no servidor. Referências Drive salvas não criam grant; ver `GOOGLE_DRIVE.md` para a projeção restrita M2.

## Estado atual após M3 — Queue V2

- A fila é uma sequência de ocorrências identificadas por `QueueItem.id`; o par `provider + providerMediaId` identifica a mídia canônica, mas pode aparecer várias vezes. `queueRevision` versiona a ordem, separadamente da revisão do playback. O item atual é apresentado como **Tocando agora**, e os restantes como **A seguir**. O histórico operacional da Party preserva cada reprodução para `Previous`; o histórico social da Biblioteca continua deduplicado.
- Adicionar e `Play Next` preservam o ID da ocorrência nos adapters YouTube/Drive. Reenviar o mesmo ID não cria outra entrada; um ID novo permite repetir intencionalmente a mídia. O cliente mantém o mesmo ID ao repetir uma tentativa incerta. Movimentos exigem a revisão atual e retornam a fila definitiva em conflitos, sem ordem otimista; remover, escolher mídia e avançar manualmente também verificam a versão ou ocorrência quando informadas.
- Reordenar não move a ocorrência atual nem insere antes dela. A seleção de uma ocorrência futura a coloca como atual e preserva os demais próximos. Remover o atual interrompe a reprodução e deixa os próximos enfileirados. Limpar remove somente os próximos, preservando a mídia atual. O limite é 250 ocorrências.
- Inserção de coleção é atômica perante o limite da fila e conflitos de versão. Arquivos Drive indisponíveis são ignorados somente com contagem explícita; se todos estiverem indisponíveis, a API rejeita a operação. `operationId` evita duplicar um lote reenviado enquanto o processo servidor permanece ativo. Esse cache é limitado e volátil; não é uma tabela de deduplicação durável entre reinícios.
- O painel da fila oferece ações contextuais com alvos de toque e movimento por botões no mobile. O servidor segue responsável por permissões, ordem, autoplay e avanço; a UI não controla diretamente o provider. Consulte [POST_1_0_M3_QUEUE_V2_REPORT.md](POST_1_0_M3_QUEUE_V2_REPORT.md) para testes e limites.
