# PÓS-1.0 — MOBILE EXPERIENCE V2

Data: 28/09/2026. Base: `master`, commit `ced5dd4fb7745d43fc9557ff3e333703b4d6bd99`.
Sem alterações pré-existentes no início. Sem commit, push ou deploy automático.

## Auditoria e problemas iniciais

Foram lidos os guias do repositório e os relatórios finais disponíveis. O código, não os relatórios históricos, orientou as mudanças.

O chat era montado no drawer apenas após escolher Chat. O mobile reutilizava a navegação Chat/Pessoas/Fila e regras `:has(.party-drawer.is-chat)` para reorganizar a Party. A composição não oferecia chat permanente nem gesto de recolhimento.

O problema dos controles ficou mapeado concretamente: `@media (hover:none)` forçava `opacity:1` e `pointer-events:auto` nos controles. Além disso, o timer não era iniciado consistentemente na reprodução normal, e interações podiam cancelá-lo sem reiniciá-lo. Isso contradizia o estado de visibilidade do React. A regressão E2E verifica a opacidade efetiva, não só a classe.

A execução em paisagem também revelou que o aviso de autoplay ficava abaixo dos controles, que interceptavam seu botão de retomada. O aviso agora tem prioridade na camada visual. A inspeção das capturas mostrou corte do composer por espaços fixos; a área de mensagens foi compactada e o cabeçalho/alça compartilham uma linha em paisagem. Há uma asserção específica de composer totalmente dentro da viewport.

O adapter Drive aguardava o ticket HTTP, mas não `loadedmetadata`, antes de seek/play. Um teste novo, executado antes da correção, falhou porque playback era solicitado com `readyState=0`. Também havia risco de aplicar um snapshot antigo após uma operação assíncrona mais nova. No YouTube, o ready já era aguardado; a auditoria identificou necessidade de invalidar sincronizações pendentes antigas e tratar CUED/autoplay explicitamente. Não se afirma ter reproduzido a causa única do relato em YouTube real/iOS.

## Nova composição mobile

Até 900px, `MobilePartyChat` é parte estrutural do workspace, abaixo do palco. Acima disso, o drawer e dock desktop continuam como antes. O breakpoint já era utilizado pelo projeto para layout mobile/tablet e inclui celulares em paisagem.

- Ao entrar, o chat começa expandido; seu estado não é persistido. A chave da Party reinicia o painel para outra sala.
- A alça é um botão com área de 44px, `aria-expanded`, `aria-controls` e rótulo Recolher/Expandir. Toque, Enter e Espaço oferecem alternativa ao arraste.
- Somente a alça captura Pointer Events. Mensagens conservam seu scroll independente e overscroll contido.
- Durante o gesto, refs atualizam diretamente a altura; React recebe apenas o snap final. Nenhum estado visual é enviado pelo Socket.IO. Esta aplicação das orientações React evita renderizar toda a Party a cada pixel.
- Há dois snaps, expanded/collapsed. Velocidade direcional acima de 0,35px/ms decide o sentido; gestos lentos usam o ponto médio. Cancelamento restaura o estado anterior.
- Recolhido, ficam a alça, o título e ferramentas. O corpo fica inacessível por `inert`/`aria-hidden` e não recebe foco. A transição é curta e desabilitada em reduced motion.
- Pessoas/Fila usam o drawer secundário existente, sem aba Chat no mobile. Adicionar mídia continua disponível no cabeçalho do chat e no menu da Party.
- O botão de microfone abre controles de call junto ao composer: microfone, áudio, compartilhamento quando suportado e configurações. Foi preservado o fallback para liberar áudio bloqueado da call.
- Cinema esconde o chat sem desmontá-lo, preservando rascunho/estado. Fullscreen mantém a superfície Lumio existente, inclusive tentativa de landscape e fallback/aviso quando o navegador não permite orientação nativa.

## Viewport, teclado e scroll

