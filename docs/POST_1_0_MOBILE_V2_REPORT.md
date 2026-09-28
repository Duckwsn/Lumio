# PÓS-1.0 — MOBILE EXPERIENCE V2 — adendo aplicado

Data: 28/09/2026. Base deste adendo: `336edcc` (Lumio 1.1).
O Git estava limpo antes das alterações. Não houve commit, push, deploy, alteração de OAuth/scopes, banco, APIs/chaves ou protocolo de sincronização.

**Este relatório substitui a versão anterior deste ciclo.** Foram descartados o chat arrastável/recolhível e sua ocultação pelo modo cinema. A imagem de referência agora orienta exclusivamente os sheets de Pessoas e Fila.

## 1. MOBILE PARTY — composição final

Até 900px, Player/Ambiente e Chat são regiões estruturais do mesmo workspace. O Chat fica abaixo do palco também em paisagem; mensagens têm scroll interno, composer fixo na região e ferramentas Pessoas/Fila/Adicionar. Não há handle, altura manipulada por gesto, toggle, botão de fechar, estado collapsed/expanded ou armazenamento desse estado.

A altura usa distribuição flexível do espaço disponível, com mínimo para cabeçalho/composer. A integração existente com VisualViewport/--visual-height, viewport-fit=cover, fonte de 16px e safe areas permanece. Viewport reduzida é cobertura automatizada, não prova de teclado real iOS.

O microfone junto ao composer conserva entrada/mute/deafen, áudio bloqueado, screen share por capacidade e configurações. Não foram alterados tracks, peers, signaling ou captura.

### Pessoas e Fila

Reutilizam o mesmo drawer e seus conteúdos/permissões existentes. No mobile, são sheets sobre o workspace, sem aba Chat. O handle compartilhado `MobileSheetHandle`:

- captura Pointer Events somente na alça; mensagens/listas mantêm scroll;
- acompanha o gesto com translateY, armazenando coordenadas/velocidade em refs, sem renderizar o App a cada pixel;
- fecha com deslocamento superior a 30% da altura ou gesto descendente acima de 0,35px/ms, desde que exceda 8px;
- retorna à posição inicial em gesto insuficiente ou cancelado;
- permite toque, Enter/Espaço, botão Fechar e Escape do drawer existente;
- usa transição de 180ms para fechamento/retorno; reduced motion elimina a transição;
- limpa o timer ao desmontar, respeita safe area e restaura o foco pelo fluxo existente de closeDrawer.

Abrir/fechar sheets altera só a UI local. Player, chat, socket e call continuam na árvore da Party. O teste monitora construções/destruições do player ao repetir esses ciclos.

### Cinema não é fullscreen

Cinema é preferência de layout local, não a Fullscreen API. **No mobile, não esconde Chat nem sheets.**
MediaStage notifica o App quando o elemento persistente entra em fullscreen nativo ou fallback ampliado. Só essa condição oculta o Chat por atributo hidden, sem desmontá-lo. Ao sair, retorna automaticamente; rascunho e mensagens permanecem.

A tentativa de travar orientação landscape continua por capability detection. Sem suporte, permanece orientação manual/aviso. Escape encerra o fallback mesmo quando um botão está focado. Desktop continua com dock/drawer anteriores.

## 2. PLAYER — correções anteriores preservadas

Não foi reescrito MediaController nem alterado o contrato de playback nesta rodada.

- Touch revela controles; 2,6s ociosos em reprodução os ocultam. Pausa, seek ativo e interação protegida mantêm acesso.
- Late join aplica snapshot autoritativo após readiness do adapter. YouTube reconcilia latest snapshot/ready/CUED; Drive aguarda ticket e loadedmetadata, cancela trabalho obsoleto e aplica seek inicial.
- Revisões antigas continuam rejeitadas, mesmo em resync forçado.
- Bloqueio de autoplay continua como estado próprio: “Toque para entrar na reprodução”. O gesto busca a posição atual e retoma localmente, sem emitir Play compartilhado ou reiniciar outros clientes.
- Fonte de tempo permanece a existente: posição local do adapter e autoridade mediaId/revision/startedAt do servidor. Não há clock paralelo, intervalos novos de sync ou eventos de letras.

Os testes existentes de readiness, PAUSED/PLAYING, supersessão, tickets, abort/destroy e retomada local continuam aprovados.

## 3. AMBIENTE — causa e arquitetura corrigida

Antes, `.music-presentation` era um cartão pequeno: left/right/bottom fixos, capa de 58px e fundo translúcido. O iframe/video normal permanecia visível atrás. Além disso, regras explícitas de :fullscreen/fallback-fullscreen ocultavam a apresentação.

Agora, o Ambiente ocupa **toda a player-frame** e apresenta artwork + título + canal/provider sobre superfície própria. O visual normal fica com opacity:0/pointer-events:none; o iframe/video e adapter **continuam montados**, sem criar player de áudio paralelo.

Não se trata de corrigir empilhamento de dois players: existe um engine e uma apresentação alternativa. Classes locais mudam a superfície; não participam das dependências de criação do controller. Fullscreen usa a mesma superfície e não remove Ambiente.

