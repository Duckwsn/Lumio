# PÓS-1.0 — M1 Media Experience V4

Data: 30/09/2026. Base: `5be462d`. Escopo local; sem commit, push, deploy, migration ou operação no banco de produção.

## STATUS

Polish do UniversalPlayer e do Ambiente implementado sem reescrever o playback, o sync, a fila, a Call ou os providers. Os gates finais e as capturas efetivamente abertas constam abaixo.

## BASELINE / AUDIT

O checkout estava limpo no início do M1; S1/S2 já estavam no HEAD. Foram lidos `docs/AGENT.MD`, `docs/CLAUDE.MD`, `docs/MEDIA_HUB.md`, as orientações de Drive e os relatórios G6/S1/S2, além do código do Player, adapters, MainStage, App, CSS e E2E. Typecheck, lint, build e testes de base passaram. Antes de editar, abri capturas de estado vazio, vídeo e Ambiente desktop/mobile em `artifacts/m1/`.

Antes do M1 já existiam um MediaStage, o controller, YouTube IFrame API, Drive `<video>`, modos locais Vídeo/Ambiente, capacidades, sincronização autoritativa, fullscreen e Chat mobile permanente. Problemas observados: no desktop baixo o título podia encostar no Dock; o erro de YouTube deixava o Ambiente legível ao fundo; fallback de artwork forçava thumbnail 16:9 para quadrado; feedback de erro exibia texto cru do adapter; duração e seek tinham apresentação frágil em casos limite. A primeira rodada E2E também identificou um seletor CSS amplo demais que reduziu o iframe no modo Vídeo mobile; isso foi corrigido e o cenário focal passou. Não se encontrou fonte legítima de letras nem controle real de qualidade/legendas.

## CURRENT_MEDIA_ARCHITECTURE / UNIVERSAL_PLAYER / PROVIDERS

`App.tsx` mantém snapshot da Party e comandos semânticos; `MainStage` mantém a mesma árvore de mídia ao alternar Media/Game/Share; `MediaStage` hospeda um `MediaController`. Esse controller escolhe `YouTubeProvider` (um iframe oficial) ou `DriveProvider` (um `<video>` protegido) e destrói apenas o adapter antigo quando o provider muda. Ambiente é CSS/metadata sobre esse elemento, não um player ou socket extra. A Call permanece em escopo da Party. A mudança estética não chama `media:change`, não altera `mediaId`/`revision` e não reinicializa o controller. O iframe do YouTube agora fica visível em formato discreto também no Ambiente; em Games continua a superfície visível existente.

## PRESENTATION_MODEL / VIDEO_EXPERIENCE / MUSIC_EXPERIENCE / AMBIENT_V2

O modelo continua com duas apresentações locais: `video` e `music` (nome interno herdado para a visualização Ambiente). Não foi criado Music Mode formal nem detecção automática de música. Qualquer mídia pode receber Ambiente explicitamente, inclusive vídeos normais; essa escolha não muda o playback coletivo. `lumio.presentation.v1` em localStorage preserva a escolha naquele navegador. O vídeo permanece player-first, 16:9 no canvas; Drive conserva `object-fit: contain` para dimensões intrínsecas diferentes. O Ambiente usa uma composição horizontal de artwork legítimo, título e canal/origem, fundo escuro Lumio e brilho discreto. Não há visualizer, waveform, animação agressiva ou clone de serviço musical. `prefers-reduced-motion` remove a transição do brilho.

## ARTWORK / METADATA / TRANSITIONS / STALE_METADATA / RACE_CONDITIONS

YouTube usa a thumbnail já recebida pela integração Data API/oEmbed, ou `i.ytimg.com/vi/<id>/hqdefault.jpg` para ID válido. Não há extração de frames/pixels, canvas cross-origin ou scraping. Drive mostra thumbnail HTTP(S) já presente quando legítima; sem ela, usa o símbolo Lumio neutro. A arte 16:9 não é mais esmagada num quadrado; o fallback de marca é quadrado. `AmbientArtwork` usa chave da fonte/ID e substitui imagem com falha por marca sem conservar erro na próxima mídia. Título e canal são valores reais de `MediaState` e `metadata.channelTitle`; sem título, “Mídia da Party”; sem canal, origem do provider. Não se infere artista, álbum, ano ou gênero. O mesmo `MediaState` fornece título e arte. A conclusão assíncrona de `sync` só atualiza capacidades/velocidades se controller, mediaId e revision ainda coincidirem. Adapters existentes já guardam geração para A→B→C e cancelam ticket Drive antigo; teste de YouTube cobre três mudanças antes do READY. Isso evita resposta antiga de UI substituir a mídia atual; eventos tardios intrínsecos do provider real continuam parte da homologação manual.

