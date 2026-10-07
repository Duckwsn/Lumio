# FF3.1 — Human QA correction

Data: 2026-10-07. Escopo: apresentação e interação da Party; sem alterações no backend.

## STATUS

Implementação concluída; pronta para QA visual humano. Não congelado.
Nenhum commit, push ou deploy foi executado. FF4 não iniciado.

## HUMAN_QA_INPUT

O FF3 foi rejeitado pelo QA humano apesar dos gates automáticos. Foram corrigidos o menu genérico Party, o estado Call conectada competindo com ações, metadata solta, chat sobreposto ao vídeo e contraste de seleção da primeira Casa.

Durante o trabalho, o usuário revisou explicitamente o contrato MOBILE, com screenshots:

1. Chat de Mídia permanentemente integrado ao player, sem minimizar/fechar.
2. Um botão de microfone à esquerda do composer abre os controles da call.
3. Pessoas sai desse menu e vai para o cabeçalho do Chat.
4. Fila e Adicionar mídia também ficam como ícones no cabeçalho do Chat, exclusivos de Mídia.

Esses adendos substituem a exigência original de controles sociais diretos e chat opcional NO MOBILE. O desktop mantém ações diretas. Jogos preserva chat contextual.

## BASELINE

Antes da primeira edição: worktree limpo; git status, diff e diff --stat verificados.
Typecheck, lint, build e npm test passaram. Baseline E2E relevante: 4 testes passaram (House, People, voz automática e Chat mobile).
Os testes de persistência PostgreSQL condicionais não foram habilitados nesta fase visual.

## FILES_READ

- docs/AGENT.MD, ENTRY_FLOW.md, SOCIAL_ARCHITECTURE.md.
- Relatórios FF2 e FF3; Visual Constitution e Experience Bible do Frontfix.
- App.tsx, PartyStages.tsx, MediaStage.tsx, PartySocialControls.tsx, MobilePartyChat.tsx, PartyComposer.tsx, HousesHome e estilos correspondentes.
- ChatPanel, MembersPanel e MobileCallControls definidos no App; CallSettings.
- E2E de Party, People e prova visual autenticada.

Código e protocolos existentes foram usados como fonte de verdade.

## FF3_REJECTED_DECISIONS

Não se manteve a solução FF3 apenas por passar em testes. O menu Party deixou de agregar ações importantes; o estado normal de voz não ocupa um botão; o chat mobile Mídia deixou de ser overlay.

## SOCIAL_CONTROLS_BEFORE_AFTER

| FF3 problem | FF3.1 correction |
| --- | --- |
| Party genérico escondia ações | Desktop: Mic, áudio, Chat, Share, People e configurações diretos. Mobile: controle de call no composer, conforme adendo humano. |
| Call conectada como elemento primário | Status acessível discreto; mensagem explícita nos estados excepcionais e dentro das configurações/menu. |
| Deafen e share escondidos sob Party | Ações diretas no desktop; menu de microfone claramente associado à call no mobile. |
| Tocando agora / A Party está pronta repetidos abaixo do player | Sem metadata vazia; título/provider somente com mídia real. |
| Chat sobre o player no mobile | Vídeo e Chat participam do layout; Chat permanente em Mídia e contextual em Jogos. |
| Primeira Casa parecia selecionada | Fundo carvão neutro; prioridade por tamanho, posição, tipografia e CTA. |

BEFORE: artifacts/frontfix/ff3/pass2/media-closed-desktop.png, media-party-desktop.png, media-chat-390.png e media-closed-390.png.
Home BEFORE: artifacts/frontfix/ff2/pass2/home-three-desktop.png e home-three-mobile.png (hierarquia herdada).
AFTER: artifacts/frontfix/ff31/pass2; matriz abaixo.

## PARTY_BUTTON_REMOVAL

Removido o controle genérico Party do rodapé. O menu da Casa no HEADER não foi removido: é navegação do produto, não o agrupador social rejeitado.

