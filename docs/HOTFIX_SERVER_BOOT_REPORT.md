# Hotfix — diagnóstico seguro de server_boot_failed

Data: 28/09/2026. Investigação local; nenhuma conexão ou alteração em produção.

## ROOT CAUSE

**Ainda não determinada.** Não foi possível reproduzir a falha de produção com dados válidos representativos de versões anteriores. Não há correção especulativa de schema, chave ou dados neste hotfix.

O defeito de observabilidade é concreto: em `apps/server/src/index.ts`, função `boot`, o `catch` sem argumento descartava a exceção de qualquer etapa e emitia apenas `category=PERSISTENCE_OR_CONFIGURATION`. Essa categoria é um rótulo fixo, não um diagnóstico de configuração ou de migration.

O log fornecido do Render confirma build bem-sucedido e falha depois de `node dist/index.js`, com exit 1; não contém nome, código, causa ou etapa. Os aproximadamente três segundos entre o início do processo e a falha não distinguem conexão, restore ou decrypt. O trecho deste deploy não mostra a execução das migrations. A aplicação bem-sucedida da migration de convites foi informada separadamente pelo usuário.

Os testes anteriores de adapters e HTTP não expunham a exceção desse catch. Além disso, fixtures de QA não são cópias dos dados reais nem reproduzem rede, credenciais, TLS ou variáveis do Render. Agora há regressão de boot compilado populado e regressões de diagnóstico; isso ainda não comprova a causa remota.

## BOOT STAGE

**Etapa da falha real no Render: desconhecida.** Caminho real, sem inventar etapas:

1. Antes de `boot`: carregar `.env`, validar configuração de produção e porta, criar Express/HTTP/Socket.IO e instanciar stores, Prisma e serviços. Erros aqui não entram no `catch` que emite `server_boot_failed`.
2. `PRISMA_CONNECT`: `db.$connect()`.
3. `AUTH_RESTORE`: `PrismaAuthRepository.load()` consulta usuários, identidades, sessões e tokens; `AuthStore.restore()` valida o snapshot com Zod.
4. `DRIVE_RESTORE`: `GoogleDriveService.initialize()` consulta `PrismaDriveVault` e descriptografa AES-256-GCM de cada credencial persistida.
5. `HOUSE_RESTORE`: `PrismaSocialRepository.load()` consulta Casas, rooms, membros, convites e atividades; valida exatamente uma Party e resolve usuários no `SocialStore.restoreHouse()`.
6. `ROOM_RESTORE`: `RoomStore.addHouseRoom()` cria runtime das Parties restauradas.
7. `MEDIA_RESTORE`: `PrismaMediaRepository.load()` restaura fila, histórico, biblioteca, favoritos, playlists e progresso.
8. `HTTP_LISTEN`: chamada a `httpServer.listen()`. Erros assíncronos chegam a `server_listen_error`, não ao catch de `boot`.

Não existe migration ou schema-check explícito em `boot`. As consultas Prisma podem detectar tabela/coluna ausente. Migrations são uma operação separada do processo runtime. Socket.IO é instanciado antes do restore; não há handshake Google, envio de e-mail nem captura WebRTC durante essas etapas.

Qualquer throw/rejection dentro do bloco de boot era classificado com o mesmo rótulo. Candidatos por código auditado (não causas confirmadas):

- Prisma: autenticação, host/rede/TLS, pool/timeout, URL inválida, permissões, schema divergente, tabela/coluna ausente, engine ou consulta inválida.
- Auth: falha de consulta/mapeamento de datas; snapshot incompatível com Zod, incluindo e-mail/identidade/token/sessão inválidos.
- Drive: consulta ao cofre; chave ausente ou inválida com registros; ciphertext JSON inválido, IV/tag inválidos, falha GCM por chave incorreta ou dados corrompidos; JSON descriptografado inválido. A mensagem atual de decrypt deliberadamente não distingue essas causas.
- Social: quantidade de Parties diferente de um; membro sem usuário, convite sem criador; erro de consulta ou data/mapeamento.
- Room: falha síncrona ao construir runtime a partir do resultado social.
- Media: consultas, JSON de metadata inválido, ator ausente, favorito/playlist sem mídia, erro de data/mapeamento/runtime. Os casts TypeScript de enums não são validação Zod; o restore da mídia não adicionou validador de convites.
- Listen síncrono: erro durante a chamada; falhas assíncronas têm seu evento separado.

Todos continuam impedindo a inicialização. Não há fallback silencioso, abertura do listen após restore falho ou desativação de readiness.

## Comparação com o último deploy funcional

Identificadores informados pelo usuário e encontrados no Git local:

- Funcional: `09576c5d5f149906716dea595a02b43a849c7c5a`.
- Falhos: `eecc653b4e16647aa304dbe0ed64b51cd083d760` e `d62118d7aa1afd5a2b040d32e39cc76d8e8f8085`.