A barra compartilhada conserva play/pause, seek, mute/volume por capacidade, fullscreen e botão Entrar/Sair do Ambiente, inclusive dentro de fullscreen. Não existe segunda barra. O botão usa a preferência `lumio.presentation.v1` existente; alternar não muda a visualização dos outros participantes.

Layout adapta portrait, landscape, baixa altura e desktop, sem redesenhar Party/Landing. Erros de reprodução e fallback de gesto continuam prioritários e não são ocultados pelo artwork.

## 4. AMBIENT LIGHT — estratégia legítima

### Antes e causa da baixa visibilidade

O efeito estava atrás do player (z-index negativo), com blur de 54px e override reduzindo opacidade para 9%. A superfície opaca do player e o recorte do workspace mobile limitavam sua presença visual. Não havia leitura de frames nem fonte dinâmica de cores.

### Agora

A luz fica numa camada decorativa dentro da superfície, sem interceptar toque. Em Vídeo, uma máscara radial concentra a impressão luminosa nas bordas. Em Ambiente, ocupa difusamente o fundo. Opacidades são 32%/26%, com saturação moderada e blur estático de 24px. O gradiente base Lumio mantém fallback mesmo sem artwork ou se a imagem falhar.

A fonte é o thumbnail já existente nos metadados; YouTube pode usar o endereço padrão de thumbnail do vídeo identificado pela integração. Não há scraping, proxy de vídeo, extração de áudio/frames, canvas ou leitura cross-origin.

**Não acompanha frames reais do YouTube.** A cor/impressão vem do artwork estável e muda quando a mídia/artwork muda. Não se calcula numericamente uma paleta de pixels. Isso é um compromisso visual explícito, não sincronização cromática em tempo real.

### Frequência e desempenho

Não há polling/RAF/intervalo novo. A fonte muda por troca de mídia/artwork; fade de entrada de 600ms e transição de opacidade de 500ms suavizam as mudanças. Blur não é animado continuamente. Respeita prefers-reduced-motion; liga/desliga da luz funciona também com Ambiente ativo. Não depende de medir cada frame ou atualizar o App durante playback.

Sem benchmark de bateria/aparelho fraco: inspeção de código e regressões não comprovam custo energético em todos os dispositivos. A opção de desligar permanece.

### Drive

O serviço atual solicita `id,name,mimeType,size,modifiedTime,videoMediaMetadata(durationMillis),capabilities(canDownload)`, não thumbnailLink. Não foram ampliados campos/scopes nem expostas URLs privadas. Na ausência de thumbnail já fornecida, usa símbolo Lumio e iluminação base. Um futuro artwork privado precisa respeitar autorização/cache existentes.

## 5. LYRICS — capability e decisão pendente

**LYRICS_PROVIDER_DECISION_REQUIRED**

A busca nas fontes apps/packages e configuração de exemplo não encontrou integração legítima de letras. YouTube fornece título/canal/thumbnail/duração; Drive fornece metadados de arquivo/vídeo, não letras temporizadas.

`lyricsCapability(media)` declara indisponibilidade com motivo `provider-decision-required`. A seleção de apresentação consome essa capacidade e mantém Artwork View sem erro principal. Texto arbitrário em metadata, títulos ou captions não é tratado como fonte aprovada. Não há heurística para declarar todo YouTube como música.

Nesta versão **não existe Lyrics View ativa nem sincronização de linhas**: sem fonte legítima, não foram fabricadas letras, timestamps ou provas de reprodução temporizada. A estrutura/fallback está pronta para uma decisão posterior, que deve definir fonte, licença, identificação e necessidade de credenciais. Não foi contratado/integrado serviço algum.

Quando houver uma fonte aprovada temporizada, a apresentação deverá derivar a linha do playhead local existente, inclusive em seek/pause/reconnect, sem relógio separado ou novo evento Socket.IO. Isso é requisito futuro, não funcionalidade declarada pronta.

Artwork ausente/inválido/quebrado retorna ao símbolo oficial Lumio. Título vazio usa “Mídia da Party”; canal ausente usa o provider. Ambiente funciona também em documentários e outros vídeos não musicais.

## 6. REACTIONS

A remoção global da rodada anterior permanece: nenhum controle, efeito flutuante, evento reaction:send, handler específico ou demonstração de reação foi reintroduzido. Emoji comum em mensagem não é uma reação da feature. Relatórios antigos são históricos.

## 7. TESTS e evidências

STATUS: **PASS_WITH_MANUAL_QA**; letras permanecem decisão externa declarada.

| Validação | Resultado final |
| --- | --- |
| `npm run typecheck` | PASS: shared, server, web |
| `npm run lint` | PASS: scripts TypeScript do projeto, não ESLint |
| `npm test` | 81 PASS: server 60, web 17, service worker 4; 5 SKIP PostgreSQL |
| `npm run test:e2e` | 2 PASS: última suíte completa 57,6s |
| `npm run build` | PASS: shared, server, web |
| `git diff --check` | PASS |

