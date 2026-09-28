# HOUSE_RESTORE — investigação de P2022

28/09/2026. Referência local atual: `c3f701c` (logger do hotfix). Último deploy funcional informado: `09576c5`. Nenhum acesso ou alteração em produção pelo agente.

## Resultado e limite da evidência

O log do Render comprova falha de coluna esperada pelo Prisma na consulta de restore social. Não é um erro de conteúdo NULL, decrypt, Google OAuth ou validação de um convite. Auth e Drive já concluíram suas etapas nesta tentativa; Media ainda não iniciou.

**Coluna faltante em produção: ainda não comprovada**, porque o logger deliberadamente omite `meta.column` e o catálogo remoto não foi consultado. **Hipótese principal: `HouseInvite.codeHash`**, única coluna nova no conjunto consultado desde `09576c5`.

Reprodução real em PostgreSQL descartável: criar schema com as três migrations anteriores; inserir Casa/Party fictícias; executar `PrismaSocialRepository.load()` compilado atual. Resultado validado por assertions: `code=P2022`, `meta.column=HouseInvite.codeHash`. Isso comprova a possibilidade local, não substitui a inspeção do banco remoto.

O mesmo inspetor contra um segundo banco de QA com as quatro migrations encontrou `missingColumns=[]` e as quatro migrations concluídas/checksums compatíveis. Não há evidência de migration adicional necessária no código.

## Consulta exata e colunas esperadas

Arquivo `apps/server/src/prismaSocialRepository.ts`, método `load()`:

```ts
db.group.findMany({ include: { rooms: true, members: true, invites: true, activity: true } })
```

É a única chamada ao banco nesse método. Os includes sem `select` carregam todos os campos escalares dessas relações, não somente os campos usados pelo mapper. O engine pode executar múltiplos SELECTs para materializar o conjunto. Não há include aninhado de User, GoogleDriveConnection, AuthSession, Playlist ou MediaItem nesse restore.

| Modelo/tabela | Todos os campos escalares selecionados |
| --- | --- |
| Group | id, name, avatar, ownerId, createdAt |
| Room | id, groupId, name, mode, mediaControl, queueControl, skipVotingEnabled, skipVoteThreshold, autoplayNext, queueRevision, createdAt |
| GroupMember | id, groupId, userId, role, joinedAt, lastSeenAt |
| HouseInvite | id, groupId, createdById, tokenHash, codeHash, role, maxUses, uses, expiresAt, revokedAt, createdAt |
| HouseActivity | id, groupId, actorId, kind, text, createdAt |

Schema sem `@map`, `@@map` ou `@@schema` nesses modelos; nomes de tabelas/colunas coincidem com os modelos. Datasource usa DATABASE_URL; parâmetro `schema` da conexão seleciona o namespace, normalmente public. O mapper NULL→undefined só roda **depois** da consulta. Uma coluna nullable precisa existir fisicamente mesmo quando todos os valores seriam NULL.

## Origem nas migrations