Revisão com `git diff 09576c5..d62118d`:

- Bootstrap, `productionConfig`, `.env.example`, restores de Auth, Drive e Media: sem mudança nesse intervalo.
- Schema: inclusão aditiva de `HouseInvite.codeHash String? @unique`.
- PrismaSocialRepository: ler `entry.codeHash ?? undefined` e salvar `entry.codeHash ?? null`.
- SocialStore: maps de código separados, preenchidos somente quando existe hash; snapshot mantém hash opcional. Normalização aplica-se ao identificador recebido, não ao NULL restaurado.
- Index: mudanças de rate-limit/inspeção/aceite de convites são executadas em requests, não durante boot.
- RoomStore: mudança de mute inicial de membro atua na entrada na Party, não durante restore.
- `eecc653..d62118d`: nenhuma alteração em backend ou `.env.example`; G0 não introduziu estágio de persistência/init do servidor.

Isso localiza as mudanças, mas não prova que o ambiente ou os registros reais eram iguais entre deploys. Nenhuma funcionalidade foi revertida.

## PRODUCTION DATA COMPATIBILITY

- **codeHash NULL seguro: SIM**, pela auditoria e teste com PostgreSQL real/boot compilado.
- **Convites legados seguros: SIM no fluxo testado**, incluindo aceite pelo token, persistência após mutação da Casa e múltiplos restarts. Não ganham código retroativamente. Seus tokens continuam válidos conforme validade/uso/revogação existentes.
- **Alteração destrutiva necessária: NÃO**, nenhuma evidência a justifica.
- NULL não é colocado em `inviteByCode`, não é normalizado/hasheado como string e continua NULL após save. O índice único nullable permite convites antigos sem código.
- Metadados e roles são mapeados com os comportamentos já existentes. Usuário ausente, Party ausente e ciphertext inválido continuam fail-fast; não foram apagados ou ignorados.
- Isso não certifica todos os dados de produção: eles não foram acessados nesta investigação.

## DATABASE

- Migration aplicada em produção: **SIM, conforme evidência fornecida pelo usuário**, não por consulta desta investigação.
- Migration adicional necessária: **NÃO identificada**.
- Banco de QA criado separadamente em Docker, PostgreSQL 16, bind loopback e banco `lumio_test`; não foi usado o container de desenvolvimento existente.
- `migrate deploy`: quatro migrations aplicadas, incluindo `20260928110000_invite_code`.
- `migrate status`: `Database schema is up to date!`.
- Sem `db push`, reset, migration especulativa ou acesso ao banco remoto.

## CONFIGURATION

**Env ausente em produção: NÃO DETERMINADO.** Nenhuma nova variável obrigatória surgiu entre o último SHA funcional e os SHAs falhos. Não há evidência para declarar `MISSING_ENV` específico.

Nomes relevantes, sem valores reais:

- Produção: `NODE_ENV`, `PERSISTENCE_MODE`, `DATABASE_URL`, `PORT`, `CLIENT_ORIGIN`, `APP_PUBLIC_URL`, `API_PUBLIC_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`.
- Login Google/preview: `AUTH_SIGNUP_MODE`, `GOOGLE_CLIENT_ID`.
- Drive: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- TURN condicionado à configuração: `RTC_TURN_URLS`, `RTC_TURN_USERNAME`, `RTC_TURN_CREDENTIAL`.
- Sessões: `SESSION_TTL_DAYS`, sem mudança de exigência.

A validação principal de env ocorre antes de `boot`, portanto esse evento específico indica que ela já retornou. Ainda podem existir credenciais de banco semanticamente erradas, schema diferente, rede/TLS ou chave válida em formato mas incompatível com ciphertext. Drive com registros sem chave falha no restore. Nada disso foi confirmado em produção. Não mudar ou regenerar chaves como tentativa de correção.

## FIX

Alteração mínima de observabilidade e regressão; não declarar a indisponibilidade de produção resolvida:

- `apps/server/src/index.ts`: marcar a etapa antes de cada operação; capturar exceção; manter exit 1 e não abrir listen em caso de falha. Erro de disconnect é registrado separadamente e não mascara o original. Listen assíncrono usa o mesmo sanitizador.
- `apps/server/src/bootDiagnostics.ts`: formatter seguro baseado em allowlists.
- `apps/server/src/bootDiagnostics.test.ts`: regressão de privacidade e códigos Prisma.
- `apps/server/src/compiledBoot.integration.test.ts`: boot real via `node dist/index.js`, com fixture populada, dados legados, restarts e falhas controladas.
- `docs/HOTFIX_SERVER_BOOT_REPORT.md`: este relatório.

Sem alterações em migrations, schemas, mappers, permissões, OAuth, keys, UI, mobile, call ou Games.

## LOGGING

