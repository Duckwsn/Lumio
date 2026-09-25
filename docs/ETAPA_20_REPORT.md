# Etapa 20 — Lumio 1.0: fechamento técnico

## 1. Resumo executivo e gate

**LUMIO_1_0_READY** para o escopo técnico local da etapa 20. A única funcionalidade adicionada foi a exclusão permanente de Casa, restrita ao HOST. Typecheck, lint, build, testes, E2E Chromium, smoke de produção e smoke PostgreSQL passaram. Nenhuma exclusão foi feita em produção, nenhum deploy/commit/push foi realizado. A validação em dispositivos físicos, redes diferentes e o acompanhamento após publicação continuam manuais; latências pequenas de sync e call foram aceitas pelo usuário, não classificadas como bloqueio.

## 2. Base auditada e alterações pré-existentes

Branch `master`, HEAD inicial `1d39c9780c54795999e7fde97c7351fea8093596`. Working tree inicial **não estava limpa** por trabalho da Etapa 19: `.gitignore`, `apps/server/src/security.integration.test.ts`, `apps/web/src/App.tsx`, `docs/AUTH_V2.md`, `package.json`, `package-lock.json`, além de `apps/web/src/rtc/diagnostics.ts`, `apps/web/src/rtc/diagnostics.test.ts`, `docs/ETAPA_19_REPORT.md`, `e2e/` e `playwright.config.ts` não rastreados. Tudo foi preservado; mudanças da etapa 20 em arquivos compartilhados foram incrementais. Não havia `AGENTS.md`, `CLAUDE.md` ou `PROJECT_CONTEXT.md` na raiz. Os documentos históricos solicitados foram lidos como contexto, com o código atual como fonte de verdade.

## 3. Arquitetura final auditada

- **Web:** React/Vite, rotas de landing/login/Home/Casa/Party, sessão bearer no `localStorage`, `UniversalPlayer` com YouTube/Drive, Media Hub e PWA com service worker que não armazena API/dados privados. Party usa Socket.IO.
- **Servidor:** Express, autenticação/sessões, autorização por membership/role, Socket.IO como estado autoritativo de Party, fila e sincronização; signaling de WebRTC. `/api/ready` verifica banco/persistência. Drive usa OAuth separado do Google Login, grants/tickets efêmeros e streaming Range.
- **PostgreSQL:** User, credenciais/identidades externas/sessões, Group (Casa), GroupMember, HouseInvite, HouseActivity, Room, QueueItem, ChatMessage, MediaHistory, GroupLibraryItem, Playlist/PlaylistItem, HouseFavorite, MediaItem global, Favorite/PlaybackProgress de usuário e GoogleDriveConnection de usuário. Um processo servidor, sem coordenação distribuída entre instâncias.

## 4. Exclusão de Casa e autorização

`DELETE /api/houses/:houseId` exige sessão verificada, House existente, membership e papel `HOST`; ADMIN e MEMBER recebem 403, pessoa externa recebe 404, sessão ausente/inválida 401, House inexistente/repetição 404 e exclusão concorrente 409. O papel não é extraído do corpo HTTP. Em PostgreSQL, o repositório confirma **novamente dentro da transação** `Group.ownerId === actorId` e `GroupMember.role === HOST`, então exclui `Group`. Falha de banco retorna 503 sem afirmar sucesso; a House permanece em memória para retry. O lock de exclusão impede novas mutações/joins relevantes durante a operação e aguarda writes já enfileirados antes do delete. O escopo de concorrência é o servidor único previsto na implantação atual.

## 5. Confirmação, UX e Socket.IO

Em Casa → configurações → Zona de perigo, só o HOST vê “Excluir Casa…”. O modal próprio explica irreversibilidade, pede o nome exato da Casa, mantém o botão desabilitado até coincidir, impede duplo envio, mostra loading/erro, foca o campo e aceita Escape. Não usa `window.confirm`. Após sucesso, Home é atualizada e a Party é encerrada; há feedback discreto “Casa excluída.”. O servidor emite `house:deleted` aos sockets daquela Party, atualiza a lista de Casas, desautoriza os sockets e os desconecta. O cliente limpa estado da Party e navega para `/app` sem apagar a sessão Lumio ou a conexão Google. Sockets antigos não conseguem recriar a Party; chamadas atrasadas à fila verificam novamente House/lock depois dos awaits de YouTube/Drive.

