# FF1 — matriz de screenshots e estados

> **Atualização FF1.1 (2026-10-05):** a tabela FF1 abaixo permanece como histórico de sua auditoria visitante. A matriz autenticada corrente está logo depois. `OBS-AUTH-LOCAL` significa app real, sessão normal e dados QA sintéticos em servidor isolado, **não** produção hospedada. `TARGET` significa composição isolada, não funcionalidade implementada.

| Superfície/estado atual | Viewport | Evidência FF1.1 | Nível / limite |
| --- | --- | --- | --- |
| Home, 0 Casas | 1440×900, 390×844 | `artifacts/frontfix/ff11/current/home-empty-*` | OBS-AUTH-LOCAL; estado vazio claro |
| Home, 3 Casas | 1440×900, 390×844, 320×568 | `artifacts/frontfix/ff11/current/home-multiple-*` | OBS-AUTH-LOCAL; cartões de workspace predominam |
| Account | 1440×900, 390×844 | `artifacts/frontfix/ff11/current/account-*` | OBS-AUTH-LOCAL; formulário utilitário |
| Media vazia | 1440×900, 390×844, 320×568 | `artifacts/frontfix/ff11/current/media-empty-*` | OBS-AUTH-LOCAL; chat mobile integrado |
| Media ativa (item YouTube QA) | 1440×900, 390×844, 844×390 | `artifacts/frontfix/ff11/current/media-active-*` | OBS-AUTH-LOCAL do shell; provider ficou “Preparando vídeo”; playback não validado |
| Ambient | 1440×900, 390×844 | `artifacts/frontfix/ff11/current/media-ambient-*` | OBS-AUTH-LOCAL; arte externa/capacidade não validada |
| Chat/People/Call controls | 1440×900 | `artifacts/frontfix/ff11/current/media-chat-*`, `media-people-*`, `call-controls-*` | OBS-AUTH-LOCAL de UI; não prova WebRTC |
| Games Hub | 1440×900, 390×844, 320×568 | `artifacts/frontfix/ff11/current/games-hub-*` | OBS-AUTH-LOCAL; Media dock em Games |
| Draw lobby/escolha/drawer/guesser | 1440×900, 390×844, 320×568, 844×390 | `artifacts/frontfix/ff11/current/draw-*` | OBS-AUTH-LOCAL; dois usuários QA; feed/Chat coexistem |
| Quiz lobby/pergunta | 1440×900, 390×844 | `artifacts/frontfix/ff11/current/quiz-*` | OBS-AUTH-LOCAL; alternativa não respondida |
| Cards, turno | 1440×900, 390×844 | `artifacts/frontfix/ff11/current/cards-turn-*` | OBS-AUTH-LOCAL; privacidade cross-user não verificada |
| Share real/Drive/PWA standalone/teclado virtual/call real | variado | não capturado | `PEND`: QA manual/aparelho/provider; não inferir de study |

Estudos finais `TARGET`: `artifacts/frontfix/ff11/studies/pass2/CS01`–`CS10` com dimensões no nome; catálogo e crítica em [FF1_1_VISUAL_PROOF.md](FF1_1_VISUAL_PROOF.md). Dez capturas principais; anexos 320×568 e Media paisagem. `pass1` está preservado para auditoria de iteração.

`OBS` = observado nesta auditoria no navegador nativo; `HIST` = artefato existente de QA, data anterior; `PEND` = sem captura atual. Capturas OBS foram visualizadas no painel do Codex, mas a API do navegador não ofereceu arquivo exportável; portanto o campo de evidência é a sessão/URL/data, não um PNG inventado.