## PLAYER_CONTROLS / CAPABILITIES / PROGRESS / VOLUME / PLAYBACK_RATE / QUALITY / CAPTIONS

Play/pause, seek, mute, volume, velocidade, Ambiente, cinema e fullscreen seguem capacidades reais do adapter. YouTube e Drive suportam play/pause/seek/volume/mute/rate na integração atual; qualitySelection e captions são `false` nos dois, portanto não há botões de qualidade ou legenda falsos. Velocidade fica no select compacto do desktop apenas quando há mais de uma taxa; no mobile não se exibe select nem slider de volume pequenos. Volume/mute são locais; velocidade, play/pause e seek continuam comandos compartilhados. A barra comunica posição e duração por `aria-valuetext`; o arraste usa o valor final do input, envia primeiro comando semântico validado pelo backend e só então aplica seek local. Sem duração válida a barra não finge um intervalo. Tempo formata `0:05`, `3:42`, `1:02:14`, e valores inválidos como `--:--`.

## KEYBOARD / FULLSCREEN / MOBILE / CHAT_INTEGRATION

Atalhos quando a superfície Media está ativa: Espaço/K play-pause, M mute, F fullscreen, setas esquerda/direita seek de 10 s quando disponível. Ignoram inputs, textarea, select, contenteditable, botões/sliders, modificadores e dialogs/menus; Jogos desliga atalhos de mídia. Controles ocultam após inatividade apenas durante reprodução e reaparecem por ponteiro, toque ou foco; pausa/foco/arraste impedem esconder. O mesmo `useFullscreenSurface` mantém Fullscreen API e fallback, com tentativa de paisagem no celular e UI externa escondida. Fullscreen não altera player/socket/fila/Call. Fora dele, o canvas mobile preserva proporção 16:9 e Chat/composer permanente abaixo em portrait e ao lado em landscape. Os targets centrais têm ~40–44 px; o VisualViewport/teclado continua sob o layout mobile existente. Não se força fullscreen por orientação.

## MEDIA_HUB / QUEUE_INTEGRATION / AUTOPLAY

Abrir Hub é overlay local, não interrompe a mídia. Busca YouTube e navegação Drive continuam como antes. Seleção e fila usam os comandos/permissões existentes. `queue:advance` continua validando mídia/ocorrência esperadas e `autoplayNext` da Casa; M1 não criou fila/histórico novos. Em transição, o Ambiente permanece local e apresenta a nova mídia. Autoplay bloqueado mostra ação humana “Toque para continuar”, chamando `resumeFromGesture` para convergir ao ponto atual da Party; não há spinner infinito por causa desse bloqueio.

## LOADING / BUFFERING / EMPTY_STATE / ERRORS

Enquanto o adapter não expõe controles, o palco mostra preparação; evento real `buffering` durante playback mostra espera discreta distinta de pause. Estado vazio tem CTA para adicionar mídia. Erro YouTube não tenta burlar restrição de embed; erro Drive não mistura Google Login com autorização Drive. Texto cru do adapter não é exibido, evitando stack/código/mensagem de ticket no palco. Retry força resync do mesmo controller; “Escolher outra mídia” abre o Hub sem recarregar a Party. Pular/remover permanecem opções secundárias no desktop; mobile mostra só as duas ações principais. O overlay de erro é opaco, não deixando mensagem do iframe/metadados transparecer. Reconectar Drive continua pelo fluxo de autorização existente no Hub; um arquivo excluído/formato incompatível ainda depende do provider real para diagnosticar.

## YOUTUBE / DRIVE / MEDIA_SESSION_API / LYRICS

YouTube: IFrame API oficial, um iframe visível também no Ambiente, sem áudio extraído, proxy ou controles não suportados. Drive: ticket/stream/Range e OAuth existentes intactos; M1 não altera grants, tokens, scopes ou credenciais. Browser Media Session API não estava implementada e foi adiada: ação de lock screen só deve ser adicionada se puder passar pelo servidor autoritativo sem divergir da Party e respeitar as restrições dos providers/PWA. Lyrics deferred: inexiste fonte/licença integrada; captions não são letras. Nenhuma transcrição, geração ou scraping foi adicionada.

## SYNC_REGRESSION / LATE_JOIN / CALL_REGRESSION / GAMES_REGRESSION / SCREEN_SHARE_REGRESSION / SOCIAL_REGRESSION

`media.revision`, `operationId`, `mediaId`, correção de drift e snapshot READY/late join não foram reescritos. Um E2E M1 com A/B/C autenticados confirmou mídia compartilhada, B em Ambiente enquanto A/C ficam em Vídeo, C entrando tardiamente, seek propagado e troca rápida de duas mídias sem recriar a engine YouTube. E2E existente cobre permanência do nó/instância do player ao alternar Games e fullscreen, voltar à Media, Chat mobile, Call e Share Drive. S1 House Activity ainda usa resumo público do backend; S2 online/inParty/lastSeen não recebem evento de apresentação. Não houve alteração de WebRTC, ducking, signaling, Draw, Quiz, Cards, Home ou membros. Isso é regressão local automatizada com fixture, não prova de 2–8 amigos reais/WAN/TURN.

