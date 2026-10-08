# Lumio 2.0 — UX1 Final UX Audit

Data: 2026-10-08. Escopo: auditoria local da interface e duas correções de feedback. Nenhum commit, push ou deploy.

## 1. STATUS

Auditoria e correções localizadas implementadas. A revisão humana final permanece com o usuário; não foi iniciada MEDIA1.

## 2. PRODUCT_SCOPE

Produto Media-only: Conta → Casas → Party (Player/Hub/Fila/Biblioteca, Chat/Pessoas/Presença e Call). Runtime de mídia, sincronização, Socket.IO, WebRTC, OAuth, Drive e persistência não foram alterados.

## 3. FF3_1_FROZEN_ACKNOWLEDGEMENT

A aprovação humana posterior à LX0 prevalece sobre o status antigo `READY_FOR_HUMAN_QA` do relatório FF3.1. O contrato visual foi tratado como FROZEN. Nenhuma composição aprovada da Home, Party, Player, Chat ou controles sociais foi redesenhada.

## 4. LX0_BASELINE

Casas compactas e uniformes, Party apenas de mídia, rota canônica `/house/:id/media`, alias histórico `/games` apenas como redirecionamento. Sem título/crédito sob o Player mobile. Home e Party atuais foram comparadas com capturas da execução deste trabalho, não apenas com relatórios antigos.

## 5. WORKTREE

Antes das edições, `git status --short`, `git diff` e `git diff --stat` estavam vazios. As capturas de UX1 são novas em `artifacts/ux1/pass1/`. Três PNGs históricos de People foram sobrescritos automaticamente pela suíte e restaurados pontualmente ao conteúdo inicial, após copiar a evidência atual para UX1; nenhum outro arquivo histórico foi restaurado.

## 6. FILES_READ

`docs/AGENT.MD`, `docs/CLAUDE.MD`, `docs/ENTRY_FLOW.md`, `docs/SOCIAL_ARCHITECTURE.md`, relatórios FF3.1 e LX0; `apps/web/src/App.tsx`, `styles.css`, `components/HousesHome.tsx`, `AccountPage.tsx`, `GoogleIdentityButton.tsx`, `EntryExperience.tsx`, `party/experienceRoute.ts`; E2E FF11, FF3.1, FF3 People e Party; screenshots geradas localmente. Orientações de interface/acessibilidade e de React foram usadas como critérios de revisão, subordinados ao contrato humano FROZEN.

## 7. PRE_CHANGE_TESTS

No estado original: `npm run typecheck` PASS; `npm run lint` PASS; `npm run build` PASS; `npm test` PASS (server 89 aprovados/6 skips condicionais; web 31 + service worker 4); `git diff --check` PASS. `npm run test:e2e` terminou **13/14**: M1 falhou uma vez na expectativa de posição remota `> 1`, recebendo `0`; 13 casos passaram. M1 passou isoladamente e em três repetições subsequentes. Não se atribuiu a falha ao codeHash, nem se alterou runtime ou asserção por suposição. O risco intermitente fica registrado em `KNOWN_DEBT`.

## 8. UX_AUDIT_MATRIX