| Superfície/estado | Viewport | Evidência | Auditado? | Achado/limite |
| --- | --- | --- | --- | --- |
| Landing, visitante, topo | ~900×740 | OBS `https://lumio-weld.vercel.app/`, 2026-10-05 | Sim | Hero e preview fortes; aviso de versão sobrepõe canto inferior. |
| Landing, visitante, topo | 390×844 | OBS mesma URL/data | Sim | Coluna única clara; preview entra abaixo da dobra; aviso ocupa rodapé. |
| Login, visitante | 390×844 | OBS `https://lumio-weld.vercel.app/login`, data acima | Sim, parcial | Região Google vazia no screenshot; requer reteste com widget carregado. |
| Home, 0/1/muitas Casas | 320/390/1440 | PEND: autenticação QA | Não | Código em `HousesHome.tsx`, sem veredito visual. |
| Media, vídeo e Ambient, tocando | 390/1440 | PEND; HIST `artifacts/gx3/media-390.png` | Não atual | Histórica: player/chat integrados. |
| Media, tela compartilhada | 390/1440 | PEND | Não | Exige sessão/call QA. |
| People, Call, Chat | 320/390/1440 | PEND | Não | Exige Party autenticada. |
| Game Hub | 1440×900 | HIST `artifacts/gx3/games-1440.png` | Parcial histórico | Cartões, Now Playing e dock na captura antiga; conferir versão atual. |
| Draw, guesser | 320×568 | HIST `artifacts/gx422/final-review/guesser-320x568.png` | Sim, fixture | Quadro legível; HUD/feed comprimem a tela. |
| Draw, guesser | 390×844 | HIST `artifacts/gx422/final-review/guesser-390x844.png` | Sim, fixture | Quadro proeminente; barra de chat ocupa base. |
| Draw, drawer | 844×390 | HIST `artifacts/gx422/final-review/drawer-844x390.png` | Sim, fixture | Ferramentas visíveis; quadro verticalmente cortado na captura. |
| Draw, desktop | 1440×900 | HIST `artifacts/gx422/unified/guesser-1440x900.png` | Sim, fixture | Feed dentro da mesa e Chat da Party à direita; espaço ocioso. |
| Quiz lobby/rodada/resultado | 320/390/1440 | PEND | Não | Inspeção de código somente. |
| Cards mão privada/turno/resultado | 320/390/1440 | PEND | Não | Inspeção de código somente. |
| Conta/Settings | 320/390/1440 | PEND | Não | Inspeção de código somente. |
| PWA standalone/instalação | Android/iOS | PEND | Não | Landing informa instalação; não há teste em dispositivo. |

## Goldens obrigatórios FF2–FF6

Desktop 1440×900 e 1280×720; mobile 320×568, 390×844 e 430×932; paisagem 844×390; tablet ~768×1024. Para cada fase: capturar estado vazio, ativo e erro relevante, com e sem drawer/teclado; comparar o palco, controles, foco, scroll e safe areas. Capturas devem ser novas, com commit/URL/data, nunca reutilizadas silenciosamente como se fossem do build corrente.

## Complemento FF1.2 — superfícies de interação

`CURRENT` = app real autenticado em QA local isolado, conta/Casa sintéticas; `TARGET` = composição HTML estática, não funcionalidade implementada. Capturas em `artifacts/frontfix/ff12/`; CS11–CS24 preservam `studies/pass1` e `studies/pass2`.

| Estado | Viewport | Captura | Limite |
| --- | --- | --- | --- |
| Media base / Hub Descobrir, Biblioteca, Playlists, Histórico, Drive | 1440×900 | `current/media-base-*`, `current/media-hub-*` | YouTube QA não reproduziu; Drive sem credenciais nesta instância; busca remota não executada |
| Media base / Hub / Biblioteca | 390×844 | `current/media-base-390x844.png`, `current/media-hub-mobile-390x844.png`, `current/library-390x844.png` | UI observada, não teclado virtual |
| Media base / perfil | 320×568 | `current/media-base-320x568.png`, `current/profile-menu-320x568.png` | UI observada |
| Queue aberta | 1440×900, 390×844 | `current/queue-*` | 3 itens QA, sem teste concorrente |
| Call controls / devices | 1440×900, 390×844 | `current/call-settings-*`, `current/call-controls-390x844.png` | Sem permissão de mic/WebRTC real |
| Account | 1440×900, 320×568 | `current/account-*` | UI de login/senha/identidade; sem linking Google |
| Games com controles atuais | 390×844, 320×568 | `current/games-social-*` | Media actions aparecem no chat mobile de Games: regressão de ownership atual |
| Media base + Hub + Queue + Add | 1440×900, 390×844; 320×568 para CS15–18 | `studies/pass2/CS11`–`CS18` | TARGET; estado de player é ilustração, não playback |
| Party social em Media/Games | 1440×900, 390×844; 320×568 CS22 | `studies/pass2/CS19`–`CS22` | TARGET; estados Call são ilustrativos |
| Settings / Call devices | 1440×900, 390×844 | `studies/pass2/CS23-*`, `CS24-*` | TARGET; controls não interativos |

Pacote humano e nomes exatos das dez imagens em [relatório FF1.2](../POST_1_0_FF1_2_INTERACTION_SURFACES_REPORT.md). Nenhuma captura TARGET substitui teste funcional, acessibilidade ou aparelho.
