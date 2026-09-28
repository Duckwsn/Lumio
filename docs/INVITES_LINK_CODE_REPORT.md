# Lumio — Convites por link e código

Data: 28/09/2026. Implementação local; sem commit, push ou deploy. Alterações anteriores de mobile/call foram preservadas.

## Auditoria e decisão

Antes da correção, a Home dizia “Link ou código”, mas aceitava somente o token longo do link. Convidar mostrava apenas link. O token possui 192 bits aleatórios, é retornado uma vez e persistido como SHA-256; não é recuperável para derivar códigos antigos. Convites pertencem a uma Casa, admitem validade de 1 hora/24 horas/7 dias, limite de 1–100 usos e revogação. Criação e revogação mantêm as permissões existentes; novos membros recebem MEMBER, não privilégios arbitrários enviados pelo cliente.

Não foi criado outro sistema de membership. O mesmo convite agora tem token e código, ambos apontando para o mesmo objeto/registro. Usos, validade, revogação e permissões são compartilhados. Já-membros continuam podendo abrir a Casa sem duplicação e sem outro uso, inclusive quando um convite conhecido já está esgotado ou revogado: é acesso por membership existente, não novo aceite.

## Código e proteção

- Formato: dez caracteres aleatórios, exibidos em dois grupos de cinco; alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (30 símbolos), sem 0/O/1/I/L. Entropia aproximada: 49 bits, menor que a do link longo.
- Geração com `crypto.randomInt`; rejeição/regeração de colisões conhecidas, com tentativas limitadas. Índice único PostgreSQL fornece a segunda barreira de unicidade.
- Backend ignora espaços/hífens e diferenças de caixa; rejeita caracteres fora do alfabeto e comprimentos incorretos. Frontend aplica a mesma regra para facilitar digitação.
- Hash de código: SHA-256 com domínio `invite-code:v1:` e representação normalizada. Token e código brutos não são persistidos nem enviados nos detalhes da Casa. O hash não transforma um código de baixa entropia em segredo forte contra ataque offline; trate dumps e backups como privados.
- `GET /api/invites/:token` e `POST /api/invites/:token/accept` mantêm as URLs existentes e aceitam também código. Consulta e aceite compartilham 30 requisições/IP/15 minutos em um bucket único, não um bucket por código. Aceite exige autenticação.
- Código inexistente, expirado, revogado ou esgotado retorna estado INVALID, sem revelar nome da Casa a não-membros. Convite válido revela o resumo necessário ao aceite: posse do código é a credencial de convite. Links longos preservam os estados detalhados anteriores.
- Limitador e alteração de contador são do runtime de um processo. PostgreSQL salva snapshots em transação, mas não há claim CAS distribuído ou rate limiter compartilhado entre instâncias. Não escalar para vários processos sem resolver essas limitações.

## Interface e autenticação

Convidar apresenta código selecionável, Copiar código, link selecionável e Copiar link; Compartilhar aparece quando a Web Share API existe. Falha de compartilhamento usa cópia do link; cancelamento nativo não é erro. Falha de clipboard orienta seleção manual. Código não quebra linha e botões têm pelo menos 44 px de altura.

Entrar com convite aceita código ou link da mesma origem. O caminho `/invite/:identifier` é conservado em `next` após autenticação. A entrada continua explícita; já-membros veem Abrir Party. A tela distingue falha de rede e limite de tentativas, sem apagar o convite. Google Login/Drive, scopes e projeto OAuth não foram alterados. Guards de ações impedem requisições duplicadas de criação/aceite; criação não foi movida para efeitos React, seguindo a skill vercel-react-best-practices.

## Banco e compatibilidade com produção

Migração: `apps/server/prisma/migrations/20260928110000_invite_code/migration.sql`.

```sql
ALTER TABLE "HouseInvite" ADD COLUMN "codeHash" TEXT;
CREATE UNIQUE INDEX "HouseInvite_codeHash_key" ON "HouseInvite"("codeHash");
```

Campo nullable, sem apagar/modificar convites anteriores. PostgreSQL permite múltiplos NULL no índice único. Convites legados seguem por token; não existe backfill do código, pois a credencial original não está disponível. Criar novo convite obtém link e código sem revogar os antigos. Código/link são exibidos somente na resposta de criação; não é possível recuperá-los posteriormente de um hash.

O schema Prisma e `PrismaSocialRepository` carregam/salvam `codeHash`. Apenas o PostgreSQL descartável de QA recebeu a migração nesta tarefa; produção não foi acessada ou alterada.

### Aplicação manual posterior

1. Fazer backup recuperável e conferir a DATABASE_URL do ambiente alvo, sem compartilhar seu valor.
2. Validar primeiro em staging/cópia; pausar escritas durante a migração se necessário. O índice comum pode bloquear escritas enquanto é criado em uma tabela grande.
3. Aplicar no ambiente do backend, usando o código atualizado:

   ```powershell
   npm run db:migrate:deploy --workspace @lumio/server
   npm run db:generate --workspace @lumio/server
   npm run build
   ```

4. Iniciar o backend atualizado somente após a migração. Publicar frontend correspondente, quando autorizado. Nenhuma variável nova de ambiente é necessária.
5. Verificar link legado, criação de código, entrada por código, revogação e persistência após reinício.

Não fazer reset do banco nem `db push` como substituto da migration. Um rollback do binário antigo não deve remover a coluna. Atenção: o repository antigo pode recriar os registros de convite ao salvar snapshots e perder hashes de código que desconhece; portanto não assumir rollback funcional de códigos sem planejamento/backup.

## Verificação

- `npm run typecheck`, `npm run lint`, `npm run build`: aprovados.
- `npm test` com `LUMIO_TEST_DATABASE_URL` apontando exclusivamente ao PostgreSQL descartável: 96 testes passaram, zero ignorados. Inclui os cinco testes reais de persistência PostgreSQL.
- Testes de código: normalização, ciclo compartilhado, rejeição/expiração/revogação, não duplicação, 100 códigos distintos, hashes sem segredo bruto, restore e token legado. Integração HTTP valida autenticação, revogação e limite agregado com identificadores diferentes.
- Migração adicional executada em schema temporário dentro de transação: tabelas anteriores populadas com convite legado; aplicação da nova migração; preservação de token/contador e NULL; múltiplos legados NULL; rejeição de hash duplicado. Transação revertida após asserções.
- Novo E2E aprovado: host cria/copia código e link; segunda conta digita código em viewport móvel; já-membro reabre; terceira conta abre link deslogada, faz login local e retorna ao convite. Ao final, três membros e dois usos.
- Suíte completa `npm run test:e2e`: cinco testes passaram, incluindo regressões de login, call automática com três clientes RTC, mobile/chat/gestos e proporções de vídeo Drive.
- Screenshot móvel de 390 × 844 inspecionada: código legível/selecionável, ações acessíveis e ausência de overflow horizontal.

Não foi realizado login Google ao vivo, envio externo por WhatsApp ou teste de Web Share/teclado/safe areas em aparelho físico. Fluxo Google permaneceu inalterado; retorno pós-login foi exercitado com autenticação local de teste. Nenhuma conta, Casa ou credencial real foi usada no QA.