| Superfície | Estado após auditoria | Evidência | Ação |
| --- | --- | --- | --- |
| Landing | APPROVED / HEALTHY | Capturas desktop/mobile e navegação local | Preservar |
| Login | FUNCTIONAL UX DEFECT → corrigido | Erro bruto `Failed to fetch` quando challenge falha | Mensagem de rede localizada |
| Home | APPROVED / HEALTHY | 0/1/3/9 Casas, desktop/mobile | Preservar |
| House | APPROVED / HEALTHY | Detalhes, membros, convite, Escape | Preservar |
| Party | APPROVED / HEALTHY | FF3.1 + LX0 E2E e capturas | Preservar |
| Player | APPROVED / HEALTHY no cenário sintético | Vídeo/estado vazio/fullscreen/landscape | Sem alteração; provedores reais pendentes |
| Chat | APPROVED / HEALTHY | Desktop contextual; mobile fixo e composer | Preservar |
| Queue | APPROVED / HEALTHY na UX local | M3 multiusuário, mobile/desktop | Sem reescrita |
| Media Hub | APPROVED / HEALTHY na UX local | M2 biblioteca/coleções, estados | Sem reescrita |
| Library | APPROVED / HEALTHY na UX local | Favoritos/histórico/playlists em M2 | Sem alteração |
| Call | APPROVED / HEALTHY no cenário local | 3 clientes RTC, microfone, deafen/share | Sem signaling novo |
| Account | FUNCTIONAL UX DEFECT → corrigido | Falha 503 reproduzida com carregamento eterno | Erro e retry localizados |
| PWA | APPROVED / HEALTHY no escopo verificável | CTA e testes de instalação/service worker | Certificação de instalação física pendente |

## 9. FINDINGS

| ID | Prioridade | Superfície | Reprodução e comportamento | Causa | Resultado |
| --- | --- | --- | --- | --- | --- |
| UX1-01 | P2 | Account | Forçar 503 em `GET /api/account`: apareciam simultaneamente “Carregando conta…” e erro, sem retry. Esperado: estado de falha recuperável. | `account === null` sempre renderizava loading; `error` era exibido apenas no fim. | Corrigido e provado em E2E. |
| UX1-02 | P2 | Login Google | Abortar `POST /api/auth/google/challenge`: UI mostrava `Failed to fetch`. Esperado: mensagem compreensível em pt-BR. | Exposição direta da mensagem nativa de `TypeError`. | Corrigido e provado em E2E. |

Não foi encontrado P0/P1 reproduzível dentro do escopo UX1. A falha intermitente M1 não foi classificada como UX sem reprodução consistente ou causa demonstrada.

## 10. FIXES_IMPLEMENTED

- UX1-01: `AccountPage` diferencia loading de falha inicial, oferece `Tentar novamente`, limpa o erro antes da nova consulta e mantém os erros de ações de conta quando a conta já está carregada. Capturas: `artifacts/ux1/pass1/account-load-error-baseline.png`, `account-load-error-after.png`, `account-recovered-390.png`. Teste: E2E com 503 seguido de resposta real.
- UX1-02: `GoogleIdentityButton` converte somente erro técnico de rede (`TypeError`) em mensagem em pt-BR tanto no challenge como na confirmação. Mensagens HTTP do backend continuam visíveis; nenhum contrato OAuth mudou. Capturas: `artifacts/ux1/pass1/login-390.png` (antes, backend desligado) e `login-network-error-after.png`. Teste: E2E com request abortado.

Ambas são correções locais de feedback e não mudam CSS, navegação, backend ou design aprovado. A regra de exceção de rede foi aplicada ao Login também quando a confirmação falha, por consistência da mesma superfície.

## 11. FINDINGS_DEFERRED

- A única falha M1 da execução pré-edição é intermitente: 1 falha inicial, seguida de 4 aprovações em isolamento/repetição. Se reaparecer, investigar em SYNC1 com trace e sem enfraquecer a asserção.
- Provedores YouTube/Drive reais, Safari, dispositivos físicos e produção não foram certificados por fixtures locais. Acompanhar em MEDIA1/MEDIA2/MOBILE1/PROD1.
- Não há proposta estética P3 implementada; preferências cosméticas permanecem fora do UX1.

## 12. LANDING

Desktop e 390×844 abertos e revisados. CTA Entrar navega para `/login`; CTA Criar Casa/Criar conta e seção de instalação presentes. Não há CTA ou texto visual de Games. O navegador de exploração usou frontend local isolado; o Login mostrou indisponibilidade de API porque o backend não foi iniciado nessa sessão, e isso foi tratado como condição de rede, não como regressão do produto completo.

