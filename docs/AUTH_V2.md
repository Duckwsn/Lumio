# Auth V2 — identidade Lumio e Google

## Modelo

O `User` Lumio é a identidade usada por Casa, Party, permissões, chat, biblioteca e Drive. Ele pode ter senha local, identidade Google vinculada ou ambos. A identidade Google é indexada pelo `sub` estável e **não** pelo e-mail. Um login Google novo cria um User; se já existir uma conta Lumio com o mesmo e-mail, o login não cria uma duplicata nem vincula automaticamente: a pessoa deve entrar com a senha e vincular Google em **Conta**. Conflitos entre identidades são rejeitados sem merge.

Google Login usa apenas ID token `openid/email/profile` do Google Identity Services. O servidor valida assinatura, emissor, audience e expiração pela biblioteca oficial `google-auth-library`, além de exigir `email_verified` e o `nonce` emitido pelo Lumio. O desafio de uso único usa cookie `HttpOnly; SameSite=Strict`, validade de dez minutos e checagem de `Origin`. O ID token não é armazenado nem usado para acessar o Drive.

Google Drive continua uma autorização OAuth **separada** no Media Hub. Entrar ou vincular Google não conecta Drive. Desvincular Google Login e sair do Lumio não revogam o Drive. Desconectar Drive não remove Google Login. As contas Google de login e de Drive podem ser diferentes.

## Configuração

O mesmo OAuth Client ID do tipo **Aplicativo da Web** já usado no desenvolvimento do Drive pode servir ao Google Login: configure `http://localhost:5173` em **Origens JavaScript autorizadas** no Google Auth Platform. O cliente deve ser o mesmo definido em `GOOGLE_CLIENT_ID` no `.env` da raiz. O frontend recebe somente o Client ID público por `/api/auth/google/challenge`; `GOOGLE_CLIENT_SECRET` permanece no servidor para o fluxo Drive. O Google Login via botão JavaScript não usa a URI de callback do Drive, nem pede escopo Drive.

Em produção, use origem HTTPS autorizada e configuração de ambiente própria. Não publique chaves no Vite, não use `localhost` como origem de produção e conclua os requisitos de verificação do Google para disponibilizar escopos restritos do Drive ao público.

## Sessões e conta

O servidor gera um token Lumio aleatório novo a cada login. Guarda só seu SHA-256 no adapter `.data/auth-v2.json`, com expiração absoluta configurada por `SESSION_TTL_DAYS` (padrão 14, máximo 30). Logout revoga a sessão, desconecta seus sockets e invalida tickets de reprodução Drive daquele usuário, mas não sua conexão OAuth Drive. O cliente atual envia o token Lumio via `Authorization: Bearer` e Socket.IO e o conserva em `localStorage`; isso é uma limitação de segurança para produção e exige revisão de XSS/CSP e estratégia de sessão apropriada antes do deploy.

Contas, senhas `scrypt` com salt, identidades Google e hashes de sessão passam a persistir em arquivo local ignorado pelo Git. O adapter usa gravação por arquivo temporário e rename; pressupõe **um único processo**. A migration `0008_auth_v2` documenta a futura tabela relacional com unicidade por `(provider, providerSubject)` e `(userId, provider)`, mas o runtime **ainda não usa Prisma**. Casas, filas e demais dados sociais continuam em memória. Contas criadas antes dessa mudança em mapas de memória não podem ser migradas após o processo antigo encerrar; conexões Drive antigas ligadas àqueles IDs podem ficar órfãs e precisar de reconexão. Não trate esta versão como persistência de produção.

Em **Conta**, um usuário autenticado pode vincular Google, definir/adicionar senha e desvincular Google se já tiver senha confirmada. Vínculo exige sessão recente (até dez minutos) **e confirmação da senha Lumio**; definição de senha para conta Google-only exige sessão recente. Alterar senha exige a senha atual e revoga as demais sessões. Não há e-mail transacional; portanto “esqueci minha senha” e verificação de e-mail local **não foram implementados**. Não anuncie envio de recuperação.

## Testes e limites

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Os testes `authStore.test.ts` cobrem local/Google, identidade por `sub`, duplicatas, vínculo explícito, último método e sessão persistente. `googleIdentity.test.ts` simula o verificador oficial para conferir audience, nonce e `email_verified`. Não são testes com Google real. Valide manualmente em contas de teste: novo Google, Google retornando, e-mail local existente, vínculo autenticado, senha para Google-only, desvinculação, convite, atualização da página e separação do Drive. Não use conta pessoal sensível para QA automatizado.

Referências oficiais: [botão Google Identity Services](https://developers.google.com/identity/gsi/web/guides/display-button), [verificação do ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [referência JavaScript e nonce](https://developers.google.com/identity/gsi/web/reference/js-reference).
