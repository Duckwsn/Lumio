# Lumio — FF1.2 Interaction Surfaces Visual Proof

Data: 2026-10-05. Escopo: **estudos visuais e auditoria**, sem redesign produtivo, mudança de backend, migration ou deploy. Fonte dos estudos: `artifacts/frontfix/ff12/studies/study.html`; imagens: `artifacts/frontfix/ff12/current/` e `artifacts/frontfix/ff12/studies/{pass1,pass2}/`. As imagens são capturas da tela, não prova de comportamento dos mockups.

## STATUS / WHY_FF1_2_EXISTED

FF1.1 estabeleceu Home social, Media com palco, Games com identidade e Draw game-first, mas não demonstrou acesso suficiente a Add Media, Hub, Fila, Call, Mic, deafen e Settings. FF1.2 completa essas superfícies **sem restaurar o dock universal**. Os CS01–CS10 não foram substituídos. Este trabalho tem duas evidências distintas: (1) app atual autenticado, com conta/Casa/itens sintéticos em servidor local isolado; (2) CS11–CS24 como proposta estática. O QA local não usou OAuth, chave YouTube nem banco de produção. Não houve teste hospedado nesta rodada.

## CURRENT_MEDIA_HUB

Observado em `current/media-hub-discover-1440x900.png`, `media-hub-library-1440x900.png`, `media-hub-playlists-1440x900.png`, `media-hub-history-1440x900.png`, `media-hub-drive-1440x900.png`, `media-hub-mobile-390x844.png` e `library-390x844.png`: modal dentro da Party; abas Descobrir, Biblioteca, Playlists, Histórico e Google Drive; busca YouTube/URL; biblioteca com filtro/pesquisa e “Fila”; playlist da Casa; histórico; aba Drive. `MediaHub.tsx` confirma ações condicionadas por acesso para adicionar, tocar agora/próximo, salvar, favoritar, colocar em playlist, criar/editar/ordenar playlists; Drive Explorer abre pastas e vídeos quando há conexão. A instância QA não possuía Google OAuth/YouTube API, portanto Drive apareceu “não configurado”, a busca remota e a navegação de pasta **não** foram validadas. Os resultados dos estudos são exemplos de mídia sintética já conhecida da Casa, não resultados reais da API.

## CURRENT_QUEUE

`current/queue-1440x900.png` e `queue-390x844.png`: drawer desktop e sheet mobile com histórico, limpar (quando permitido), anterior/próxima, adicionar, Now Playing, Up Next, ocorrência/ordem e menu por item. `App.tsx`/`QueueList` confirma menu “Reproduzir agora” apenas para item futuro, mover cima/baixo e remover conforme `canControl`; adicionar depende de `canAdd`; limpar é confirmação e requer `QUEUE_MANAGE`; voto para pular é outra ação na região de mídia, não item do menu da Fila. O estudo pass2 distingue item atual de item adicionável. Não se mediu concorrência/ordem entre usuários aqui.

## CURRENT_CALL_CONTROLS

`current/media-base-1440x900.png`, `call-controls-390x844.png`, `call-settings-1440x900.png` e `call-settings-390x844.png`: desktop usa dock para Mic, áudio/deafen, Share, Chat, People, Queue, Settings e Add. Mobile abriga Mic, áudio/deafen, Share e Settings num popover junto ao compositor. A UI mostrou “Voz da Party conectada”; isso **não prova** WebRTC, permissão real do microfone, áudio remoto ou share. Settings atual oferece microfone, saída, detecção normal/Push-to-talk, teste de mic, volumes mídia/call e ducking. O target mantém esses itens e representa Call OFF, conectado/Mic OFF, Mic ON e deafen sem depender só de cor; estado de permissão negada precisa mensagem explícita na implementação.

## CURRENT_SETTINGS