- `20260925115111_initial_postgres`: cria todas as cinco tabelas e todos os campos acima exceto `GroupMember.lastSeenAt` e `HouseInvite.codeHash`.
- `20260925120312_member_last_seen`: acrescenta `GroupMember.lastSeenAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- `20260928110000_invite_code`: acrescenta `HouseInvite.codeHash TEXT` nullable e o índice único `HouseInvite_codeHash_key`.
- `20260925115748_auth_color`: acrescenta User.color; essa tabela não é incluída pela consulta social.

Entre `09576c5` e o atual, a única mudança de schema nesses cinco modelos é codeHash. O mapper lê `entry.codeHash ?? undefined`, salva `entry.codeHash ?? null` e o map de códigos só recebe valores presentes. NULL não causa P2022; **ausência física de coluna** pode causar.

Não editar schema para ocultar codeHash, reduzir o select para contornar o erro ou desabilitar o restore. Isso quebraria ou mascararia a persistência de códigos.

## Por que migration aplicada e P2022 podem coexistir

Ainda não há evidência para escolher uma destas causas:

1. Migration executada contra banco/schema diferente daquele usado pelo Web Service. DATABASE_URL do terminal que fez a aplicação pode diferir da variável do backend, do nome do banco ou do parâmetro schema. Endpoints interno e externo podem representar o mesmo banco apesar de hosts diferentes.
2. Histórico da migration marcado como concluído/baselined sem corresponder ao estado físico atual; ou schema alterado/restaurado depois. Status de migration não comprova todas as colunas físicas.
3. Migration aplicada em outro namespace com tabelas homônimas. Verificar namespace e cópias das cinco tabelas.
4. Conteúdo da migration/deploy/client gerado não coincide com o artefato efetivamente em execução. Conferir SHA, schema gerado e checksums dos arquivos versionados.

Não concluir que a migration foi ignorada ou que houve erro manual sem esses resultados. O arquivo SQL versionado acrescenta a coluna explicitamente; se ele foi executado com sucesso **nesse mesmo banco e namespace**, e não houve alteração posterior, codeHash deve existir.

Prisma 6.12 é a versão instalada. `migrate deploy` aplica migrations pendentes, não detecta drift físico completo; `migrate status` compara arquivos e histórico. Fonte oficial: https://docs.prisma.io/docs/orm/reference/prisma-cli-reference . Não usar comandos de Prisma 8 no projeto atual.

## Verificação segura — sem novo deploy

Foi criado `apps/server/scripts/inspect-house-schema.cjs`. Não é chamado pelo servidor, não muda package.json e não carrega .env automaticamente. Usa somente DATABASE_URL do ambiente em que você o executa.

O script:

- abre uma transaction com `SET TRANSACTION READ ONLY` e confirma read-only antes de consultar;
- compara campos escalares do **client gerado instalado** com pg_catalog no schema da URL;
- consulta apenas metadados físicos e campos selecionados de `_prisma_migrations`, nunca linhas de usuários, hashes de convite, ciphertext ou tokens;
- não imprime URL, host, senha, query, stack, logs de migration ou erros Prisma brutos;
- informa missingColumns/missingTables, se o client espera codeHash e registros/checksums das quatro migrations;
- limita timeout e fecha a conexão; saída não-zero quando faltam colunas é intencional.

### Opção local no PowerShell

1. Estar na raiz do projeto com dependências e Prisma Client 6.12 gerado. Este checkout já possui o script. Não é necessário publicar nem fazer outro deploy para esta leitura.
2. No Render, conferir **privadamente** qual PostgreSQL está associado ao DATABASE_URL do backend. Copiar a conexão **externa TLS** desse mesmo banco, preservando o mesmo database e schema. A conexão interna costuma não ser acessível fora da rede Render. Não compartilhar a URL aqui.
3. Executar com entrada mascarada, sem salvar a URL no histórico do terminal ou alterar o .env:

```powershell
$taskPreviousDatabaseUrl = $env:DATABASE_URL
$taskDatabaseUrl = Read-Host 'DATABASE_URL externa do mesmo banco/schema do backend (não compartilhe)' -AsSecureString
try {
  $env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $taskDatabaseUrl).Password
  node apps/server/scripts/inspect-house-schema.cjs
} finally {
  $env:DATABASE_URL = $taskPreviousDatabaseUrl
  $taskDatabaseUrl.Dispose()
}
```

Este é um acesso remoto de leitura executado por você, não pelo agente. Não mudar DATABASE_URL do Web Service para executar a inspeção. Não usar URL de outro banco apenas porque ele tem nome parecido.

4. Enviar o JSON do script, especialmente `missingColumns`, `missingTables`, `generatedClientExpectsCodeHash`, `migrationHistoryPresent`, `migrations` e `tablesWithMultipleSchemaCopies`. Não enviar connection strings ou screenshots de env. `targetFingerprint` é apenas um hash do endpoint/database/schema sem credenciais; hosts interno e externo podem gerar hashes diferentes para o mesmo banco, portanto não usar diferença de hash como prova conclusiva de banco diferente.

Se houver falha de conexão, o script não imprime o detalhe sensível. Não afrouxar TLS nem editar variáveis de produção como tentativa. Conferir acesso externo/SSL no ambiente confiável.

### Opção no ambiente do próprio Web Service

Se houver terminal confiável disponível e o script estiver presente no checkout desse ambiente, executar `node apps/server/scripts/inspect-house-schema.cjs` a partir da raiz, usando a DATABASE_URL já configurada. Essa opção elimina a substituição por endpoint externo. Não imprimir env ou DATABASE_URL. O script local novo não está automaticamente disponível no deploy anterior; não presumir que ele já foi publicado.

## Interpretação e correção — somente após evidência e autorização

Antes de qualquer escrita: backup/export consistente, verificar restauração em banco isolado, confirmar banco/schema/SHA/checksums e revisar a ação exata. O preview gratuito não fornece automaticamente a proteção de backup que um plano pago pode oferecer. Nenhum comando de escrita em produção foi executado ou autorizado nesta investigação.

### Coluna ausente e migration correspondente realmente pendente no mesmo banco

Depois de verificar todas as pendências, conteúdo SQL e backup, a correção usual é aplicar as migrations já versionadas ao **alvo confirmado**, uma vez, em janela controlada. O comando existente é `npm run db:migrate:deploy --workspace @lumio/server`. **Não executá-lo agora como tentativa**, nem aplicar em outro banco, nem editar a migration antiga. A migration de codeHash é aditiva, mantém tokenHash e valores existentes e deixa convites antigos com NULL.

### Coluna ausente, mas migration registrada como concluída no mesmo schema

Isso é divergência física/histórica comprovada. Rodar migrate deploy de novo normalmente não reexecuta a migration concluída. Não usar migrate resolve para fingir aplicação, não alterar `_prisma_migrations`, não resetar e não rodar todo o SQL indiscriminadamente.

Precisamos revisar resultado, backup, existência do índice e tipo/default/nullability reais. Só então preparar uma reparação aditiva exata, documentada e validada num clone de QA, com estratégia coerente de histórico de migrations. Dependendo do estado, uma migration de reparação pode ser necessária; **nenhuma foi criada** porque o estado remoto ainda é desconhecido. Não fornecer/aplicar um ALTER TABLE genérico antes de identificar a coluna e o schema.

### Coluna existente, mas o backend continua com P2022

Verificar novamente se a leitura foi feita no mesmo banco/namespace do runtime. Confirmar client gerado e artefato/SHA realmente servidos. Se missingColumns estiver vazio, obter o identificador da coluna esperada no client do runtime por diagnóstico allowlisted adicional ou inspeção desse artefato, não registrar error.meta bruto. Não alterar o banco que já parece correto.

### Outra coluna ausente

Usar o mapa de migrations acima. `GroupMember.lastSeenAt` pertence à migration de 25/09, não à de convites. Não aplicar migration de codeHash como solução para outra coluna. Se tabela/coluna-base divergir, revisar histórico e schema antes de qualquer aplicação.

## Verificações locais realizadas

- `node --check apps/server/scripts/inspect-house-schema.cjs`: OK.
- Banco legado de QA criado com os SQLs existentes das três migrations anteriores: inspetor detectou somente `HouseInvite.codeHash`, nenhuma tabela ausente.
- Consulta real do repository compilado com Casa/Party fictícias nesse banco: P2022 de HouseInvite.codeHash reproduzido por assertion, sem log de dados.
- Banco QA novo com todas as quatro migrations: inspetor detectou zero colunas/tabelas ausentes, quatro registros concluídos, checksums compatíveis.
- Script não altera bootstrap, schema, migrations, UI, call, Games ou dados da aplicação. Nenhum teste remoto foi feito.

## Próxima ação

**BLOCKED_NEEDS_MORE_EVIDENCE** quanto à coluna e à razão exatas em produção. Executar somente a leitura acima e enviar o resultado. A partir dele será possível distinguir migration pendente, alvo incorreto, namespace diferente ou drift registrado como aplicado e propor a correção específica, preservando dados, para aprovação explícita.