## SECURITY / PRIVACY / PERFORMANCE / ACCESSIBILITY

Sem novo endpoint ou payload; nada de Drive token, ticket, URL privada, OAuth, frame extraction ou segredo em log. CSS usa URL de artwork já pública no contrato, nunca URL de playback Drive. Sem dependência nova e sem migration. Apresentação alterna classe/metadata sem recriar engine; imagem não bloqueia player. Timers/listeners do adapter continuam com cleanup existente. Foco mantém controles; slider possui rótulo/posição textual; imagens decorativas têm alt vazio porque título é texto adjacente. Contraste, erro mobile e 320–430 px foram inspecionados em Chromium; leitor de tela humano e aparelhos físicos continuam manuais.

## TESTS / MULTI_CLIENT / E2E / VISUAL_QA

Gates finais: `npm run typecheck`, `npm run lint`, `npm run build` e `git diff --check` passaram. `npm test` isolado passou com 158 testes aprovados (121 server, 33 web, 4 service worker), 6 skips preexistentes de PostgreSQL e zero falhas. `npm run test:e2e` passou 12/12 em Chromium (incluindo novo E2E M1 A/B/C); após elevar o alvo dos botões de erro mobile para 44 px, o E2E mobile focal passou 1/1. Houve uma falha inicial no E2E por seletor CSS que reduziu o iframe no modo Vídeo e outra por ocultar botões de autoplay; ambas foram corrigidas. O primeiro teste M1 A/B/C tentou clicar “Reproduzir” quando a Party já estava tocando; a condição do teste foi corrigida e ele passou isolado e na suíte. Uma execução de `npm test` em paralelo com build/typecheck/E2E falhou na asserção temporal exata de 6000 ms de um teste legado do Quiz; a repetição isolada passou integralmente, sem alterar esse teste.

MULTI_CLIENT: A/B/C autenticados numa Casa local, A e B presentes desde o início, C entrando depois; título e estado de reprodução convergiram; seek de A chegou a B; B manteve Ambiente enquanto A/C mantiveram Vídeo; duas trocas rápidas terminaram em C nos três clientes; cada página manteve uma engine YouTube. O teste não simula WAN/TURN nem substitui homologação humana com providers reais.

VISUAL_QA: capturas anteriores abertas: `media-empty-before.png`, `media-video-desktop-before.png`, `media-ambient-desktop-before.png`, `media-ambient-mobile-before.png`. Capturas finais abertas: `m1-empty.png`, `m1-error-youtube.png`, `m1-error-youtube-390-corrected.png`, `m1-video-320.png`, `m1-video-375.png`, `m1-video-390.png`, `m1-video-430.png`, `m1-video-1280x720.png`, `m1-video-1280x900.png`, `m1-video-1440x900.png`, `m1-ambient-320.png`, `m1-ambient-390.png`, `m1-ambient-412.png`, `m1-ambient-430.png`, `m1-ambient-1280x720.png`, `m1-ambient-1280x900.png`, `m1-ambient-no-artwork.png`, `m1-ambient-long-title.png`, `m1-fullscreen-video.png`, `m1-fullscreen-ambient.png` e `m1-multi-client-b-ambient.png`. O E2E também mede 320/360/375/390/412/430 px e desktop 1280×720, 1280×900, 1440×900 sem overflow horizontal e com player/Chat em regiões distintas. O estado de preparação ficou rápido demais para uma captura visual determinística; não trate `m1-loading.png` como prova de loading. A fixture YouTube do E2E é local e aparece literalmente nas capturas; navegador real deste ambiente apresentou restrição de embed, registrada em `m1-error-youtube-390-corrected.png`. Drive real não foi acessado; seus casos usam mocks/fixtures locais.

## KNOWN_LIMITATIONS / MANUAL_REQUIRED

- Confirmar YouTube real (vídeo normal, música e embed indisponível) e Drive real (permissão válida/expirada, arquivo removido, Range, 4:3/16:9) com uma conta autorizada. Este Chromium local mostrou erro de embed para URLs testadas; não foi contornado.
- Android Chrome e iOS Safari/PWA: portrait/landscape, fullscreen, teclado + Chat, safe area, autoplay bloqueado, background, hardware media keys e Bluetooth. O player não promete reprodução em segundo plano onde browser/provider bloqueia.
- 2–8 amigos: pause/seek/late join, A→B→C rápido, auto-next on/off, Ambiente local de B sem alterar A/C, Call/ducking e Share durante troca de mídia. Homologar WAN/TURN separadamente.
- Leitor de tela e dispositivos touch físicos; screenshots Chromium não equivalem a essas verificações.