Os cinco testes PostgreSQL foram pulados pela suíte, sem banco de teste configurado. Esta mudança é de apresentação; nenhum schema/migration foi alterado e nenhum banco hospedado foi utilizado.

Smoke adicional com agent-browser em preview local do build: Landing renderiza e o CTA Entrar navega ao formulário. Esse preview não tinha backend associado; o formulário mostrou “Failed to fetch” ao consultar configuração. Isso **não** valida login nesse preview. O login completo é validado separadamente no E2E isolado com API local. Nenhum login Google real foi solicitado.

### Cobertura

- Unitários: fonte visual válida/inválida, fallback YouTube/Drive, metadata incompleta, ausência legítima de letras, imutabilidade do estado autoritativo e decisão de fechamento de sheet.
- Composição Drive: renderização de um único video, uma única superfície de controles, apresentação alternativa e marca fallback; não é streaming Google real.
- Integração existente: auth/security, Drive OAuth/grants/tickets/Range, servidor HTTP e Socket.IO, provider readiness/supersessão/abort, WebRTC signaling e PWA.
- E2E desktop: Landing/login/restauração/Casa/Party/drawers/Media Hub/exclusão/logout.
- E2E mobile com Socket.IO real e provider YouTube simulado: chat sem handle/toggle, mensagem, sheets com movimento antes de soltar, snap-back/drag dismiss/toque/teclado/reaberturas, instância do player preservada, seis larguras, paisagem, cinema com chat, fullscreen sem chat/restauração, late join PLAYING/PAUSED, bloqueio de autoplay e gesto.
- Ambiente: superfície completa mobile/desktop/fullscreen, provider visual oculto, posição/contagem de play e construção preservadas ao alternar, preferência local conservada na reentrada, mídia nova, pause/play/seek, artwork quebrado, ausência de lyrics, toggle de luz e reduced motion.
- Visual: capturas mobile-ambiente, mobile-chat-430, mobile-landscape, mobile-fullscreen, desktop-ambiente, mobile-people-sheet e mobile-queue-sheet em test-results. Arquivos ignorados/descartáveis de teste.

A comparação de dimensões na troca de viewport foi ajustada para ler pai/filho no mesmo instante e aguardar a acomodação do layout; antes, duas leituras separadas capturavam alturas de instantes diferentes. Não foi ocultada falha funcional por aumentar tolerância arbitrária.

Os arrastes automatizados usam Pointer Events via mouse em contexto touch Chromium. Gesto de dedo físico, teclado móvel e orientação real ainda exigem aparelho. YouTube E2E é fixture, não autenticação/reprodução oficial. Drive tem testes de lógica/composição/adapters/API simulados, **não E2E de streaming real neste adendo**. Nenhuma conta, Casa, chave ou banco hospedado foi usada.

## 8. MANUAL_REQUIRED

1. Android Chrome/iPhone Safari/PWA: Chat fixo ao entrar, sem handle/toggle e sem scroll externo/horizontal. Girar e abrir/fechar teclado com Vídeo e Ambiente, conferindo composer/safe areas.
2. Pessoas/Fila: arraste físico lento/rápido, cancelamento, scroll interno, toque, teclado e fechamento/reabertura. Validar reorder/remover/adicionar existentes e foco. Call e player não podem reiniciar.
3. Cinema: Chat continua. Fullscreen em landscape: Chat some; sair restaura mensagem em rascunho. Repetir Vídeo/Ambiente, native/fallback e browser sem orientation lock.
4. YouTube oficial e Drive autorizado: trocar apresentação, mídia/provider, play/pause/seek/volume e fullscreen mantendo reprodução/posição. Conferir vídeo normal não aparecendo atrás do Ambiente.
5. Duas contas/dispositivos: late join durante PLAYING e PAUSED, também com Ambiente salvo localmente; reconnect/troca de mídia durante entrada e autoplay bloqueado.
6. Luz em thumbnails claras/escuras, mídia sem capa e dispositivos fracos: perceptível mas sem brilho excessivo; desligar e reduced motion. Ela representa artwork, não frames.
7. Call/screen share reais durante chat/sheets/troca de apresentação: ouvir/mutar/compartilhar sem duplicar peers/tracks. TURN continua dependente da configuração existente.
8. Letras: somente após escolha explícita de fonte legítima; validar temporização por playhead local, seek/pause/resume/reconnect e fonte indisponível. Não é teste possível nesta versão.

## 9. Arquivos e entrega

Alterados: App.tsx, MobilePartyChat.tsx, MediaStage.tsx, styles.css, MediaProvider.test.ts e e2e/party.spec.ts.
Novos: MobileBottomSheet.tsx, AmbientArtwork.tsx, AmbientPresentation.ts e AmbientPresentation.test.ts.
Atualizado este mesmo relatório, sem manter requisitos antigos conflitantes como descrição da implementação atual.

As orientações React influenciaram refs para gesto frequente e preservação do engine; o navegador e capturas complementam testes determinísticos. Não foram alterados schema, migrations, OAuth, provider de mídia, backend de sync, Landing ou versão do produto.
Commit/push/deploy: não realizados por este trabalho.
