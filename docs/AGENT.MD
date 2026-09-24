# Lumio — guia operacional para agentes

## Missão

Evoluir o Lumio com segurança sem quebrar o caminho principal: Landing → autenticação → Home → Casa → Party.

## Antes de editar

1. Leia `docs/ENTRY_FLOW.md` e `docs/SOCIAL_ARCHITECTURE.md` quando a tarefa tocar entrada, Casa, membros, convites, presença ou permissões.
2. Consulte o componente e o endpoint existentes antes de criar outro fluxo.
3. Verifique o estado do Git e não sobrescreva mudanças que já pertençam ao usuário.
4. Identifique se a alteração é de frontend, backend, contrato compartilhado, banco ou documentação.
5. Faça uma verificação curta do comportamento atual antes de modificar uma área sensível.

## Fluxo de negócio esperado

```text
Landing pública
  -> Login/Signup
  -> Home autenticada
  -> criar ou abrir Casa
  -> validar membership no servidor
  -> conectar Party realtime
```

O Home não deve inicializar Socket.IO, WebRTC, busca de mídia ou componentes pesados da Party. Esses recursos pertencem à rota `/house/:houseId` e devem continuar lazy-loaded quando possível.

## Regras de backend

- Use as funções de autenticação e autorização existentes, como `requireUser`, `requireRoomMember` e as verificações de permissão centralizadas.
- Toda rota sensível deve validar usuário, membership e papel no servidor.
- Ao alterar um contrato de API, atualize primeiro `packages/shared` e depois os consumidores.
- Valide payloads de entrada; não aceite IDs, tokens, URLs ou papéis sem validação.
- Ao mudar estado social que aparece em tempo real, atualize o snapshot/evento correspondente.
- Não retorne token bruto de convite em listagens ou logs.
- Não use dados seed, nomes de demonstração ou fallback silencioso em fluxos reais.
- Não faça migração destrutiva nem apague dados sem solicitação explícita.

## Regras de frontend

- Reutilize `EntryExperience` e os componentes existentes antes de duplicar páginas.
- Preserve a Party aprovada; mudanças visuais grandes exigem pedido explícito.
- Mantenha estados de carregamento, erro, vazio e sucesso distintos.
- Use `aria-label`, `type`, `autocomplete` e foco coerentes em formulários.
- Evite efeitos que dependam de objetos recriados a cada render; prefira dependências primitivas e estado derivado.
- Não esconda falhas de API como sucesso local.
- Para ações destrutivas ou de acesso, explique o resultado e peça confirmação dentro do fluxo apropriado.

## Invariantes de mídia

- Existe uma única Party, uma única fila e um único UniversalPlayer.
- Nunca crie player de áudio paralelo para conteúdo do YouTube, extraia áudio ou use APIs não oficiais.
- Biblioteca é uma decisão explícita de guardar; histórico é criado ao iniciar playback; playlist é uma coleção; fila é estado realtime. Não misture esses conceitos.
- Use a identidade canônica `provider + providerMediaId` para deduplicar mídia persistente.
- Toda mutação da fila deve incrementar `queueRevision` e transmitir a ordem autoritativa.
- Avanço por fim de mídia deve usar `queue:advance` com `expectedMediaId`; não use `queue:next` no callback `ended`.
- Alterações de biblioteca e playlist devem emitir `media-hub:update` para clientes conectados.
- Membros colaboram por padrão; exclusão de playlist e limpeza de fila continuam protegidas por permissão no backend.
- O servidor é a autoridade do playback. Comandos semânticos carregam `mediaId`, `revision` e `operationId`; comandos de mídia antiga ou revisão obsoleta são ignorados.
- `currentTime` do provider é estado local de apresentação e nunca deve ser transmitido continuamente por WebSocket. Sincronize em eventos semânticos, entrada/reconexão, retorno de background e checkpoints esparsos.
- Snapshots com mídia em reprodução devem trazer a posição calculada e `startedAt` rebaseado para o instante do snapshot, evitando somar o tempo decorrido duas vezes.
- O provider traduz capacidades e eventos, mas não decide estado compartilhado. Eventos remotos aplicados ao provider não podem voltar como novos comandos da Party.
- YouTube usa somente o IFrame Player API oficial, sem extração de áudio e sem controles nativos expostos sobre os controles do Lumio Player.
- Volume e mute são preferências locais. Play, pause, seek e velocidade são estado compartilhado.
- O callback `ended` pede `queue:advance` uma única vez por `mediaId + revision`; o servidor valida `expectedMediaId` e a configuração `autoplayNext`.

## Call e screen share

- Consulte `docs/CALL_V4.md` antes de editar WebRTC. A call usa P2P mesh na Party existente; o player tem ciclo de vida independente.
- `voice:join` registra apenas um socket ativo por usuário/Party; ofertas e candidatos são enviados somente ao socket de destino descoberto. Não recrie peers a partir de sinal obsoleto.
- Use `onnegotiationneeded` para negociar tracks e ICE restart; não abra um segundo caminho manual de offers.
- Mute não reacquire microfone. PTT deve liberar ao perder foco/ocultar aba. Ducking é volume local e não modifica o volume base salvo.
- Screen share usa uma track na conexão existente, exige autorização do servidor e libera o slot quando o dono sai/desconecta. Não solicite captura na entrada da Party.
- Credenciais TURN estáticas são visíveis para clientes autorizados; use credenciais temporárias em produção. A ausência de TURN limita conectividade entre redes.

## Integrações e ambiente