## 13. LOGIN

E2E existente cobre Landing → login local → sessão restaurada → Home → logout e retorno a `/login`; a nova prova cobre indisponibilidade do challenge Google. A correção não alterou escopos, protocolo OAuth ou acesso público. Deep-link e sessão expirada continuam cobertos pelo roteamento/testes existentes, não por OAuth real nesta fase.

## 14. HOME

0, 1, 3 e 9 Casas foram capturadas. A mesma classe `.house-list-item` e a mesma estrutura compacta são usadas em todas; não há `.house-featured` nem `.house-secondary`. A cor da ação `Assistir/Ouvir` surge de `partyCount > 0`, dado real, não da posição. 320/360/375/390/412/430 px e nomes longos estão no E2E S1; convite, criar Casa, membros e Party permanecem alcançáveis.

## 15. HOUSE

Detalhes, membros, permissões, convite, presença, nome longo, Escape/retorno de foco e viewport 320 px foram exercitados em S1. Sem mudança no armazenamento de Casa, membership ou roles.

## 16. PARTY

Header, menu da Casa e Party Media-only preservados. Busca visual e de código não encontrou seletor Media/Games, CTA Jogar nem Game Hub no produto ativo. O alias `/games` continua um redirecionamento histórico deliberado, não uma experiência de jogo.

## 17. DESKTOP_SOCIAL_CONTROLS

FF3.1 preservado: Mic, deafen/áudio, Chat, share, People e configurações são ações diretas. Estado conectado da Call não virou ação primária, e o agrupador social genérico `Party` não reapareceu. A prova FF3.1 exercita bloqueio de microfone, compartilhamento e preservação do player ao abrir controles.

## 18. MOBILE_MEDIA_CHAT

Player e Chat coexistem no fluxo normal; Chat não tem fechar/minimizar. Cabeçalho contém People, Queue e Add Media; composer mantém microfone à esquerda, texto e envio à direita. Não existe bloco de título/crédito abaixo do Player no mobile. As capturas 320/390/430, viewport curta e landscape foram abertas/verificadas; overlays temporários de painéis não são um segundo Chat permanente.

## 19. MOBILE_CALL_CONTROLS

Menu do microfone no composer abre/fecha e expõe estado, mic, deafen, share e configurações; People permanece fora dele. E2E FF3.1 cobre Escape, foco, permissão negada e ausência de recaptura por abrir o menu. Suporte real de screen share varia por navegador móvel.

## 20. PLAYER_PRESENTATION

Estado vazio e vídeo sintético mantêm proporção e controles; fullscreen explícito é distinto do layout normal. Testes de troca de provider, Drive nativo com orientações diferentes e fallback continuam. Nenhuma alegação de certificação dos embeds reais YouTube ou Drive.

## 21. MEDIA_HUB

M2 valida Hub, biblioteca, favoritos, histórico, coleções/playlists, erro e indisponibilidade Drive com clientes locais. Capturas desktop e mobile foram revisadas. Busca externa real não foi avaliada nesta UX1; sem alteração de API/adapter.

## 22. QUEUE

M3 valida fila vazia, adicionar, Play Next, reordenar, remover, autoplay, stale revision, lista longa, late join e reconnect entre três clientes. No mobile o acesso permanece no cabeçalho do Chat. As capturas de erro de mídia externa são estados de fixture, não prova de quebra da Queue.

## 23. LIBRARY

M2 mostra Biblioteca da Casa, Favoritos, playlists/coleções e Recentes/Histórico; busca e nomes longos entram no QA local. Persistência PostgreSQL e Drive real não foram retestados nesta fase.

## 24. PEOPLE

FF3 People testou 1, 2, 4, 8 e 12 membros reais na Party local, incluindo nomes longos, contagem, desktop/390/320 e painel com scroll. A captura de 12 membros foi aberta. Desktop mantém acesso direto; mobile mantém ícone no cabeçalho do Chat.

