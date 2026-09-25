# Auth V2 — identidade Lumio e Google

> Registro histórico das etapas 10/16. As seções que dizem que o runtime ainda usa arquivo local descrevem a versão anterior; a Etapa 18 adicionou persistência PostgreSQL e cookies `SameSite=None; Secure` em produção. O bearer de sessão no `localStorage` **continua** como limitação atual. Consulte [DEPLOYMENT_18.md](DEPLOYMENT_18.md) e [DEPLOY_HANDOFF_REPORTS.md](DEPLOY_HANDOFF_REPORTS.md).

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

Em **Conta**, um usuário autenticado pode vincular Google, definir/adicionar senha e desvincular Google se já tiver senha confirmada. Vínculo exige sessão recente (até dez minutos) **e confirmação da senha Lumio**; definição de senha para conta Google-only exige sessão recente. Alterar senha exige a senha atual e revoga as demais sessões.

## Verificação e recuperação — Etapa 16

Cadastro por e-mail/senha cria a conta **não verificada e sem sessão**. Login local, rotas protegidas e Socket.IO negam acesso até o link ser confirmado. Google Identity validado pelo backend já estabelece uma identidade verificada, sem conceder acesso ao Drive. Tokens de verificação (24 horas) e reset (30 minutos) são aleatórios, específicos por finalidade, armazenados apenas como SHA-256, expiram e são consumidos uma vez; reenvio tem cooldown de 60 segundos. Reset de senha não verifica e-mail e revoga todas as sessões anteriores, além de tickets/streams Drive ativos. O limite de tentativas público combina endpoint, IP e hash do e-mail no processo único; no deploy com múltiplas instâncias será necessário armazenamento distribuído.

Configuração local: `APP_PUBLIC_URL=http://localhost:5173` e `EMAIL_PROVIDER=dev-file` gravam mensagens em `.data/dev-mailbox.jsonl`, ignorado pelo Git e contendo **links sensíveis**. Esse transporte não envia e-mail real. Para entrega real, configure `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` com remetente autorizado pelo provedor. O backend envia por HTTPS para a API Resend; não há necessidade de chave no Vite. Sem credenciais reais, o envio **não foi testado ponta a ponta**. Em `NODE_ENV=production`, o servidor rejeita transporte `dev-file`, ausência de configuração e `APP_PUBLIC_URL` sem HTTPS. Links usam fragmento `#token=` para reduzir exposição em logs HTTP e Referer; continuam sendo segredos e não devem ser compartilhados.

O arquivo local `auth-v2.json` migra da versão 1 para a versão 2 apenas em desenvolvimento: contas de desenvolvimento preexistentes mantêm acesso e ficam marcadas como verificadas. Em produção, a migração legada exige revisão explícita e não ocorre automaticamente. A migration Prisma `0009_security_auth` adiciona `emailVerifiedAt` e tokens, mas o runtime **continua no adapter de arquivo e em um processo**; aplicar SQL não muda isso. Novas contas nunca são auto-verificadas.

O token de sessão Lumio permanece no `localStorage` e segue em `Authorization: Bearer`/handshake Socket.IO; isso evita CSRF na maioria das mutações, mas mantém risco de roubo em caso de XSS. Não considere esse armazenamento pronto para produção sem revisar sessão/cookies e implantar CSP/headers efetivos na hospedagem.

## Auditoria pré-produção ainda pendente

- **HIGH:** sessão bearer em `localStorage`; CSP restringe scripts no HTML do Vite, mas a hospedagem definitiva precisa servir a política e os headers (inclusive `frame-ancestors`, HSTS e `Permissions-Policy`) e testar YouTube/Google/Drive no domínio final. Cookies `HttpOnly` exigiriam migração coordenada e defesa CSRF.
- **HIGH:** contas usam arquivo local e Casas/Party/grants vivem em memória. Não é arquitetura de produção ou multi-processo. A migration Prisma define estrutura, mas ainda não é o adapter runtime; transferência de host, convites e tokens precisarão de transações/constraints efetivas no banco usado em produção.
- **MEDIUM:** rate limits são por instância e podem ser burlados por tráfego distribuído; Etapa 18 deve definir proxy confiável, limites globais e storage distribuído. TURN estático também exige credenciais temporárias ao expor a call na internet.
- **MEDIUM:** entrega real Resend, Google Login, Drive OAuth/streaming e reprodução YouTube sob CSP no domínio final não foram exercitados nesta etapa com contas externas reais. Testes automatizados usam outbox local ou mocks. Não declarar esses fluxos aprovados sem QA controlado.
- **INFORMATIONAL:** scrypt com salt aleatório permanece como hash de senha; e-mails são comparados por `trim().toLowerCase()` por compatibilidade com contas existentes, sem normalização específica de Gmail. No futuro, qualquer mudança dessa política exige plano de colisões.

## Testes e limites

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Os testes `authStore.test.ts` cobrem local/Google, identidade por `sub`, duplicatas, vínculo explícito, último método e sessão persistente. `googleIdentity.test.ts` simula o verificador oficial para conferir audience, nonce e `email_verified`. Não são testes com Google real. Valide manualmente em contas de teste: novo Google, Google retornando, e-mail local existente, vínculo autenticado, senha para Google-only, desvinculação, convite, atualização da página e separação do Drive. Não use conta pessoal sensível para QA automatizado.

Referências oficiais: [botão Google Identity Services](https://developers.google.com/identity/gsi/web/guides/display-button), [verificação do ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [referência JavaScript e nonce](https://developers.google.com/identity/gsi/web/reference/js-reference).