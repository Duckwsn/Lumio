# Lumio — Pós-1.0 G0: Game Mode Preparation

Data: 28/09/2026.

## STATUS

PASS_WITH_MANUAL_QA.

G0 implementa a integração arquitetural e visual de Jogos na Party existente. Não implementa Quiz, perguntas, respostas, score, timers, runtime, sessão de jogo, catálogo fictício ou persistência de jogos. Não houve commit, push, deploy, migração, mudança de variáveis ou Google OAuth.

O working tree estava limpo no início desta etapa. Foram lidos `docs/AGENT.MD`, `docs/CLAUDE.MD`, os documentos de entrada/social/call, o prompt completo, os componentes reais, o estado e os efeitos da Party. Os diffs foram auditados; alterações anteriores já presentes no código foram preservadas.

## CURRENT PARTY ARCHITECTURE

### Party/root e routing

`apps/web/src/App.tsx` mantém o estado autenticado, bootstrap, House selecionada e renderização da Party em `/house/:houseId`. Home tem uma conexão leve própria; a Party usa o Socket.IO existente para snapshot, chat, mídia, fila, signaling e presença. Papéis e membership continuam sujeitos à autoridade do backend. Nada disso ganhou um protocolo de jogos em G0.

### MainStage e mídia

`MainStage` era a fronteira entre mídia e tela compartilhada. O MediaStage já permanecia montado numa camada que alternava visibilidade; não foi necessário extrair/recriar o engine. `MediaStage` é o Lumio/UniversalPlayer real: um MediaController, um provider ativo e no máximo um iframe YouTube ou vídeo Drive. Revision e estado de playback vêm do servidor; posição visual e volume/mute são locais. A fila e seu contador de revisão pertencem ao snapshot da Party.

### Screen Share e Call

Compartilhamento usa a track de vídeo dos peers RTC existentes; o servidor controla o slot. Call e recursos RTC ficam no App, fora do MainStage. A participação automática da voz com microfone OFF continua igual; nenhuma troca de experiência solicita getUserMedia, recria peers ou abandona a voz. A captura explícita, deafen, volumes e ducking permanecem nos serviços atuais.

### Chat, People e Queue

No desktop, o drawer conserva Chat/Pessoas/Fila e o Dock conserva as ações sociais. No mobile, MobilePartyChat é estrutural e permanente abaixo do palco em retrato, ao lado em paisagem. Pessoas e Fila continuam sheets existentes com handle; Chat não recebeu handle ou um novo sistema de participantes.

## GAME MODE ARCHITECTURE

- `MainStageView` agora reconhece `media`, `screen` e `game`.
- Uma entrada direta **Jogos**, com nome acessível, ícone, estado pressionado e foco visível, fica no header, inclusive no mobile.
- GameHub é uma experiência principal no fluxo/grid do MainStage, não um modal fixed sobre o iframe. Tem uma preparação visual mínima, retorno à mídia e fullscreen; não oferece um botão falso de iniciar jogo.
- Abrir o Hub altera somente `stageView`. Não emite ações compartilhadas, requests novos, polling, join/leave ou seleção de mídia.
- A URL permanece `/house/:houseId`; Party/App não são desmontados pela troca. Não há storage para recordar o Hub. Refresh e mudança de Casa voltam ao modo mídia.
- O slot de mídia mantém a mesma posição na árvore React e o mesmo nó/provider. Camadas ocultas têm aria-hidden/inert para não oferecer controles invisíveis ao teclado.
- Os atalhos globais do MediaStage ficam desabilitados enquanto ele não é a experiência principal, evitando Space/F/seek em um player oculto durante Jogos.

Foi aplicada a skill vercel-react-best-practices: interações ficam nos handlers e a mudança de apresentação não cria efeitos de rede. Não foi usado React Activity, pois o projeto é React 18 e um engine de reprodução ativo precisa manter seus efeitos, não apenas seu DOM.

## MEDIA PRESERVATION

### YouTube

O mesmo iframe e provider continuam montados. **Exceção importante à ideia de background oculto:** a política oficial não permite reproduzir conteúdo de um player que não está sendo exibido na tela atual. Por isso, durante Jogos o YouTube ocupa uma área compacta separada, sem atravessar o Hub; não há segundo player nem extração de áudio. O iframe tem pelo menos 200 × 200 px no teste mobile. A apresentação Ambiente é suspensa visualmente durante Jogos sem apagar a preferência; reaparece no retorno.