## 25. PRESENCE

S1 cobre Home observando Party sem entrar, online vs na Party, reconexão e último estado recebido. Testes de servidor S1/S2 validam separação de presença, mas não substituem ambiente público de longa duração.

## 26. ACCOUNT

Conta autenticada foi capturada em desktop/mobile. Formas de login e conexão Drive continuam separadas; ações de senha/linking não foram redesenhadas. UX1-01 corrige exclusivamente a falha inicial de carregamento e retry. Logout foi exercitado no fluxo E2E de entrada.

## 27. RESPONSIVE

Cobertura Chromium local em 320×568, 360×640, 375×667, 390×844, 412×915, 430×932 e 844×390 por combinação de capturas, testes de viewport e verificações de overflow. Algumas suítes usam altura 844 para varrer larguras; as alturas exatas de todos os pares solicitados não foram certificadas individualmente. Home e Party são as superfícies de maior evidência; Account 390, House 320, Queue mobile e People 320/390 também foram abertos. Nenhuma regra CSS nova foi adicionada.

## 28. KEYBOARD

FF3.1 e E2E mobile focam o composer com viewport reduzida e verificam que continua visível; menu de Call não remove o campo. Teclado físico iOS/Android, safe area real e IME não foram certificados.

## 29. FULLSCREEN

E2E mobile exercita entrar/sair de fullscreen sintético e restauração Player + Chat. Landscape mantém composição em colunas. Não se afirma bloqueio/rotação física de orientação em aparelhos reais.

## 30. ACCESSIBILITY

Nomes acessíveis dos controles principais, estados de toggle, Escape, retorno de foco dos diálogos, input de Chat e alvos móveis críticos são cobertos por E2E/FF3.1. Exploração via agent-browser leu a árvore acessível de Landing/Login. O comando automático `a11y` retornou `0 violations / 0 passes`; como não executou verificações demonstráveis, **não** foi usado como certificação WCAG. VoiceOver/TalkBack, contraste em hardware e navegação integral por teclado seguem sem certificação.

## 31. FEEDBACK_STATES

UX1-01 remove o loading eterno e oferece retry. UX1-02 substitui erro técnico cru por mensagem de rede em pt-BR. Criar Casa já desabilita o submit enquanto `busy`; fila possui estados de ação/erro existentes. As mudanças não introduzem toast global nem duplicam feedback.

## 32. PERFORMANCE_PERCEIVED

Capturas locais não mostraram remount visual do player ao abrir Chat/Call; FF3.1 verifica identidade do adapter. Não houve medição de Core Web Vitals ou teste de longa duração; isso não é um laudo de performance pública.

## 33. NO_GAMES_RESIDUE

Busca case-insensitive em `apps/web/src` por Games/Jogos/Jogar/Draw/Quiz/Cards/Gamepad encontrou apenas o alias legado `/games` em `party/experienceRoute.ts`. Não há entrada de Games na Home/Party atual. Documentos e screenshots históricas de Games foram preservados e não contam como superfície ativa.

## 34. VISUAL_PASS_1

Capturas geradas e abertas, não apenas salvas: Landing desktop/390, Login desktop/390, Home vazia/1/3/9 Casas, House Settings 320, Party vazia/ativa desktop e mobile, menu da Call, Account, fila, Hub/biblioteca, People 12 e landscape. Fontes: `artifacts/ux1/pass1/`, `test-results/lx0/ff11/`, `test-results/lx0/ff31/`, `artifacts/s1/`, `artifacts/m2/`, `artifacts/m3/` e `artifacts/frontfix/ff31/pass2/people-12-*.png`. Todas as capturas de mídia são locais/sintéticas.

## 35. VISUAL_CRITIQUE