`current/profile-menu-320x568.png`, `account-1440x900.png`, `account-320x568.png` e `call-settings-*`: perfil abre Conta/Editar perfil/Suas Casas/Sair; Conta organiza email/senha, login Google e conexões de dados; Call settings é um modal separado. O target preserva essa separação. O menu visual de Settings no CS23/24 é proposta de ponto de entrada, não menu já implementado. Não houve vinculação Google nem mudança de conta.

## OWNERSHIP_MAP

| Domínio | Responsabilidade | Onde no target |
| --- | --- | --- |
| Media | player, autoplay, mídia atual, metadados, Fila, Add Media, Hub, providers | palco Media, ações secundárias e superfícies contextuais CS11–18 |
| Party / Social | Call, Mic, deafen, Chat, People, Share e identidade | sinal compacto + menu contextual CS19–22 em Media **e** Games |
| Utility | conta, identidade, dispositivos/volumes e Casa | menu do perfil/Party e camada específica CS23–24 |
| Game | escolha, HUD, controles, timer, quadro, palpites | palco Game; CS20/22 mostram somente a coexistência social, não redesenham Draw |

O app atual ainda apresenta Fila e Add Media no chat mobile de Jogos (`current/games-social-390x844.png`, `games-social-320x568.png`; confirmado também por snapshot de acessibilidade). Isso é dívida real para FF2/FF3, não algo removido nesta etapa.

## NO_FEATURE_LOSS_MATRIX

`VISIBLE` = à vista no estado base; `CONTEXTUAL` = por controle nomeado; `MOVED` = mudou de domínio/entrada visual proposta; `REMOVED INTENTIONALLY` = ausente só da experiência incorreta; `MISSING BY ACCIDENT` = nenhum item aceito nesta direção. Estas classificações são do **target**, não da implementação atual.

| Recurso atual | Classificação no target | Evidência/gate |
| --- | --- | --- |
| Player, estado/controles, mídia atual, metadados, autoplay | VISIBLE/CONTEXTUAL em Media | CS11/15; playback real não testado |
| Fila Now Playing/Up Next, ordem, ocorrência, histórico, anterior/próxima, limpar, menu mover/reproduzir/remover | CONTEXTUAL em Media | CS13/17; ações autorizadas devem sobreviver no FF4 |
| Add Media, YouTube/URL, biblioteca, favoritos, playlists, histórico, Drive/pastas | CONTEXTUAL em Media Hub | CS12/14/16/18; Drive conectado não observado |
| Call/Mic/áudio, Share, Chat, People | VISIBLE compacto + CONTEXTUAL detalhado em Media/Games | CS19–22; sem WebRTC real |
| Conta, Google Login, vinculação, Drive como conexão de dados | MOVED para entrada de identidade/Account | CS23/24, tela Account atual preservada |
| Devices, Push-to-talk, volumes, ducking | CONTEXTUAL em Call e dispositivos | CS23/24 |
| Queue/Add/Hub/Now Playing/playback em Games | REMOVED INTENTIONALLY **de Games**, preservados em Media | CS20/22; não é remoção da feature |
| Funcionalidade existente sem destino | MISSING BY ACCIDENT: **nenhuma identificada** | exige reconciliação funcional em FF2–FF6 |

## CS11_TO_CS24