Fontes: [Developer Policies, Additional Prohibitions](https://developers.google.com/youtube/terms/developer-policies) e [IFrame API requirements](https://developers.google.com/youtube/iframe_api_reference).

O teste com mock do IFrame API verifica identidade do iframe/engine, reprodução mantida e ausência de destroy/recreate ou outro play provocado pela troca. Não é uma validação de conteúdo YouTube real nem certificação de toda a UI existente frente às políticas do provider. Continuidade percebida de posição, anúncios e comportamento de um vídeo real precisam de QA manual.

### Google Drive

O vídeo pode ficar visualmente oculto enquanto o engine continua ativo. Trocar experiência não altera src, ticket, tempo, paused state ou provider. O E2E usa MediaStage/DriveProvider reais com endpoints de ticket e vídeo locais interceptados, mais vídeo WebM nativo gerado por canvas. Exercita retorno pausado, avanço de currentTime durante Jogos, identidade do elemento e uma única aquisição do ticket. Não acessa credenciais nem arquivos Drive reais.

### Queue e sync

G0 não muda snapshot, queueRevision, revision, comandos de playback ou adapters. A mesma Fila segue acessível em Jogos. **Voltar à mídia** dá acesso aos controles completos existentes; o player compacto YouTube reutiliza seus próprios controles mínimos. Não foi criado um mini-player independente. Edição/reorder/autoplay seguem a implementação e autorização existentes; não há fila de jogo.

## CALL PRESERVATION

O E2E de três clientes RTC reais em loopback foi ampliado: A ativa mic, B recebe áudio, A abre Jogos, B permanece em mídia, pacotes RTP continuam chegando e o número de peers/capturas de A não muda. Ao retornar, a call segue conectada e o foco volta à entrada Jogos. Os testes de microfone negado, deafen, reconnect e saída da Party continuam passando.

Isso valida transporte RTC local com áudio sintético; não substitui pessoas falando, dispositivos físicos, redes remotas ou TURN.

## CHAT PRESERVATION

Trocar `stageView` não altera a condição nem a key do ChatPanel. O teste mobile começa com rascunho, abre Jogos, confirma o rascunho, envia mensagem e vê o histórico mantido. O chat volta depois de fullscreen sem remontagem intencional. No desktop, o drawer já aberto não é fechado por Jogos; o modo principal não cria outro chat.

## MOBILE

Testadas larguras 320, 360, 375, 390, 412 e 430 px. Game usa composição própria, sem obrigar aspect ratio 16:9; o mobile reserva espaço proporcional/flexível para palco e chat, respeitando o canvas/VisualViewport já existente. Com YouTube há uma região compacta visível separada; a introdução do Hub fica mais concisa para caber junto dela. Com Drive/sem mídia o Hub usa o palco inteiro.

Em todas as seis larguras: composer visível, sem overflow horizontal ou scroll da página extra, acesso a Pessoas/Fila com handle e retorno ao mesmo modo game. Conteúdo do Hub pode rolar internamente quando a altura disponível for pequena. Landscape continua usando a composição lado a lado existente.

## DESKTOP

Hub integrado ao palco, mantendo header, drawer, now-playing e Dock. Sem sidebar permanente ou outra barra extensa. Fundo neutro, verde do Lumio, sans-serif e bordas existentes. Transições curtas de 160 ms respeitam prefers-reduced-motion. Screenshot de desktop inspecionada; o teste RTC demonstra mic ativo durante Jogos.

## FULLSCREEN

`useFullscreenSurface` extrai e reutiliza o mecanismo que antes estava no MediaStage: Fullscreen API na superfície Lumio, fallback de tela ampliada identificado, erros e tentativa de orientation lock em landscape onde disponível. Não usa fullscreen do iframe.

Game solicita fullscreen no MainStage. Chat mobile some somente nesse estado e retorna ao sair; o modo continua game. YouTube permanece na área compacta dentro dessa superfície, evitando reprodução deliberadamente oculta. Retorno à mídia sai do fullscreen do palco. Escape fecha a experiência quando adequado, sem roubar a tecla de inputs ou overlays atuais. O título recebe foco na entrada, e o retorno à mídia devolve foco à ação Jogos.

Fullscreen nativo de Jogos passou no Chromium local; fallback e diferenças de Safari/PWA/orientation lock requerem teste manual. Os E2E existentes também preservam regressão de fullscreen do player.

## SCREEN SHARE DECISION

Games é apresentação local, não comando de parada de share. Ao chegar/terminar um share ou receber sua track, o cliente que está em Jogos continua em Jogos. Os demais clientes mantêm o comportamento anterior de foco em screen/media. Mesmo iniciar share localmente enquanto em Jogos preserva a escolha game.

Enquanto há share, o seletor existente oferece **Tela compartilhada** e **Mídia**. Somente uma experiência domina o palco; a track/conexão continuam vivas fora da apresentação selecionada. O efeito que associa srcObject não depende mais de `view`, evitando limpar/reassociar stream apenas por abrir o Hub.

A fixture G0 valida stream sintético live associado ao vídeo de tela, seleção explícita screen → media e preservação do engine Drive. Não exercita o seletor de captura real do sistema operacional; isso permanece QA manual.

## PREPARATION FOR G1

O ponto de extensão é a camada `game` do MainStage e o GameHub. G1 poderá inserir a experiência de um jogo nessa fronteira, com Runtime/Session/Actions/Snapshot/Revision próprios quando necessários, reutilizando serviços da Party e autoridade existente. Não há registry artificial, enum de protocolo, tabelas, Redis, presença “jogando”, lobby ou abstração prematura.

## TESTS

- Typecheck: aprovado, web e server.
- Lint: aprovado, web e server (scripts atuais baseados em TypeScript).
- Unidade/integração: 93 passaram; 5 testes PostgreSQL ignorados por ausência de LUMIO_TEST_DATABASE_URL nesta etapa. Backend/banco não foram alterados em G0.
- Dois novos testes de renderização verificam o modo game, um só engine e a região visível do iframe YouTube.
- E2E: seis testes passaram, incluindo entrada/auth/House/Party, convites, RTC com três clientes, mobile/chat/gestos/fullscreen/late join, fixture G0 Drive/screen e proporções de vídeo nativo.
- Build: aprovado.
- git diff --check: aprovado.

Correções durante QA: typings React 18 de inert resolvidos sem upgrade; borda de 2 px ajustada para preservar mínimo de 200 px do iframe; fixture React adaptada aos exports Vite; fixture WebM passou a gerar frames contínuos em vez de um frame estático com duração mínima. Essas fixtures não são incluídas no aplicativo publicado.

## KNOWN LIMITATIONS

- G0 ainda não permite jogar; texto deixa isso explícito.
- YouTube precisa permanecer visível e ocupa espaço no mobile. Drive não tem essa mesma limitação de apresentação.
- O Hub é local e não persiste após refresh.
- Há pouco espaço vertical em celulares baixos com YouTube; conteúdo do Hub é rolável. Não se resolveu antecipadamente o layout de todos os jogos futuros.
- Medições/testes não representam provider remoto, redes reais ou hardware físico. Nenhum dado real foi utilizado.

## MANUAL_REQUIRED

1. YouTube real: vídeo tocando, abrir Jogos, aguardar, voltar; conferir posição coerente, iframe único e paused state. Repetir com vídeo pausado e fila avançando enquanto o Hub está aberto.
2. Drive real autorizado: mesmo fluxo, incluindo arquivos longos e rede lenta. Conferir reprodução/ticket/Range e retorno ao ponto atual sem restart.
3. Android/iOS e PWA: teclado, safe areas, altura baixa, landscape, fullscreen nativo/fallback e orientação.
4. Dois usuários remotos/TURN: fala humana com mic ON, deafen e volume durante Jogos; confirmar nenhuma renegociação/novo prompt apenas pela apresentação.
5. Share real: iniciar/encerrar captura enquanto um cliente explora Jogos; confirmar continuidade da track e seleção explícita da apresentação.
6. Desktop: chat aberto/rascunho, Fila com reordenação e provider avançando, Escape com overlays, zoom e leitores de tela.

## FILES_CHANGED

- `apps/web/src/App.tsx`: entrada Jogos, estado local, fullscreen de atividade e preservação da escolha em eventos de share.
- `apps/web/src/components/MainStage.tsx`: modo game, camada de Hub, mídia persistente, foco/teclado e fullscreen.
- `apps/web/src/components/GameHub.tsx`: novo Hub mínimo de preparação.
- `apps/web/src/components/useFullscreenSurface.ts`: mecanismo compartilhado de fullscreen.
- `apps/web/src/components/MediaStage.tsx`: reutilização do hook e habilitação contextual dos atalhos.
- `apps/web/src/components/MobilePartyChat.tsx`: comentário da regra de fullscreen da experiência.
- `apps/web/src/styles.css`: layout Game responsivo, player compacto reaproveitado, fullscreen e reduced motion.
- `apps/web/src/security.test.tsx`: cobertura de apresentação/engine único.
- `e2e/party.spec.ts`: integração de Jogos aos testes mobile/RTC e fixture Drive/screen.
- `docs/AGENT.MD`: invariantes permanentes.
- Este relatório.

Evidências locais: `test-results/g0-desktop-games.png` e `test-results/g0-mobile-games.png` (arquivos de QA ignorados pelo Git, regenerados pela suíte E2E).