## 6. Cascatas PostgreSQL e dados preservados

O schema/migration inicial já estabelece `ON DELETE CASCADE`: `Group` → membros, convites, atividade, rooms, biblioteca, playlists, favoritos de Casa; `Room` → queue, mensagens e histórico; `Playlist` → itens. A transação de `PrismaSocialRepository.deleteHouse` usa esse grafo. Não foi necessária migration nova. Teste PostgreSQL isolado confirmou ausência dos registros dependentes e preservação de outra House, seu item de fila, do User, da GoogleDriveConnection e do `MediaItem` canônico/global. `Favorite` e `PlaybackProgress` de usuário também são globais, não atributos da Casa. `MediaItem` pode permanecer como registro compartilhável/global após perder a última referência da House; isso não é uma House órfã. Drive OAuth/refresh token do usuário **não** são revogados/apagados.

## 7. Limpeza de runtime e Drive

Após commit PostgreSQL (ou no modo arquivo), são removidos mapas de House/convites, Room/Party (fila, playhead, mensagens, membros, votos, biblioteca, playlists e favoritos da Casa), grants/tickets do Drive daquela sala, streams Drive ativos (abort), call registry, screen-share owner, conexões de sala e timers de presença da sala. Catálogo de mídia em memória descarta somente itens sem referências restantes de outras Casas/progresso global. A conexão OAuth do Drive fica intacta. Streams HTTP e tickets posteriores passam a falhar porque a House não existe; `room:join` e eventos de socket são rejeitados.

## 8. Testes da exclusão

- Unitários: SocialStore remove membership/convites e preserva outra Casa; RoomStore remove Party/queue e preserva outra.
- HTTP + Socket.IO em servidor **local, file-mode e diretório temporário**: HOST 204; ADMIN/MEMBER 403; externo 404; sessão ausente/inválida 401; inexistente 404; segundo delete 404; convite inválido; acesso à mídia negado; outra House e usuário preservados; socket de membro recebeu `house:deleted`.
- PostgreSQL local `lumio_test`: teste de repository valida role novamente no banco, cascatas, não exclusão de User/Drive connection/MediaItem global/outra House, repetição `NOT_FOUND`.
- E2E Chromium local: conta e Casa descartáveis criadas pelo teste; abre configurações, confirma botão desabilitado com nome errado, cancela via Escape, digita nome correto, exclui e retorna à Home sem a Casa. Viewports retrato/paisagem e manifest também verificados. **Não executado contra Vercel/Render ou banco hospedado.**

## 9. Regressão e comandos executados