O workspace mobile ocupa o espaço restante, sem scroll externo concorrente. Player e mensagens têm regiões próprias. `ResizeObserver` recalcula o limite expandido ao mudar a altura; continua sendo utilizada a integração existente com `VisualViewport`/`--visual-height`. O composer inclui safe-area inferior e fonte de 16px. Uma viewport reduzida é testada, mas não equivale a abrir teclado real de Safari/iOS. Safe areas físicas, browser chrome e PWA standalone exigem aparelho real.

O meta viewport passou a incluir `viewport-fit=cover` para permitir utilização dos safe-area insets. Em paisagem a alça mantém alvo de 44px, mas compartilha a linha com título/ferramentas; o estado recolhido ocupa menos altura.

## Player e sincronização

Os controles não são mais forçados visíveis em touch. Reprodução + 2,6s sem interação esconde-os; toque revela novamente. Pausa mantém controles visíveis. Seek/pointer ativo e foco de select/teclado protegem a interação. Há tratamento de cancelamento e reinício do timer.

O servidor segue sendo a autoridade: mediaId, revision, operationId, reconnect snapshots e cálculo temporal existentes foram preservados. Não há polling novo nem seek por frame.

O controller registra a revisão na chegada, não só na conclusão; uma revisão inferior é ignorada mesmo em resync forçado. Adapters usam gerações para impedir aplicação tardia de trabalho supersedido.

- YouTube: aguarda ready, carrega a mídia mais recente e reconcilia também em CUED. A posição é calculada no instante de aplicação, usando `expectedPosition` existente.
- Drive: reutiliza a operação pendente da mesma mídia; aguarda metadados antes do seek/play; troca de mídia e destroy abortam tickets/esperas. A primeira aplicação usa seek mesmo com drift pequeno. Recuperação de ticket usa a posição/estado autoritativos mais recentes.
- Autoplay: `onAutoplayBlocked` do YouTube e `NotAllowedError` do HTML video distinguem bloqueio de política. A tela oferece “Toque para entrar na reprodução”. O gesto recalcula a posição e executa play localmente, sem emitir um comando compartilhado de Play. O aviso só desaparece após evento real de playing.