## CALL_STATE_PRESENTATION

Desktop: connected permanece em role=status com sr-only; idle expõe Entrar na Call; joining/reconnecting têm indicação.
Mobile: um único trigger no composer abre o menu. Ali estão estado, eventual erro e entrada quando idle/error. Não há captura automática de microfone causada pelo menu.

## MIC

Desktop: Mic/MicOff, aria-pressed, title e accessible label refletem o estado.
Mobile: o ícone do trigger reflete ligado/desligado; permissão bloqueada tem indicação e mensagem no menu. Ativar continua chamando o handler existente.
O teste de permissão negada usa uma rejeição sintética de getUserMedia, não configurações reais do usuário.

## DEAFEN

Desktop: botão direto de áudio. Mobile: Mutar call / Ativar áudio da call dentro do menu do microfone.
O caminho de liberação de autoplay de áudio foi preservado e integrado à opção de áudio. O estado não é inferido a partir de playback de mídia.

## SHARE

Screen Share continua Party/Call-scoped. Desktop tem botão direto e ação Parar; mobile tem Compartilhar tela / Parar compartilhamento no menu, mais indicação no trigger quando compartilhando.
Disponibilidade depende do suporte do navegador a getDisplayMedia; não é prometido suporte em todos os celulares.
Os handlers, tracks e signaling não foram reescritos.

## PEOPLE

Desktop: ícone com contador abre o painel existente.
Mobile: ícone no cabeçalho do Chat; removido do menu de microfone.
Teste de 1, 2, 4, 8 e 12 participantes e nomes longos preservado.

## CHAT

Um único protocolo, histórico e estado de rascunho. Nenhum segundo chat foi criado.
Desktop mantém drawer contextual. Jogos mobile mantém abrir/fechar e as regras de palpite/Chat do Draw.
Mídia mobile não apresenta Abrir, Ocultar ou Fechar chat. Escape não recolhe o Chat fixo; fecha o menu de call quando aberto.
O Chat fixo não dá autofocus ao composer ao entrar na Party, evitando abrir o teclado involuntariamente.

## MEDIA_MOBILE_CHAT

Composição final:

- Header da Party.
- Player proporcional, sem overlay de Chat.
- Título/provider quando couber.
- Cabeçalho Chat da Party com Pessoas, Fila e Adicionar mídia.
- Mensagens com scroll interno.
- Composer com microfone à esquerda e envio à direita.

Sem barra social inferior separada em Mídia mobile. O espaço recuperado fica para a conversa.
O layout considera a viewport disponível; em telas curtas reduz o player e pode omitir metadata. O cabeçalho do Chat continua disponível com os três ícones.
Em landscape, player e Chat podem ocupar colunas. Fullscreen/cinema explícito do player mantém seu comportamento dedicado; sair dele restaura o Chat fixo. Isso não é um comando de minimizar Chat.
Painéis secundários e o menu são superfícies temporárias, não um segundo layout persistente sobre o vídeo.

## MEDIA_METADATA

Sem mídia: apenas o empty state do player; sem bloco duplicado abaixo. A mensagem de boas-vindas existente no histórico do Chat foi preservada.
Com mídia: título e provider/contexto aparecem junto do player.
Desktop alinha metadata e ações ao palco; mobile evita uma segunda linha de botões de mídia.

## QUEUE_TRIGGER

Desktop: Fila permanece junto da metadata. Mobile: ícone no cabeçalho do Chat, com accessible label contendo quantidade de itens.
Adicionar mídia está no mesmo cabeçalho; abre o Media Hub existente.
Não existe Fila, Add ou Media Hub no Chat de Jogos. Nenhuma alteração no runtime da fila.

## HOME_HOUSE_HIERARCHY

A Casa principal tem superfície neutra, sem gradiente verde exclusivo. O CTA conserva a cor de marca.
Não foi introduzido selectedHouseId nem uma falsa seleção persistente.
Resposta à crítica visual: a primeira Casa é prioritária pelo layout, não marcada como selecionada.