## FILES_CHANGED

`apps/web/src/components/{MediaStage.tsx,AmbientArtwork.tsx}`; `apps/web/src/media/{AmbientPresentation.ts,AmbientPresentation.test.ts,MediaProvider.test.ts}`; `apps/web/src/styles.css`; `e2e/party.spec.ts`; `docs/AGENT.MD`; `.gitignore` (ignora apenas capturas locais M1); este relatório. Sem servidor/shared/Prisma/Auth/infra alterados.

## RESPOSTAS OBRIGATÓRIAS

1. Antes: player único e Ambiente já existiam; controles/metadata/erros/layout tinham os problemas do AUDIT.
2. Problemas reais: Dock/título, transparência do erro, artwork quadrado, texto cru, tempo/seek limite e seletor mobile encontrado pelo E2E.
3. Não, UniversalPlayer não foi reescrito.
4. Uma instância relevante por provider ativo: iframe YouTube ou vídeo Drive, nunca ambas para a mesma mídia.
5. Ambos continuam no `MediaController` e no mesmo `MediaStage`.
6. Vídeo/Ambiente são apresentações locais sobre playback compartilhado.
7. Ambiente é local por navegador.
8. Não; a troca não faz comando, remount nem revisão.
9. Não há Music Mode formal.
10. Não aplicável: sem detecção de música.
11. Ambiente explícito é a apresentação para ouvir.
12. Data API/oEmbed ou URL oficial derivada do ID YouTube válido.
13. Thumbnail legítima quando presente; senão símbolo Lumio.
14. Não.
15. Título, canal quando há, origem/fallback; progresso e duração quando válidos.
16. Não há artista/álbum/gênero inferidos.
17. Play/pause, seek, mute/volume/rate nos dois adapters atuais; Ambiente/fullscreen são UI local.
18. Todos os controles do provider seguem `ProviderCapabilities`.
19. Quality não é implementada em nenhum dos dois.
20. Captions não são implementadas em nenhum dos dois.
21. Rate funciona em YouTube e Drive nos adapters atuais, conforme taxas expostas.
22. `issue` envia comando com mídia/revisão/operação ao servidor antes de aplicar localmente.
23. Espaço/K, M, F e setas de 10 s.
24. Guard por target editável, menus/dialogs e MainStage não Media.
25. Fullscreen API no mesmo elemento persistente ou fallback identificado.
26. No mobile, UI externa some e a orientação paisagem é tentada quando suportada.
27. Não.
28. Player proporcional acima do Chat permanente em portrait; lado a lado em landscape.
29. VisualViewport existente compacta o layout para o composer.
30. Estado vazio simples com CTA Media Hub.
31. Preparação antes do adapter; buffering apenas com evento real durante play.
32. Mensagem humana, retry ou escolher outra; sem burlar embed.
33. Mensagem humana, retry/Hub; reconexão Drive permanece separada de Login Google.
34. Overlay “Toque para continuar” aciona `resumeFromGesture`.
35. Presentation deriva do `MediaState` atual; sync assíncrono confere ID/revision/controller.
36. Adapter de geração converge em C; teste cobre A→B→C pré-READY.
37. O mesmo modo local mostra arte/título da nova mídia quando chega `media:sync`.
38. Não; Hub é overlay.
39. Engine permanece; YouTube visível na superfície de Games.
40. Não; Share troca apresentação MainStage.
41. Não há remount de Call por fluxo M1.
42. Não; Presence V2 é independente.
43. Não.
44. Falta fonte legítima/licenciada.
45. Não.
46. Não aplicável; eventual ação futura deverá emitir comando autoritativo.
47. Não.
48. Não.
49. Não.
50. Typecheck, lint, build, `git diff --check` e 158 testes passaram; 6 testes PostgreSQL ficaram skipped como antes. Houve flake temporal de Quiz somente sob carga paralela, não no rerun isolado.
51. E2E completo 12/12; focal mobile pós-ajuste 1/1; A/B/C isolado 1/1.
52. Capturas antes/depois abertas e verificadas nas larguras listadas em VISUAL_QA. Providers reais e dispositivos físicos permanecem manuais.
53. Ver MANUAL_REQUIRED.

### Checklist manual curto

Desktop: YouTube/Drive reais, play/pause/seek/rate, fullscreen, Ambiente, Hub e fila/auto-next. Mobile Android/iOS/PWA: 320–430, paisagem, Chat/teclado, safe area, fullscreen, gesto de autoplay. Multiplayer: 2–8 pessoas, late join, seek, troca rápida e Ambiente só em um cliente. Call: voz/ducking/mute durante mídia e share. Providers: embed proibido, Drive autorizado/expirado/removido.