| Comando/área | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` com `LUMIO_TEST_DATABASE_URL` local | PASS: 78 testes, 78 passed, 0 skipped, 0 failed (65 server + 9 web + 4 SW) |
| `npm run test:e2e` | PASS: 1 cenário Chromium |
| `npm run build` | PASS; bundle web/PWA e build server/shared |
| `npm run smoke:production --workspace @lumio/server` | PASS; boot production-like local, readiness, CORS |
| `npm run smoke:postgres-flow --workspace @lumio/server` | PASS; fluxo API e persistência após restart no PostgreSQL local |
| `git diff --check` | PASS; apenas avisos Windows de conversão LF/CRLF, sem erros de whitespace |

Também foram executados `docker compose -f infra/compose.postgres.yml ps` (PostgreSQL local saudável), `npm install --package-lock-only --ignore-scripts` (lockfile da versão 1.0.0), teste HTTP/Socket direcionado e verificações de status/diff Git. A primeira tentativa de `docker compose ps` sem `-f` apenas indicou que o arquivo compose fica em `infra/`; não alterou infraestrutura.

Uma tentativa de `npm test` **em paralelo** com lint/build teve timeout no teste de inicialização Google-only (20 s); a suíte repetida **sequencialmente** passou integralmente. Uma primeira execução E2E revelou propagação de Escape ao atalho global; corrigida. A segunda revelou apenas que o seletor de logout do E2E ainda esperava o cabeçalho da Party depois de voltar à Home; o teste foi ajustado. Execução final E2E passou.

Regressões: autenticação/verificação/reset, protected APIs e sockets, membership/roles, convites, Drive OAuth/grants/tickets/Range mockado, CORS/origin/config de produção, PWA cache/manifest e testes de player/RTC passaram. Não foi feita nova sessão OAuth Google, streaming Drive real, instalação PWA física ou teste multiusuário hospedado nesta etapa. Busca pontual por TODO/debug/placeholder no código não mostrou bloqueio de release; texto de placeholder de campos é intencional. Não houve captura sistemática do console do browser nesta rodada; uma inspeção curta não substitui QA exaustivo.

## 10. Versão, segurança e limites aceitos

Versão de produto/workspaces ajustada de `0.1.0` para **`1.0.0`** em `package.json` e lockfile; dependências internas `@lumio/shared` alinhadas. Não foi adicionado número hardcoded à interface. Logo, landing, cores, providers e scopes não foram alterados. Google Login permanece `openid`, `userinfo.email`, `userinfo.profile`; Drive permanece `drive.readonly`, `userinfo.email`.

**KNOWN_LIMITATIONS aceitas:** pequena latência de sincronização dependente de rede/player/provider; latência/qualidade da call variáveis com WebRTC mesh P2P e rede/NAT; TURN configurável mas não provisionado; Render free pode dormir/cold start; PostgreSQL preview/free tem limitações de duração/backup; sessão bearer no `localStorage`; cookies cross-site podem ser bloqueados; Drive `drive.readonly` é scope restrito sujeito a verificação do Google em produção pública; consent screen em Testing limita usuários; amplificação de escrita de snapshots de mídia; backend pressupõe instância única. Nenhuma dessas limitações foi “corrigida” especulativamente nesta etapa. Persistem riscos de QA de dispositivo físico e redes reais.

## 11. Arquivos alterados nesta etapa

Backend: `apps/server/src/index.ts`, `socialStore.ts`, `store.ts`, `callRegistry.ts`, `googleDrive.ts`, `prismaSocialRepository.ts`, `houseDeletion.integration.test.ts`, `socialStore.test.ts`, `store.test.ts`, `prismaSocialRepository.integration.test.ts`.

Web/shared: `apps/web/src/components/SocialDialogs.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `packages/shared/src/index.ts`, `e2e/party.spec.ts`.

Versão/docs: `package.json`, `package-lock.json`, `apps/server/package.json`, `apps/web/package.json`, `packages/shared/package.json`, `docs/ETAPA_20_REPORT.md`.

Arquivos pré-existentes da Etapa 19 (inclusive `docs/AUTH_V2.md`) permanecem no working tree; o status Git inclui mudanças anteriores e não deve ser interpretado como diff exclusivo da Etapa 20.

## 12. Ações manuais restantes e publicação

1. Revisar `git diff` e arquivos não rastreados, separando se desejar as alterações pré-existentes da Etapa 19; efetuar **commit e push manualmente**.
2. Acompanhar CI após push. Não há migration nova da Etapa 20, mas manter `prisma migrate deploy` no fluxo de publicação já configurado.
3. Publicar manualmente Vercel/Render pelos mecanismos existentes e verificar `/api/ready`, login, criação de Casa descartável e exclusão **somente de Casa descartável criada para QA**. Não apagar Casas reais.
4. Confirmar com amigos o evento de exclusão em duas sessões, reconexão, PWA em celular (incluindo modal/teclado), Drive streaming real e os limites de call/sync em redes reais. Não mudar Google Cloud, Resend ou scopes apenas por esta etapa.

**Deploy: não realizado.** Gate `LUMIO_1_0_READY` refere-se à prontidão técnica local e ao escopo aceito; não declara que validações manuais restantes já aconteceram.