## GAMES_BOUNDARY

Hub, Draw, Quiz e Cards preservam seu workspace. Não receberam metadata, queue ou controles de playback.
Mobile Jogos mantém um trigger de Chat quando fechado; controles de call ficam no composer quando disponível. O desenhista preserva a regra de não abrir Chat sobre a experiência de desenho.
As regras específicas de palpite, canvas, pergunta e mão de cartas não foram modificadas.

## ROUTE_PRESERVATION

Sem mudança em ownership de socket, peer connections, mic ou screen tracks.
Os testes existentes verificam Media → Games → Media e identidade desses recursos.
Importante: o provider de mídia é intencionalmente desmontado ao entrar em Jogos, conforme GX3, e retorna com estado autoritativo. Isso é diferente de um remount causado por abrir controles/chat: este último é testado para não ocorrer.

## ACCESSIBILITY

Labels, title, aria-expanded no menu/Chat contextual, aria-pressed nos toggles, role=status e alert nas falhas.
Escape fecha menu e diálogos; retorno de foco às configurações preservado, inclusive via trigger mobile.
Alvos críticos de 44 × 44 CSS px no composer e cabeçalho mobile.
O teste verifica geometria e permanência do input, não apenas existência no DOM.

## RESPONSIVE

Home: desktop, 390×844, 320×568 e 430×932.
Media: desktop, mesmos tamanhos mobile, landscape e viewport curta equivalente ao teclado.
Não foi realizado teste físico de teclado iOS/Android; a evidência é Chromium com viewport reduzida e foco real no composer.

## TESTS

