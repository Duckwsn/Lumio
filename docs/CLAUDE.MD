# Lumio — instruções para Claude

## Objetivo

O Lumio é uma plataforma de salas privadas para assistir, ouvir e conversar juntos. A experiência principal é a Party: simples, social e orientada à presença das pessoas na sala.

Antes de alterar o projeto, leia também:

- `docs/ENTRY_FLOW.md` — Landing, autenticação, onboarding e Home.
- `docs/SOCIAL_ARCHITECTURE.md` — Casas, membros, papéis, presença e convites.
- `docs/CALL_V4.md` — call P2P, screen share, TURN e roteiro de QA.

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
- Sessões e contas novas persistem no adapter local `.data/auth-v2.json`; Casas e estado da Party ainda ficam em memória. Isso não é persistência de produção.

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
npm run test --workspace @lumio/web
```

O frontend normalmente fica em `http://localhost:5173` (ou 5174 se a porta estiver ocupada) e a API em `http://localhost:4000`. Se a porta 4000 estiver ocupada:

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

- Contas e hashes de sessão novos usam arquivo local; Casas e parte do estado social ainda usam armazenamento em memória durante o desenvolvimento.
- Reiniciar o servidor pode apagar estado runtime.
- Recuperação de senha e verificação de e-mail ainda não estão implementadas. Transferência de host funciona no adapter em memória, mas exigirá transação ao migrar para Prisma. Google Login usa Google Identity Services e é separado do OAuth do Google Drive; consulte `docs/AUTH_V2.md`.
- Prisma/schema estão preparados para evolução, mas não devem ser tratados como persistência completa sem uma implementação explícita.

## Media Hub V3

- O Media Hub usa cinco áreas: Descobrir, Biblioteca, Playlists, Histórico e Google Drive. YouTube e Google Drive são providers, não salas nem modos separados.
- Biblioteca, favoritos e playlists pertencem à Casa. Progresso de reprodução continua pessoal.
- A fila pertence à Party, possui `queueRevision` e sempre converge para o estado emitido pelo servidor.
- O evento `queue:advance` recebe `expectedMediaId` e `expectedQueueItemId`; a ocorrência evita avanço duplo mesmo quando o mesmo vídeo aparece duas vezes.
- Histórico é criado quando a mídia realmente começa a tocar, não quando entra na fila.
- A visualização musical é uma preferência local em torno do mesmo UniversalPlayer. Para YouTube continua existindo exatamente um iframe oficial.
- Os models e índices planejados estão em `0005_media_hub_v2`; o adapter runtime desta versão ainda é em memória.
- Consulte `docs/MEDIA_HUB.md` antes de alterar biblioteca, playlists, histórico, fila ou autoplay.
- A fila aceita mídias repetidas como ocorrências distintas. Playlist reorder usa `expectedUpdatedAt`; playlist→fila usa `queueRevision`. A Biblioteca busca localmente com paginação; o Drive só navega pastas pessoais e `fileId` não é autorização.

## Lumio Player e Sync V2

- A Party tem um único Lumio Player. Providers implementam uma interface de capacidades; a interface só mostra controles realmente suportados.
- O backend mantém `media.revision` monotônica. Todo comando compartilhado envia `mediaId`, `revision` e `operationId`; mídia errada ou revisão antiga é descartada.
- Não publique `currentTime` em intervalos curtos. Use comandos semânticos (`play`, `pause`, `seek`, `rate`), snapshots na entrada/reconexão/retorno de background e checkpoints esparsos.
- Ao materializar um snapshot de mídia tocando, calcule a posição atual e rebata `startedAt` para o horário do snapshot. Nunca avance a posição duas vezes no cliente.
- Volume e mute são locais. Play, pause, seek, velocidade e avanço da fila são compartilhados.
- O YouTube deve continuar usando somente o IFrame Player API oficial, com exatamente um iframe por player. Não use players paralelos, polling para inferir seeks ou APIs não oficiais.
- O Google Drive tem explorador de pastas, OAuth e provider de vídeo integrados ao mesmo player; consulte `docs/GOOGLE_DRIVE.md`. Sem credenciais Google e teste com conta real, não anuncie a integração como validada em produção.
- `autoplayNext` pertence às configurações da Casa e só pode ser alterado por quem possui `HOUSE_MANAGE`.

## Party Experience V2

- A UI da Party diferencia entrada, reconnect e indisponibilidade prolongada; o primeiro snapshot recebido após reconnect é autoritativo. Não desmonte `MainStage`/`MediaStage` durante quedas breves.
- Os overlays lazy (Media Hub e configurações da Call) possuem limites `Suspense` próprios para não substituir o player na primeira abertura. Drawers alternam apenas conteúdo lateral.
- A presença usa o grace period de cinco segundos do servidor; avisos efêmeros de entrada/saída vêm de diferenças entre snapshots, sem novo protocolo de UX.
- O chat preserva scroll de leitura, marca mensagens não lidas somente com drawer fechado e envia `typing` por início/fim da atividade, sem emitir a cada tecla.
- Reorder da fila aguarda a revisão autoritativa do servidor. Comandos compartilhados exigem socket conectado e permissão; volume/mute da mídia continuam locais e não se confundem com deafen da Call.

## Mobile e instalação

- A mesma aplicação React adapta Party, Dock, drawers/sheets, Media Hub e Casa para touch e safe areas; não crie uma versão mobile paralela nem redesenhe o desktop aprovado.
- O Chat mobile divide o canvas com o player (abaixo em portrait, ao lado em landscape). O microfone junto ao campo de mensagem abre as ações da call; o Dock desktop continua inalterado.
- A PWA oferece instalação apenas quando o navegador disponibiliza o prompt. O service worker guarda somente arquivos estáticos e uma página offline honesta; API, Drive, YouTube e mídia privada nunca entram no Cache Storage.
- Uma nova versão espera confirmação explícita para recarregar a Party. Instalação, Google Login, Drive OAuth e WebRTC variam por navegador e precisam de teste real antes de declarar suporte em Android/iOS.