| Study | Estado/proposta | Arquivo final |
| --- | --- | --- |
| CS11 | Media desktop, palco e acesso secundário | `studies/pass2/CS11-1440x900.png` |
| CS12 | Media Hub desktop dentro da Party | `studies/pass2/CS12-1440x900.png` |
| CS13 | Fila desktop contextual | `studies/pass2/CS13-1440x900.png` |
| CS14 | fluxo Add Media desktop | `studies/pass2/CS14-1440x900.png` |
| CS15 | Media mobile base | `studies/pass2/CS15-390x844.png`, `CS15-320x568.png` |
| CS16 | Media Hub mobile fullscreen | `studies/pass2/CS16-390x844.png`, `CS16-320x568.png` |
| CS17 | Fila mobile fullscreen | `studies/pass2/CS17-390x844.png`, `CS17-320x568.png` |
| CS18 | Add Media mobile | `studies/pass2/CS18-390x844.png`, `CS18-320x568.png` |
| CS19 | Party social desktop sobre Media | `studies/pass2/CS19-1440x900.png` |
| CS20 | Party social desktop sobre Games | `studies/pass2/CS20-1440x900.png` |
| CS21 | Party social mobile sobre Media | `studies/pass2/CS21-390x844.png` |
| CS22 | Party social mobile sobre Games | `studies/pass2/CS22-390x844.png`, `CS22-320x568.png` |
| CS23 | Settings desktop, Call/devices e estados | `studies/pass2/CS23-1440x900.png` |
| CS24 | Settings mobile | `studies/pass2/CS24-390x844.png` |

## PASS1 / CRITIQUE / PASS2

Pass1 capturou e abriu CS11–CS24. Achados específicos: cluster desktop largo demais, próximo do dock universal; Add duplicado no mobile; Now Playing desenhado como resultado com “+ Fila”; CS22 320 empurrava o controle social para fora da tela; Settings e painel social tinham densidade alta; Fila e Hub em 320 precisavam usar a tela inteira. Pass2 reduziu o cluster base a Call/Mic/Chat/Party, moveu deafen/People/Share/devices para a camada contextual rotulada, eliminou Add duplicado no topo mobile, diferenciou Now Playing, mostrou confirmação “✓ Na fila”/contagem 4 em CS14/18, comprimiu a superfície social aberta de 320 e tirou o rail de cima do compositor desktop. Capturou e **abriu novamente** todos os estudos, incluindo CS15–18 e CS22 em 320×568. A crítica não presume que tamanho de toque/contraste estejam aprovados: algumas etiquetas de 320 ainda são pequenas; a implementação deve ampliar hit areas e validar em aparelho. Não houve pass3 automático.

## MEDIA_ACTION_MODEL / SOCIAL_CONTROL_MODEL / MOBILE_MODEL / SETTINGS_MODEL

Media: palco primário; “Fila · N” e “Adicionar” secundários; entrada “Escolher mídia”/Hub; os resultados oferecem “+ Fila”, com tocar agora/próximo sujeito à permissão existente. Desktop usa overlay Hub e drawer Fila; mobile usa fullscreen, retorno explícito ao player e conteúdo rolável, considerando safe area e teclado virtual. Fila não vira playlist manager.

Social: base discreta de Call/Mic/Chat/Party; expandir “Party” mostra deafen, People, Share e devices com rótulos. O estado de Call é textual e semântico, não só verde/vermelho. Share fica Party/Call-scoped; não aparece como controle de mídia. A camada aberta é temporária; fechada, Games/Draw retomam todo o palco.

Settings: Conta e Google Login/Drive no perfil; Call/devices no contexto da Party. Não copiar o formulário da Account para cima do player. Os sliders/seletores do target representam os controles existentes, não uma reescrita de áudio. CS23/24 não são controles operáveis.

## DISCOVERABILITY_TEST / FIRST_TIME_USER_TEST

| Tarefa | Conhecedor do Lumio | Novo usuário | Justificativa visual |
| --- | --- | --- | --- |
| Adicionar algo | YES | YES | “Adicionar mídia” explícito em Media; “+ Fila” no item |
| Media Hub / buscar | YES | BORDERLINE | “Escolher mídia” desktop e “Media Hub” mobile; testar nomenclatura em FF4 |
| Ver o próximo | YES | YES | “Fila · 3”, depois “A seguir” ordenado |
| Falar / Call | YES | BORDERLINE | Call/Mic visíveis; join e permissão precisam feedback real |
| Mutar mic/deafen | YES | BORDERLINE | “Mic desligado” direto; deafen no menu Party rotulado |
| Ajustar configurações | YES | BORDERLINE | “Call e dispositivos” no menu Party; Conta no perfil |

