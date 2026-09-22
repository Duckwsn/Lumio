# Lumio — instruções para Claude

## Objetivo

O Lumio é uma plataforma de salas privadas para assistir, ouvir e conversar juntos. A experiência principal é a Party: simples, social e orientada à presença das pessoas na sala.

Antes de alterar o projeto, leia também:

- `docs/ENTRY_FLOW.md` — Landing, autenticação, onboarding e Home.
- `docs/SOCIAL_ARCHITECTURE.md` — Casas, membros, papéis, presença e convites.

## Mapa do projeto

- `apps/web` — React, TypeScript e Vite.
- `apps/server` — Node.js, Express, Socket.IO e WebRTC signaling.
- `packages/shared` — contratos, schemas e tipos compartilhados.
- `prisma` — schema e migrações do banco.
- `docs` — decisões e documentação funcional/técnica.

## Regras não negociáveis

1. Não redesenhe a tela principal da Party sem solicitação explícita. O fluxo Party First e a linguagem visual existente são referências aprovadas.
2. Casa e Party são conceitos diferentes. A Casa é o espaço social durável; a Party é a sessão realtime dentro dela.
3. O backend é a autoridade para autenticação, associação à Casa, papéis e permissões. Nunca confie apenas em bloqueios da interface.
4. Usuários novos não devem receber uma Casa demo, uma sala fictícia ou membros falsos automaticamente.
5. Não coloque chaves do YouTube, Drive ou outros serviços em código do frontend. Segredos ficam no `.env` do servidor.
6. Não registre senhas, tokens de convite, cookies ou chaves em logs.
7. Prefira os contratos de `packages/shared` e validação com Zod a objetos duplicados entre frontend e backend.
8. Preserve alterações existentes do usuário e faça a menor mudança coerente com a tarefa.

## Rotas e ciclo de vida

- `/` — Landing pública; não deve abrir Socket.IO, WebRTC, YouTube ou Google Drive.
- `/login` e `/register` — autenticação.
- `/app` — Home autenticada; lista Casas e permite criar uma nova.
- `/house/:houseId` — entrada na Casa e acesso à Party.
- `/invite/:token` — convite; o aceite deve ser uma ação explícita do usuário.

O endpoint `/api/bootstrap` fornece a sessão e os dados iniciais da Home. O servidor deve validar a sessão e a associação do usuário antes de liberar dados de Casa, Party ou mídia.

## Autenticação e segurança

- Senhas são armazenadas com hash `scrypt`; nunca salve senha em texto puro.
- Login deve retornar mensagem genérica para credenciais inválidas.
- Signup valida e-mail, senha e confirmação no cliente e no servidor.
- O rate limit de autenticação é intencionalmente simples e mantido em memória no ambiente local.
- Convites usam token aleatório, hash no servidor, expiração, limite de uso e possibilidade de revogação.
- A sessão e alguns dados ainda são mantidos em memória no ambiente atual; isso é uma limitação conhecida, não uma justificativa para criar atalhos inseguros.

## Comandos locais

No PowerShell, a partir da raiz:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Verificações úteis:

```powershell
npm run build --workspace @lumio/shared
npm run typecheck --workspace @lumio/web
npm run typecheck --workspace @lumio/server
npm run lint --workspace @lumio/web
npm run test --workspace @lumio/server
```

O frontend normalmente fica em `http://localhost:5174` e a API em `http://localhost:4000`. Se a porta 4000 estiver ocupada:

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen
Get-Process -Id <PID>
```

Só encerre o processo depois de confirmar que ele pertence ao projeto.

## Checklist antes de concluir

- A mudança mantém Landing, Auth, Home e Party funcionando.
- Rotas protegidas continuam protegidas no servidor.
- O usuário não recebe dados falsos ou uma Casa automática.
- Loading, erro e estado vazio continuam visíveis e compreensíveis.
- O layout permanece responsivo e acessível por teclado.
- Foram executados os checks relevantes e os resultados foram registrados.
- Documentação relacionada foi atualizada quando uma decisão arquitetural mudou.

## Limitações atuais conhecidas

- Contas, sessões e parte do estado social ainda usam armazenamento em memória durante o desenvolvimento.
- Reiniciar o servidor pode apagar estado runtime.
- Recuperação de senha, verificação de e-mail, OAuth e transferência de propriedade ainda não estão implementados.
- Prisma/schema estão preparados para evolução, mas não devem ser tratados como persistência completa sem uma implementação explícita.

## Media Hub V2

- O Media Hub usa quatro áreas principais: Início, Biblioteca, Playlists e Histórico. YouTube e Google Drive são providers, não salas nem modos separados.
- Biblioteca, favoritos e playlists pertencem à Casa. Progresso de reprodução continua pessoal.
- A fila pertence à Party, possui `queueRevision` e sempre converge para o estado emitido pelo servidor.
- O evento `queue:advance` recebe o `expectedMediaId`; isso torna eventos simultâneos de fim idempotentes.
- Histórico é criado quando a mídia realmente começa a tocar, não quando entra na fila.
- A visualização musical é uma preferência local em torno do mesmo UniversalPlayer. Para YouTube continua existindo exatamente um iframe oficial.
- Os models e índices planejados estão em `0005_media_hub_v2`; o adapter runtime desta versão ainda é em memória.
- Consulte `docs/MEDIA_HUB.md` antes de alterar biblioteca, playlists, histórico, fila ou autoplay.

## Lumio Player e Sync V2

- A Party tem um único Lumio Player. Providers implementam uma interface de capacidades; a interface só mostra controles realmente suportados.
- O backend mantém `media.revision` monotônica. Todo comando compartilhado envia `mediaId`, `revision` e `operationId`; mídia errada ou revisão antiga é descartada.
- Não publique `currentTime` em intervalos curtos. Use comandos semânticos (`play`, `pause`, `seek`, `rate`), snapshots na entrada/reconexão/retorno de background e checkpoints esparsos.
- Ao materializar um snapshot de mídia tocando, calcule a posição atual e rebata `startedAt` para o horário do snapshot. Nunca avance a posição duas vezes no cliente.
- Volume e mute são locais. Play, pause, seek, velocidade e avanço da fila são compartilhados.
- O YouTube deve continuar usando somente o IFrame Player API oficial, com exatamente um iframe por player. Não use players paralelos, polling para inferir seeks ou APIs não oficiais.
- O Google Drive possui um adapter técnico legado, mas a experiência completa de seleção, OAuth e validação de playback pertence à Etapa 9 e não deve ser anunciada como pronta.
- `autoplayNext` pertence às configurações da Casa e só pode ser alterado por quem possui `HOUSE_MANAGE`.