1. LX0: nenhuma quebra visual geral observada nas capturas atuais.
2. Games: nenhum controle ativo; apenas alias histórico no código.
3–4. Home: Casas uniformes; estado ativo depende de ocupação, não de índice.
5. Party: Media-only.
6. Desktop: controles sociais diretos FF3.1.
7–10. Mobile: Player + Chat fixo; mic no composer; People/Queue/Add no cabeçalho; sem metadata sob Player.
11–13. Painéis temporários cobrem conteúdo enquanto abertos, como previsto; não foi visto corte irreversível ou overflow horizontal no cenário testado.
14. Ações centrais permanecem encontráveis.
15–16. Não foi comprovado problema de contraste/foco nas superfícies verificadas; auditoria assistiva completa continua pendente.
17. Dois defeitos de feedback foram reproduzidos e corrigidos; a falha intermitente M1 não foi atribuída à UX.
18. Nenhuma correção violou FF3.1 FROZEN.

## 36. VISUAL_PASS_2

UX1-01: comparação aberta de `account-load-error-baseline.png` vs `account-load-error-after.png`; o texto de loading desapareceu, surgiu retry, e `account-recovered-390.png` mostra a conta após nova tentativa. UX1-02: `login-390.png` registra erro cru inicial, e `login-network-error-after.png` mostra o texto compreensível. Layout adjacente permaneceu o mesmo; não houve pass 2 de Home/Party porque não foram alteradas.

## 37. SCREENSHOT_MATRIX

Todos os caminhos a seguir são relativos à raiz do repositório. As evidências-chave foram copiadas para `artifacts/ux1/pass1`, pois `test-results` é transitório.

| Superfície | Evidência aberta |
| --- | --- |
| Landing desktop/mobile | `artifacts/ux1/pass1/landing-desktop.png`, `landing-390.png` |
| Login desktop/mobile | `artifacts/ux1/pass1/login-desktop.png`, `login-390.png`, `login-network-error-after.png` |
| Home 0/1/3/9 | `artifacts/ux1/pass1/home-zero-390.png`, `home-one-desktop.png`, `home-three-desktop.png`, `home-nine-320.png` |
| Party empty/active desktop | `artifacts/ux1/pass1/party-empty-desktop.png`, `party-active-desktop.png` |
| Party empty/active mobile | `artifacts/ux1/pass1/party-empty-390.png`, `party-active-390.png` |
| Chat desktop/mobile | `artifacts/ux1/pass1/party-chat-desktop.png`, `party-active-390.png` |
| Call menu mobile | `artifacts/ux1/pass1/mobile-call-menu-390.png` |
| Queue desktop/mobile | `artifacts/ux1/pass1/queue-desktop.png`, `queue-390.png` |
| Media Hub desktop/mobile | `artifacts/ux1/pass1/media-hub-desktop.png`, `media-hub-390.png` |
| Library/playlists | `artifacts/m2/m2-favorites-desktop.png`, `artifacts/m2/m2-collection-open-desktop.png` |
| People desktop/mobile | `artifacts/ux1/pass1/people-12-desktop.png`, `people-12-390.png` |
| Account | `artifacts/ux1/pass1/account-390.png`, `account-recovered-390.png` |
| Settings | `artifacts/ux1/pass1/house-settings-desktop.png`, `house-settings-320.png` |
| Landscape/fullscreen | `artifacts/ux1/pass1/party-landscape-844.png`, `party-fullscreen.png` |

## 38. TESTS_ADDED_OR_UPDATED

Foram acrescentados dois E2E em `e2e/party.spec.ts`: erro de rede no Google Login sem mensagem técnica, e falha 503 da Conta seguida de retry bem-sucedido. Ambos falharam antes de suas correções correspondentes e passaram depois. Nenhuma asserção antiga foi removida ou enfraquecida; nenhum teste de Games foi recriado.

## 39. MULTIUSER