Nenhum `NO` no estudo visual; os `BORDERLINE` são gates de teste com pessoas, labels e toque, não aprovação funcional. Um novo usuário deve inferir mídia, Fila, fala, mute e Settings sem tutorial; verificar empiricamente em FF4/FF6.

## ACTIVITY_COMPETITION_TEST / DASHBOARD_REGRESSION_TEST / UNIVERSAL_TOOLBAR_REGRESSION

CS11/15 deixam o player maior que chat e controles; CS20/22 não incluem Media chrome; CS19–22 mostram camada social aberta só como estado contextual. O jogo volta a dominar após fechar. Hub representa escolha de mídia, não 8 widgets; Fila representa sessão, não biblioteca. O rail base ficou com quatro sinais compactos, não a antiga fileira mic/deafen/share/chat/people/queue/settings/add. Em 320×568 o painel social aberto cobre parte da arte do jogo, aceitável **somente enquanto aberto**; o estado fechado deve ser golden obrigatório no FF2/FF5. Assim, a direção passa o gate de silhueta, não um gate pixel-perfect ou de acessibilidade.

## HUMAN_REVIEW_PACKAGE

Abrir estas dez capturas `TARGET` finais, nesta ordem, comparando `current/` quando disponível:

1. [CS11 Media desktop](../artifacts/frontfix/ff12/studies/pass2/CS11-1440x900.png)
2. [CS12 Hub desktop](../artifacts/frontfix/ff12/studies/pass2/CS12-1440x900.png)
3. [CS13 Fila desktop](../artifacts/frontfix/ff12/studies/pass2/CS13-1440x900.png)
4. [CS14 Add desktop](../artifacts/frontfix/ff12/studies/pass2/CS14-1440x900.png)
5. [CS15 Media mobile](../artifacts/frontfix/ff12/studies/pass2/CS15-390x844.png)
6. [CS16 Hub mobile](../artifacts/frontfix/ff12/studies/pass2/CS16-390x844.png)
7. [CS17 Fila mobile](../artifacts/frontfix/ff12/studies/pass2/CS17-390x844.png)
8. [CS20 Games + social desktop](../artifacts/frontfix/ff12/studies/pass2/CS20-1440x900.png)
9. [CS22 Games + social mobile](../artifacts/frontfix/ff12/studies/pass2/CS22-390x844.png)
10. [CS24 Settings mobile](../artifacts/frontfix/ff12/studies/pass2/CS24-390x844.png)

CS18/19/21/23 e as variantes 320 são anexos técnicos na tabela, não exigência de ver 19 arquivos de uma vez. Aprovação visual final continua humana.

## FF2_HANDOFF

FF2 pode usar o shell, a separação Media/Games e o acesso social compacto. FF3 detalha social/Call; FF4 implementa Hub/Fila/Add com permissões/estados existentes; FF5 integra Games/Draw sem Media chrome; FF6 valida responsividade, keyboard/safe area, foco, target de toque, labels/tooltip, erros e regressões. Não alterar provider sync, Socket/Queue revision, WebRTC nem segurança com base no mockup. Para cada fase: smoke com login real, 1440/390/320, estado vazio/ativo/erro, menu aberto/fechado, teclado mobile, leitor de tela, e teste multiusuário onde necessário. Remover a exposição atual de “Fila”/“Adicionar mídia” em Games sem retirar essas funções de Media.

## FINAL_VERDICT

**FF1 + FF1.1 + FF1.2 READY TO FREEZE — FF2 READY**, como **direção de composição para revisão humana**, não como certificação de implementação. Os requisitos visuais centrais foram demonstrados, o app produtivo não foi redesenhado e os limites acima permanecem. Não iniciar FF2 automaticamente; a aprovação visual final pertence ao usuário.
