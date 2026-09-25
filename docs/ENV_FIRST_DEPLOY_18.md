# `.env` local e variáveis do primeiro deploy

**Não copiar `.env.example` sobre um `.env` existente.** Fazer backup privado do arquivo antes de editar e não publicar backup, chave, JSON OAuth ou valor de secret. O `.env` local é carregado pelo backend de `C:/Users/Win 11/Documents/Projeto/Basement/.env`; o build Vite lê `VITE_*` desse arquivo em desenvolvimento. Em produção, cadastrar variáveis nos painéis Render e Vercel: eles não recebem automaticamente seu `.env` local.

## Primeiro: ligar PostgreSQL local mantendo `NODE_ENV` de desenvolvimento

1. No PowerShell, na raiz do projeto, `docker compose -f infra/compose.postgres.yml up -d` e `docker compose -f infra/compose.postgres.yml ps`. O exemplo escuta só em `127.0.0.1:5433`.
2. Abra `.env` no VS Code e **adicione/atualize só estas linhas** (uma ocorrência de cada):

```dotenv
PORT=4000
PERSISTENCE_MODE=postgres
DATABASE_URL=postgresql://lumio_dev:lumio_local_only@127.0.0.1:5433/lumio_dev?schema=public
CLIENT_ORIGIN=http://localhost:5173
APP_PUBLIC_URL=http://localhost:5173
API_PUBLIC_URL=http://localhost:4000
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
EMAIL_PROVIDER=dev-file
GOOGLE_REDIRECT_URI=http://localhost:4000/api/google-drive/oauth/callback
```

O usuário/senha acima pertencem **somente ao Compose local**. Não usar em produção. Não colocar `NODE_ENV=production` localmente. Preserve `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` e `YOUTUBE_API_KEY` que já funcionam; não gerar uma nova chave Drive sem necessidade. Para Google Login, basta o client ID; para Drive, são necessários client ID, secret, callback e chave de 64 caracteres hexadecimais. `EMAIL_FROM`/`RESEND_API_KEY` podem ficar vazios em `dev-file`.

3. Execute `npm install` (ou `npm ci` para instalação limpa), `npm run db:generate --workspace @lumio/server` e aplique as migrations versionadas no banco local com:

```powershell
$env:DATABASE_URL = 'postgresql://lumio_dev:lumio_local_only@127.0.0.1:5433/lumio_dev?schema=public'
npm run db:migrate:deploy --workspace @lumio/server
Remove-Item Env:DATABASE_URL
npm run dev
```

O `DATABASE_URL` temporário acima é para o comando Prisma; ele garante que a migration não use por engano outro banco. **Confirme o host, porta e nome `lumio_dev` antes de executar.** Não rode `db:migrate:dev` como passo de instalação: esse comando cria migrations novas. Verifique `http://localhost:4000/api/ready` (200) e `http://localhost:5173`.

**Importante:** PostgreSQL começa sem as contas do antigo `.data/auth-v2.json`. Não apague `.data` nem espere que as contas locais apareçam automaticamente. Decida se elas serão descartadas ou importadas em um procedimento revisado antes do deploy; o mesmo vale para conexões Drive locais. Casas/mídias anteriores eram efêmeras e não têm importação automática. Caso a porta 4000 esteja em uso, identifique o processo antes de encerrá-lo.

## Depois: variáveis do ambiente hospedado, sem modificar o `.env` local para produção

### Prévia descartável para amigos, sem domínio próprio

Se o objetivo for apenas uma prévia com poucos amigos, **não prometer verificação de e-mail para todos**: o remetente de teste `onboarding@resend.dev` só entrega ao endereço da própria conta Resend. Mantenha `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM=Lumio <onboarding@resend.dev>` no Render para que o backend inicie e o proprietário possa testar sua própria entrega. Configure `AUTH_SIGNUP_MODE=google-only` no Render **e** `VITE_AUTH_SIGNUP_MODE=google-only` na Vercel. O servidor bloqueia novo cadastro por e-mail antes de criar conta; a interface remove o formulário de cadastro, mas preserva login por senha de contas preexistentes. Não definir essas duas variáveis no `.env` local caso queira manter o desenvolvimento normal.