S1, FF3 People, Call RTC (3 clientes), M1 (3 clientes), M2 (3) e M3 (3) cobrem mesma Party, Chat/Presence, Media/Queue, Call e reconexão em ambientes locais isolados. M1 teve uma falha intermitente pré-edição, descrita acima. Não se trata de certificação WAN/TURN ou de provedor real.

## 40. FINAL_TEST_GATES

Após as alterações de código/teste: `npm run typecheck` PASS; `npm run lint` PASS; `npm run build` PASS; `npm test` PASS (89+31+4 aprovados; 6 skips condicionais); `npm run test:e2e` **16/16 PASS** (4,6 min); `git diff --check` PASS. Os skips condicionais cobrem bootstrap compilado de produção e persistência PostgreSQL, não esses caminhos em produção.

## 41. DIFF_REVIEW

Arquivos de código: `apps/web/src/components/AccountPage.tsx` e `GoogleIdentityButton.tsx` = UX1_APPROVED_FIX. `e2e/party.spec.ts` = UX1_TEST. Este relatório e `artifacts/ux1/pass1/` = UX1_DOCUMENTATION/visual evidence. As três capturas históricas People geradas pela suíte voltaram exatamente ao conteúdo inicial. `git status --short` contém apenas esses cinco grupos esperados; `git diff --stat` dos três arquivos rastreados registra 41 inserções/4 remoções; `git diff --check` PASS. Nenhum arquivo inesperado de runtime, banco ou OAuth foi editado.

## 42. KNOWN_DEBT

- M1 sincronização: intermitência de uma asserção de posição remota na primeira suíte; investigar em SYNC1 se reaparecer.
- YouTube/Drive reais e limites de navegador/provider: MEDIA1/MEDIA2.
- Safari, teclado físico, safe areas e VoiceOver/TalkBack: MOBILE1.
- WebRTC WAN/TURN e dispositivos reais: CALL1/PROD1.
- PostgreSQL condicional, Google OAuth real e infraestrutura pública: SEC2/PROD1, com autorização separada.
- Capturas dependentes de fixture local não certificam disponibilidade externa nem desempenho em produção.

## 43. HUMAN_DECISIONS_REQUIRED

Nenhuma decisão nova é necessária para as duas correções localizadas. O usuário ainda deve fazer a revisão visual final do pacote de capturas para congelar formalmente UX1; nenhuma composição FROZEN foi reaberta.

### Contract preservation matrix

| Contrato | Resultado no escopo UX1 |
| --- | --- |
| Lumio Media-only | PASS |
| Sem Games | PASS (alias histórico preservado) |
| FF3.1 FROZEN respeitado | PASS |
| Sem redesign amplo | PASS |
| Home com Casas compactas uniformes | PASS |
| Desktop Mic direto | PASS |
| Desktop Deafen direto | PASS |
| Desktop Chat direto | PASS |
| Desktop Share direto | PASS |
| Desktop People direto | PASS |
| Sem botão social Party genérico | PASS |
| Sem Call conectada como ação primária | PASS |
| Mobile Player + Chat fixo | PASS |
| Mobile Chat sem fechar | PASS |
| Mobile Mic no composer | PASS |
| Mobile People no Chat header | PASS |
| Mobile Queue no Chat header | PASS |
| Mobile Add Media no Chat header | PASS |
| Mobile sem título/crédito sob Player | PASS |
| Fullscreen restaura layout | PASS no Chromium sintético |
| Call/Share preservados | PASS no QA local |
| Media/Queue preservados | PASS no QA local |
| Nenhuma regressão relevante causada pela UX1 | PASS nos gates locais finais, sujeito à intermitência M1 pré-existente |

## 44. FINAL_VERDICT

`UX1 COMPLETE — HUMAN-APPROVED UX BASELINE PRESERVED — READY FOR MEDIA1` no escopo de QA local e fixtures sintéticas. O resultado não substitui revisão visual humana das evidências nem certificação de provedores/dispositivos/produção. Sem commit, push, deploy ou início de MEDIA1.