Próxima falha no bloco de boot terá `bootStage`, `errorName`, `errorCode`, `safeMessage` e, para código Prisma reconhecido, `prismaCode`. Uma causa presente tem nome/código/mensagem sanitizados separadamente. Prisma usa tanto `code` quanto `errorCode` em classes diferentes; ambos são tratados.

Não registrar error bruto, stack, query, meta, payload, ciphertext, nome de coluna arbitrário, valor de env ou URL. Mensagens, nomes e códigos desconhecidos são substituídos por descrições genéricas; não se confia numa regex que possa deixar segredos escapar. Mensagens fixas dos invariantes locais são preservadas quando correspondem exatamente à allowlist. O código P2022, por exemplo, informa coluna esperada ausente sem expor consulta ou conteúdo de meta.

Exemplo **simulado em QA**, não diagnóstico do Render:

```json
{"event":"server_boot_failed","category":"PERSISTENCE_OR_CONFIGURATION","bootStage":"DRIVE_RESTORE","errorName":"Error","errorCode":"UNKNOWN","safeMessage":"O cofre de tokens do Google Drive não pôde ser aberto. Verifique a chave de criptografia."}
```

Limitação intencional: erros de imports/configuração/construtores anteriores ao bloco atual continuam fora desse logger. O evento observado no Render pertence precisamente ao bloco instrumentado; este hotfix não reestrutura todo o entrypoint.

## TESTS

Na cópia isolada do commit `d62118d`, com dependências instaladas por `npm ci` e apenas dados/credenciais fictícios:

- `npm run typecheck`: OK.
- `npm run lint`: OK.
- `npm run build`: OK, shared/server/web.
- `npm test` com `LUMIO_TEST_DATABASE_URL` no container descartável: backend **73 passaram, 1 skip**, web **23 passaram**, service worker **4 passaram**, nenhuma falha. O skip é o novo boot destrutivo de QA, executado separadamente abaixo.
- Execução dedicada com `LUMIO_BOOT_QA=1`: `npm exec --workspace @lumio/server -- tsx --test src/bootDiagnostics.test.ts src/compiledBoot.integration.test.ts`: **3 passaram, 0 falhas, 0 skips**.
- `npm run smoke:production --workspace @lumio/server`: boot compilado production-like, readiness, CORS OK.
- `npm run smoke:postgres-flow --workspace @lumio/server`: signup/verificação/login, Casa, convite, mídia e restart com persistência OK.
- `npm run db:migrate:deploy --workspace @lumio/server`: OK, somente QA.
- `npm exec --workspace @lumio/server -- prisma migrate status --schema prisma/schema.prisma`: schema QA atualizado.

Teste dedicado cobre: sessão anterior, login local verificado, Casa/membership, link legado NULL-code com aceite, criação de convite novo, código/link, aceite idempotente, revogação preservada após restart, biblioteca/favoritos/playlist/fila e restore de Drive criptografado. Configuração production-like usa o opt-in de smoke local existente e configuração Google/Resend fictícia; nenhum e-mail ou OAuth real é acionado.

Falhas controladas somente em QA: ciphertext inválido (`DRIVE_RESTORE`), JSON de metadata inválido (`MEDIA_RESTORE`), Casa sem Party (`HOUSE_RESTORE`), e-mail incompatível com Zod (`AUTH_RESTORE`). Fixtures são restauradas/removidas; nenhum erro de persistência é ignorado. A suíte de boot exige opt-in e execução isolada porque consulta todos os registros.

Não testado: dados reais de produção, conectividade Render–PostgreSQL, TLS remoto, OAuth real, e-mail real, WebRTC real ou Linux Render. Os resultados locais não substituem essas evidências.

Entrega: os cinco arquivos foram aplicados também à `master` após cancelar o revert autorizado pelo usuário e confirmar o working tree limpo. Conteúdo do bootstrap conferido contra a cópia de QA, desconsiderando apenas CRLF/LF; demais arquivos conferidos por hash. Typecheck do servidor e os dois testes de sanitização passaram novamente na `master`. O container descartável de QA e seu volume anônimo foram removidos ao concluir; dados eram exclusivamente fixtures locais, não necessários para recuperação. O container de desenvolvimento existente foi preservado. A cópia isolada permanece disponível; nenhuma operação de commit, push ou deploy foi executada.

## NEXT ACTION

**D) BLOCKED_NEEDS_MORE_EVIDENCE**

A causa da falha em produção continua pendente de um `server_boot_failed` com os novos campos. O patch de diagnóstico está preparado para revisão e eventual commit/push/deploy manual pelo usuário; nada foi publicado pelo agente. Se o usuário optar por esse deploy de diagnóstico, enviar somente a linha sanitizada do evento (ou `server_listen_error`) e o SHA. Não enviar `.env`, chaves, connection strings, dumps ou credenciais. A etapa/código determinarão a próxima investigação; não prescrever ação de banco ou configuração sem essa evidência.