- Chaves de API ficam no `.env` do servidor e nunca no bundle do Vite.
- Para Google Drive, consulte `docs/GOOGLE_DRIVE.md`; não exponha tokens, tickets de playback nem URLs diretas de mídia do Google. A conexão Google não autentica no Lumio.
- Para login, consulte `docs/AUTH_V2.md`: Google Identity e Google Drive são autorizações independentes; o `sub` Google identifica o vínculo externo, mas Casa/Party sempre usam o User Lumio. Não vincule por e-mail sem autenticar a conta Lumio nem permita remover o último método de login.
- O `.env.example` deve documentar nomes necessários sem conter segredos reais.
- YouTube, Drive, Spotify e WebRTC devem ter estados claros quando não configurados ou quando o navegador bloquear a permissão.
- Ao adicionar uma integração, implemente tratamento para timeout, erro de credencial, limite da API e resposta vazia.

## Verificação mínima

Após alterações de código, execute os checks compatíveis com a área tocada:

```powershell
npm run build --workspace @lumio/shared
npm run typecheck --workspace @lumio/web
npm run typecheck --workspace @lumio/server
npm run lint --workspace @lumio/web
npm run test --workspace @lumio/server
```

Smoke test recomendado:

1. Abrir `/` em janela anônima.
2. Criar conta.
3. Confirmar que a Home começa sem Casas.
4. Criar uma Casa e verificar a entrada na Party.
5. Abrir a Casa em outra aba/usuário e verificar presença e membership.
6. Testar um convite válido, expirado, revogado e já utilizado quando aplicável.
7. Atualizar a página e confirmar que a rota e o estado de acesso continuam coerentes.

## Diagnóstico de desenvolvimento

Se a API não iniciar:

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen
Get-Process -Id <PID>
```

Se o botão não produzir navegação, verifique nesta ordem:

1. Console do navegador.
2. Aba Network para a requisição correspondente.
3. Logs do processo `SERVER`.
4. Status HTTP e corpo JSON retornado.
5. Rota atual e sessão salva no navegador.

Não trate `EADDRINUSE` como erro da aplicação antes de confirmar qual processo já está usando a porta.

## Definition of done

Uma tarefa está pronta quando:

- a implementação atende ao pedido sem ampliar o escopo;
- autorização e validação continuam no backend;
- os estados de erro e carregamento estão tratados;
- os checks relevantes passam ou as falhas ficam documentadas;
- nenhuma chave ou dado sensível foi exposto;
- a documentação foi atualizada se o comportamento ou a arquitetura mudou.

## Casa e presença V2

- House é o limite de membership; Party é a sessão efêmera. Home usa só um socket leve para resumos, sem entrar na Party.
- A matriz de permissões compartilhada está em `packages/shared/src/index.ts`; o servidor é a autoridade em HTTP e WebSocket.
- O host só sai depois de transferir a Casa a outro membro. A troca mantém exatamente um host no adapter em memória.
- Remoção de membro ativo deve revogar imediatamente Party, Call, screen share e grants do Drive; não basta ocultar botões na UI.
- Presença online da conta, presença na Party e presença na Call são eixos distintos. Múltiplas abas e grace period de cinco segundos evitam flapping.
- Google Identity autentica a conta Lumio e não concede acesso ao Google Drive. Consulte `docs/SOCIAL_ARCHITECTURE.md`.

## Media Experience V3

- Use `QueueItem.id` para distinguir ocorrências repetidas da mesma mídia. `provider + providerMediaId` identifica a mídia canônica, não a posição na fila.
- `ENDED` deve incluir `expectedQueueItemId`; histórico registra uma vez por ocorrência quando o playback começa.
- Reorder de playlist exige `expectedUpdatedAt`; lote playlist→fila exige `queueRevision` e deve informar itens indisponíveis ignorados.
- Descobrir consulta apenas YouTube; Biblioteca é busca local da Casa; Drive só navega pastas pessoais. Não associe `fileId` a autorização.
- A fonte runtime do Media Hub ainda é o adapter em memória. Não descreva os models Prisma como persistência ativa. Consulte `docs/MEDIA_HUB.md`.

## Mobile e PWA

- Mobile, tablet e desktop usam o mesmo frontend, player, call e Media Hub. Preserve a Party desktop aprovada ao ajustar breakpoints.
- No mobile, Chat acompanha o player no mesmo canvas; controles da call ficam no microfone da caixa de mensagem. Abrir o chat não deve desmontar o player ou reiniciar a call.
- Tela cheia usa a Fullscreen API no elemento persistente do Lumio Player (provider + controles), separada do modo cinema. No celular, tenta travar em paisagem por capability detection e libera a orientação ao sair; quando indisponível, orienta a rotação manual. A tela ampliada local deve ser identificada como fallback. Trocar provider não deve recriar esse elemento.
- O Dock respeita safe areas; drawers viram sheets no celular. Inputs precisam permanecer visíveis com teclado virtual; zoom não deve ser bloqueado.
- APIs de microfone, seleção de saída e screen share exigem capability detection. Não ofereça push-to-talk por tecla em tela touch.
- A PWA é progressiva, não offline-first: Party, call, YouTube e Drive exigem rede. O service worker só cacheia assets estáticos, nunca API, OAuth, tickets, tokens ou mídia privada.
- Atualizações do service worker não devem recarregar uma Party automaticamente; a pessoa decide quando aplicar a versão nova.
- A marca oficial está em `apps/web/brand/lumio-logo-master.png`; gere favicon, símbolo web e ícones PWA somente a partir desse master com `apps/web/scripts/generate-icons.ps1`. Não restaure o antigo ícone com a letra “L” nem modifique a geometria ou as cores do símbolo.