Referência primária consultada: [YouTube IFrame API — onAutoplayBlocked](https://developers.google.com/youtube/iframe_api_reference). Nenhuma política de autoplay é burlada.

## Remoção global de reações

Removidos controles, efeito flutuante, estado/timer/listener/emissão do App, nomes/assinaturas shared, handler e limite específico no servidor, CSS/keyframes e demonstração/copy de reações da Landing. A Landing não foi redesenhada. Relatórios antigos continuam como registro histórico; esta seção substitui suas menções à feature. Emoji comum digitado em mensagens não foi proibido.

## Cobertura e limitações

Unitários novos cobrem snaps por posição/velocidade, YouTube snapshot-before-ready/ready-before-snapshot, mudança de mídia durante entrada, PAUSED, rejeição de revisão antiga, autoplay bloqueado e retomada local; Drive metadata-before-play, revisão PAUSED mais nova durante espera, ready-first, política bloqueada e gesto de retomada. Testes existentes de abort/destroy/ticket antigo continuam.

Playwright usa servidor local isolado, contas/outbox descartáveis e Socket.IO real. O cenário desktop cobre Landing/login/restauração/Casa/Party/drawers/Media Hub/exclusão/logout. O cenário touch cobre chat inicial, toggle acessível, arraste com movimento antes de soltar, mensagem, Pessoas/Fila sem Chat tab, call menu, seis larguras (320/360/375/390/412/430), paisagem, viewport reduzida, cinema/restauração, reentrada expandida, ausência de reações, late join PLAYING/PAUSED e fallback de autoplay.

O player YouTube no E2E é uma fixture controlada; Drive é coberto por adapters com video/fetch simulados e testes de API existentes. Isso não comprova reprodução oficial, autoplay ou streaming Google real em aparelhos. Nenhuma conta Google, credencial, banco ou Casa hospedados foram usados nestes testes.

## Resultados finais

STATUS: **PASS_WITH_MANUAL_QA**.

| Validação | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (scripts do projeto: TypeScript, não ESLint) |
| `npm test` | 78 PASS: servidor 60, web 14, service worker 4; 5 SKIP de PostgreSQL |
| `npm run test:e2e` | 2 PASS: desktop e mobile touch; última execução completa: 31,0s |
| `npm run build` | PASS: shared, servidor e web |
| `git diff --check` | PASS |
| Busca de código runtime de reações | Nenhuma ocorrência em fontes apps/packages |

Os 5 testes PostgreSQL e smokes dependentes de banco não foram executados: não há `LUMIO_TEST_DATABASE_URL` configurada e o daemon Docker local está desligado. Não se utilizou banco hospedado. Sem alterações de schema, `db:generate`/migrations não são necessários nesta atualização. Smokes locais HTTP/Socket.IO fazem parte da suíte de integração/E2E, mas não substituem o smoke de produção PostgreSQL.

Uma execução E2E foi interrompida pelo encerramento inesperado do worker Windows (`3221226505`), antes do cenário desktop (0ms). A suíte foi repetida integralmente, sem alterar código para contornar a falha, e terminou com os dois cenários aprovados. Não foi determinada a causa do encerramento do processo.

Capturas locais inspecionadas: `test-results/mobile-chat-430.png`, `mobile-landscape.png` e `mobile-fullscreen.png`. São artefatos ignorados e podem ser substituídos na próxima execução dos testes. O fullscreen capturado mostra a superfície Lumio em paisagem sem chat externo. Resta validar em dispositivo real.

## Arquivos principais

- `apps/web/src/components/MobilePartyChat.tsx`: composição, acessibilidade, gesto/snaps e breakpoint.
- `apps/web/src/App.tsx`: chat estrutural, ferramentas e call composer; retirada de reações.
- `apps/web/src/components/MediaStage.tsx`: controles e fallback de gesto.
- `apps/web/src/media/MediaProvider.ts`: readiness, supersessão e retomada local.
- `apps/web/src/media/MediaProvider.test.ts`, `e2e/party.spec.ts`: cobertura de regressão.
- `apps/web/src/styles.css`, `apps/web/src/landing.css`, `apps/web/src/components/LandingPage.tsx`: layout e retirada da feature obsoleta.
- `apps/web/index.html`: viewport-fit para safe areas.
- `packages/shared/src/index.ts`, `apps/server/src/index.ts`: retirada do contrato/handler de reações.

Não foram alterados OAuth/scopes, schema/migrations, arquitetura WebRTC, providers, TURN ou variáveis reais de produção.

## MANUAL_REQUIRED — roteiro em aparelho real

1. Em Android Chrome e iPhone Safari, entrar numa Party: player e chat já presentes. Repetir como PWA standalone.
2. Arrastar só pela alça para baixo/cima; testar gesto lento/rápido, toque e cancelamento. Scroll de mensagens não deve arrastar painel.
3. Abrir teclado, digitar/enviar, fechar teclado e girar o aparelho. Conferir composer, player, safe areas e ausência de scroll horizontal.
4. Abrir Pessoas, Fila e menu do microfone; testar entrada/mute/áudio bloqueado e compartilhamento onde suportado.
5. Com vídeo tocando, aguardar os controles desaparecerem; tocar para revelar. Manipular seek sem desaparecer durante o gesto. Pausar.
6. Cinema/fullscreen em paisagem: chat não cobre vídeo; sair restaura chat/rascunho. Quando orientação não puder ser travada, girar manualmente.
7. Com duas contas/celulares, entrar durante PLAYING e PAUSED. Repetir com YouTube e Drive real, troca de mídia durante entrada e reconexão.
8. Se autoplay for bloqueado, confirmar aviso e um único gesto para entrar no ponto atual sem pausar/reiniciar os demais.

Deploy: não realizado. Commit/push: responsabilidade do proprietário.