Após todos os adendos: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` e `git diff --check` passaram.
`npm run test:e2e`: **21/21 passaram** na rodada final completa (13,1 min).
Novos testes unitários cobrem Call off/connected/transições, mic bloqueado, share ativo e contrato do cabeçalho de Chat fixo versus Jogos.

## E2E

Novo ff31-social.spec.ts cobre dados locais autenticados, Home com 3 Casas, controles desktop, Media sintética, Chat fixo, menu mobile, foco, permissão negada, dimensões, scroll, rascunho e boundary de Games.
O player usa mídia sintética com adapter instrumentado. O teste não pretende certificar serviços externos do YouTube ou Drive.

Expectativas atualizadas deliberadamente:

- Retirada das etapas de abrir o menu genérico Party.
- Mic passou de texto visível para nome acessível no controle desktop.
- Chat de Mídia mobile começa visível e permanece após fechar painéis.
- Chat de Jogos precisa ser aberto após sair de Mídia.
- People mobile vem do cabeçalho do Chat.
- Fila mobile não é buscada na antiga faixa abaixo do player.
- Fechar Chat em viewport curta não faz mais parte do contrato de Mídia.

Não foram retiradas as verificações de engine, fullscreen, rascunho, scroll e sincronização.
Uma execução completa intermediária foi interrompida ao receber o primeiro adendo do usuário; não é contabilizada como aprovação final.
Em rodadas intermediárias, uma checagem de substring confundiu a palavra secreta `ilha` com parte de `Compartilhar tela`; foi corrigida para correspondência de termo completo. Um teste de retomada do player simulado oscilou em uma rodada, passou isoladamente e nas duas rodadas completas seguintes. A prova visual da Home teve uma espera inicial de 5 s insuficiente em uma rodada; passou isoladamente após ampliar a espera e na rodada completa final. A aprovação acima se refere apenas à rodada final de 21/21.

## VISUAL_PASS_1

Capturas em artifacts/frontfix/ff31/pass1 foram produzidas e abertas. Mostravam a primeira solução, ainda com barra social e Chat opcional.
O usuário revisou essa solução durante o QA e pediu Chat fixo, microfone no composer e ações de mídia no cabeçalho.

## CRITIQUE

- Party genérico foi removido e ações desktop ficaram diretas.
- Home não depende mais de fundo verde para hierarquia.
- Metadata deixou de ser um bloco órfão.
- Primeira solução mobile ainda gastava uma faixa inferior com controles: corrigida pelos adendos.
- O teclado não deve aparecer só por entrar na Party: autofocus desabilitado no Chat fixo.
- Ícones de Fila/Add não devem disputar uma segunda linha abaixo do player: movidos para o cabeçalho do Chat.
- Texto da mídia sintética tinha encoding incorreto na primeira captura; corrigido no fixture UTF-8.

## VISUAL_PASS_2

Capturas finais em artifacts/frontfix/ff31/pass2 e superfícies de jogos recapturadas pelo E2E visual.
As imagens prioritárias foram abertas para inspeção, não apenas geradas.
Também houve exploração via agent-browser em host local descartável, com login sintético: envio de mensagem, áudio, configurações, Media Hub e Fila.
Nenhum dado de produção ou OAuth real foi usado.

## SCREENSHOT_MATRIX

Base AFTER: artifacts/frontfix/ff31/pass2/

| Superfície | Evidência |
| --- | --- |
| Home desktop | home-desktop.png |
| Home 390 / 320 / 430 | home-390.png, home-320.png, home-430.png |
| Media desktop sem/com mídia | media-empty-desktop.png, media-active-desktop.png |
| Chat / People desktop | media-chat-desktop.png, media-people-desktop.png |
| Share ativo / erro de mic | share-active-desktop.png, microphone-denied.png |
| Media mobile fixa | media-390-integrated.png, media-390-chat.png |
| Muitas mensagens | media-390-messages.png |
| 320 / 430 | media-320-chat.png, media-430-chat.png |
| Composer/teclado simulado | media-390-keyboard.png |
| Menu do microfone | media-390-call-menu.png, media-390-keyboard-call-menu.png |
| Sessão exploratória final | live-final-mobile.png |
| Games Hub | games-hub-desktop.png, games-hub-mobile.png |
| Pessoas 12 | people-12-desktop.png, people-12-390.png, people-12-320.png |

Draw, Quiz e Cards: artifacts/frontfix/ff11/current/draw-drawer-390x844.png, draw-drawer-1440x900.png, quiz-question-390x844.png, quiz-question-1440x900.png, cards-turn-390x844.png e cards-turn-1440x900.png, recapturados pela suíte final.

Arquivos intermediários cujo nome contenha no-chat ou live-mobile-chat não representam o contrato final: o Chat passou a ser fixo por decisão humana posterior.

## KNOWN_DEBT

- QA humano final ainda necessário; esta fase não está FROZEN.
- Teclado físico, safe area real de dispositivo, VoiceOver/TalkBack e Safari não foram certificados.
- WebRTC testado localmente com dispositivos/captura sintéticos e peers reais; não substitui teste WAN/TURN em celulares reais.
- Testes PostgreSQL condicionais não fazem parte desta correção visual; sem migrações ou alterações no banco.
- Menus/painéis temporários podem sobrepor parte do conteúdo quando abertos; o Chat em si não cobre o player.

## HUMAN_QA_PACKAGE

Abrir home-desktop, home-390, media-empty-desktop, media-active-desktop, media-390-chat, media-390-keyboard, media-320-chat, media-390-call-menu, live-final-mobile, games-hub-mobile e Draw mobile.

Roteiro: entrar em Mídia pelo celular; conferir Chat sempre visível e sem fechar; tocar os três ícones do cabeçalho; voltar ao Chat; abrir menu pelo microfone; confirmar ausência de Pessoas nesse menu; digitar; trocar para Jogos e confirmar que Chat é contextual e não existem ações de mídia.

## FINAL_VERDICT

FF3.1 implementado e **READY_FOR_HUMAN_QA**, não FROZEN. A rodada final completa passou 21/21 E2E e todos os gates de código. O QA humano deve conferir sobretudo Chat fixo em Mídia, ações no cabeçalho, menu do microfone no composer e legibilidade em 320 px. Sem commit, push ou deploy.