Adicione manualmente os amigos como **usuários de teste** do projeto OAuth External/Testing no Google Cloud; todos entrarão pelo Google Login. A integração Drive permanece separada e o refresh token pode expirar após sete dias nesse estado, exigindo reconexão. URLs `vercel.app` e `onrender.com` são origens distintas; o cookie de nonce usado no Google Login pode ser bloqueado como cookie de terceiro em alguns navegadores. Faça o primeiro teste real em dois navegadores antes de convidar a turma. Não há garantia de funcionamento universal sem domínios próprios sob o mesmo site. O Google Drive com `drive.readonly` não está aprovado para publicação aberta somente porque funciona entre testadores.

O PostgreSQL gratuito do Render expira após 30 dias e não oferece backups; o Web Service gratuito adormece quando fica ocioso. Use apenas para dados **descartáveis** e mantenha a instância única. Não migrar dados locais pessoais para esse banco sem decidir que serão descartáveis. [Limites oficiais do plano gratuito](https://render.com/docs/free).

**Render/backend** — configurar no painel do Web Service, sem colar valores em Git:

```dotenv
NODE_ENV=production
PERSISTENCE_MODE=postgres
DATABASE_URL=<URL privada do PostgreSQL gerenciado, conforme TLS do provedor>
CLIENT_ORIGIN=https://<dominio-exato-do-frontend>
APP_PUBLIC_URL=https://<dominio-exato-do-frontend>
API_PUBLIC_URL=https://<dominio-exato-do-backend>
EMAIL_PROVIDER=resend
EMAIL_FROM=Lumio <onboarding@resend.dev>
RESEND_API_KEY=<secret do provedor>
AUTH_SIGNUP_MODE=google-only
GOOGLE_CLIENT_ID=<client ID Web>
GOOGLE_CLIENT_SECRET=<client secret Web>
GOOGLE_REDIRECT_URI=https://<dominio-exato-do-backend>/api/google-drive/oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<chave hex de 64 caracteres>
```

O `EMAIL_FROM` acima é **exclusivo do preview e envia apenas ao endereço do proprietário da conta Resend**; para envio público no futuro, troque por remetente de domínio próprio verificado. Se for habilitar busca YouTube, configurar `YOUTUBE_API_KEY`; se houver TURN, usar `RTC_TURN_URLS`, `RTC_TURN_USERNAME` e `RTC_TURN_CREDENTIAL`. `RTC_STUN_URLS` é opcional. Para **somente** Google Login, `GOOGLE_CLIENT_ID` basta e as três variáveis exclusivas do Drive podem ser omitidas; para preservar Drive, mantenha todas. Não definir `LUMIO_PRODUCTION_SMOKE`; não fixar `PORT`, pois o Render a fornece. `CLIENT_ORIGIN` e `APP_PUBLIC_URL` devem apontar para a mesma origem frontend, sem barra final/caminho; `API_PUBLIC_URL` também é só origem. URLs reais só devem ser preenchidas após obter os domínios dos provedores.

**Vercel/frontend** — configurar no painel do projeto, nunca com secrets:

```dotenv
VITE_API_URL=https://<dominio-exato-do-backend>
VITE_SOCKET_URL=https://<dominio-exato-do-backend>
VITE_AUTH_SIGNUP_MODE=google-only
```

Os valores `VITE_*` são incorporados ao JavaScript público. Nunca colocar `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `DATABASE_URL` ou chave Drive em variáveis `VITE_*`. O Google Client ID é público por natureza, mas este frontend o obtém do endpoint do backend, não de `VITE_*`.

## Ordem para o primeiro deploy

Provisionar PostgreSQL vazio (backup obrigatório para produção durável; sem backup e com prazo de expiração no preview gratuito escolhido); configurar Render e variáveis sem auto-deploy prematuro; aplicar `db:migrate:deploy` uma vez por release (pre-deploy Render, se disponível, ou execução manual confiável com TLS antes de liberar tráfego); validar `/api/ready`; configurar Vercel; ajustar URLs definitivas de ambos; atualizar origens/callback no Google Cloud manualmente; executar os testes hospedados de Login, Drive, e-mail do proprietário, WebSocket, call e PWA. Detalhes operacionais em [DEPLOYMENT_18.md](DEPLOYMENT_18.md) e scopes/verificação em [GOOGLE_OAUTH_SCOPE_AUDIT.md](GOOGLE_OAUTH_SCOPE_AUDIT.md).
