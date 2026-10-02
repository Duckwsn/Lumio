# GX4.2.2 — Draw Visual & Layout Reconstruction

## STATUS

Implementação local e validação concluídas. Sem commit, push ou deploy.

## REFERENCE_ANALYSIS

As duas imagens do Gartic enviadas pelo usuário foram usadas somente para estudar hierarquia: lista compacta de jogadores, ferramentas junto ao quadro, palavra/tempo associados ao desenho e conversa acessível. Nenhum logo, cor, ilustração, ícone ou asset foi copiado. A solução continua na paleta escura e verde do Lumio. O pedido posterior do usuário substitui a separação entre “Palpite” e “Conversas”: o Draw agora possui um fluxo único de mensagens e palpites.

## CURRENT_DRAW_AUDIT

O Draw anterior distribuía jogadores, placar, controles, palavra e feed em blocos independentes. No mobile, a altura entre canvas, atividade e compositor era governada por regras legadas conflitantes.

## WHY_CURRENT_UI_LOOKED_AMATEUR

O conjunto lembrava um formulário/dashboard: a toolbar ocupava espaço de conteúdo e o canvas perdia protagonismo. Em 320 px o feed recebia apenas 50 px e em 390×500 o campo terminava abaixo do viewport.

## BASELINE_SCREENSHOTS

Oito baselines em `artifacts/gx422/baseline/`: drawer e guesser em 1440×900, 1280×720, 390×844 e 320×568. As capturas foram abertas antes da alteração. As referências posteriores da primeira, segunda e revisão final estão nos diretórios `pass1/`, `pass2/`, `pass3/`, `unified/` e `final-review/`.

## LAYOUT_STRATEGY

A mesa ativa é uma única grade: Player Rail à esquerda, Tool Rail somente para o desenhista, quadro 4:3 no centro e atividade integrada abaixo.

## DESKTOP_DRAWER

Desenhista vê quadro e controles lado a lado, sem blocos de configuração redundantes. Conferido em 1440×900 e 1280×720.

## DESKTOP_GUESSER

Guesser elimina a coluna de ferramentas e usa o espaço disponível para o quadro e a conversa. Conferido nas mesmas resoluções.

## PLAYER_RAIL

Tem aproximadamente 150–190 px no desktop e scroll próprio; 12 jogadores não comprimem o canvas. Linhas compactas mostram avatar, papel e pontuação.

## TOOL_RAIL

Pincel, borracha, espessura, paleta, undo e clear formam uma barra operacional junto ao quadro; não são controles de formulário. Clear continua exigindo confirmação.

## WORD_HINT_HEADER

Palavra mascarada ou palavra do desenhista fica acima do quadro. Não foi criado botão de dica: o GX4.2.2 original excluía nova mecânica de hints e não existe ação autoritativa correspondente no servidor. Um botão sem função seria enganoso; dicas exigem especificação própria.

## TIMER

Tempo e progresso ficam na mesma superfície do canvas, sem mudar o relógio autoritativo.

## CANVAS

Mantém buffer lógico 800×600, proporção 4:3, `touch-action` apropriado e eventos autoritativos de traço/undo/clear.

## ACTIVITY_SURFACE

O pedido posterior do usuário foi incorporado: mensagens normais e palpites errados são mesclados cronologicamente em uma única lista da mesa. Palpites corretos exibem o acerto sem revelar a palavra; texto errado que contenha literalmente a resposta é redigido no feed público. O histórico Party também aparece nessa lista durante o jogo.

## GUESS_COMPOSER

Há um só campo, sem abas “Palpite”/“Conversas”. Durante DRAWING, o palpiteiro elegível envia por `game:action`; após acertar, ou quando não elegível, o mesmo compositor envia mensagem Party. Um erro de edição de um caractere ou transposição adjacente, para palavras normalizadas de pelo menos quatro caracteres, retorna “Quase! Seu palpite está próximo.” somente no ack ao autor. Não altera score, prazo, palavra ou protocolo.

## WORD_CHOICE_OVERLAY

Escolha de palavra virou overlay com foco contido. A palavra real e as escolhas continuam privadas do desenhista até a revelação; clientes guesser não recebem secret/choices.

## ROUND_RESULT

Preserva quadro, palavra revelada, pontos e próximo desenhista no contexto da mesa.

## GAME_RESULT

Mantém placar, vencedor e rematch. A navegação de jogos permanece a saída, sem novo botão “Voltar à mídia”.

## MOBILE_DRAWER

Prioriza quadro e ferramentas horizontais; Player Rail vira placar acionável, sem roubar largura.

## MOBILE_GUESSER

Prioriza quadro, lista rolável e campo ao fim da mesa. Em 320×568 e 390×844, o desenho preserva 4:3 e não há overflow horizontal. A linha da `.main-stage` agora preenche a altura disponível quando não há stage-switcher.

## MOBILE_KEYBOARD

Em 390×500 a linha do quadro é limitada à altura útil e o compositor fica visível. Com o input focado, o modo compacto reduz o quadro; validar ergonomia em teclado virtual físico.

## LANDSCAPE

Fullscreen em 844×390 foi exercitado; a antiga coluna vazia foi removida.

## 12_PLAYER_STRESS

Fixture testa pontuações extremas, timer crítico, 200% de zoom e reduced motion; o placar tem scroll independente.

## LONG_NAMES

Nomes longos são truncados visualmente, não removidos dos dados nem capazes de alargar a mesa.

## PRIVACY_REGRESSION

Testes verificam secret ausente do DOM, atributos, storage, acessibilidade e console de guessers. O aviso “Quase” não é enviado aos demais clientes. A autoridade do servidor, score e canvas permanecem; a alteração de runtime autorizada pelo pedido posterior limita-se ao ack privado de palpite próximo e à redação preventiva do feed público.

## ACCESSIBILITY

Botões têm nomes acessíveis, a escolha de palavra mantém foco, o aviso de proximidade usa `role=status` e clear permanece explícito.

## MULTI_CLIENT

Três contas reais A/B/C verificam sincronismo dos traços, mensagens/palpites compartilhados e reconexão.

## ROLE_TRANSITION

Passagem de desenhista, acerto, saída, espectador, resultado e rematch passaram no E2E G2/G3.

## VISUAL_QA_PASS_1

Capturas em `artifacts/gx422/pass1/` foram abertas e comparadas às baselines.

## PROBLEMS_FOUND

A grade desktop mantinha o rail abaixo da mesa e canvas pequeno; no mobile havia clipping e fullscreen paisagem estreito. Depois, a revisão final encontrou um quadro estreito com moldura alongada no viewport curto.

## VISUAL_QA_PASS_2

Seletores escopados venceram CSS legado, grade desktop ficou explícita, toolbar compacta e Player Rail independente. Capturas em `pass2/` e `pass3/` foram abertas. A revisão do pedido adicional integrou a conversa, ajustou alturas mobile, removeu a coluna vazia em paisagem e corrigiu a moldura 4:3. Capturas em `unified/`, `final-review/` e oito screenshots reais da execução final foram abertas.

## REFERENCE_COMPARISON

O resultado retém a hierarquia funcional da referência sem reproduzir a identidade visual do Gartic.

## GX4_1_REGRESSION

O fixture GX4.2.1 foi adaptado apenas onde a nova organização visual muda a posição relativa dos elementos; 12 pessoas, zoom, privacidade e canvas passaram.

## GX3_REGRESSION

Rotas Media/Games não tiveram implementação alterada e passaram na suíte integrada.

## QUIZ_CARDS_REGRESSION

Quiz e Cards não tiveram implementação alterada e ambos passaram na suíte integrada.

## TESTS

- `npm run build`: passou.
- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: passou — servidor 142/143 (1 skip pré-existente), web 35/35 e service worker 4/4.
## E2E

- E2E direcionado G2: passou, 3 clientes, chat/palpites, “quase”, privacidade, reconexão, mobile e fullscreen.
- E2E direcionado G3: passou, meta/tema, rotação, resultado e rematch.
- E2E GX4.2.1: passou, fixture de stress e zoom.
- `npm run test:e2e` completo: **17/17 passaram**, executado após o último CSS; duração 9,6 minutos.

## POSTGRESQL

Os testes de persistência utilizaram somente o container QA isolado `lumio-gx422-qa-postgres`, banco `lumio_test`, porta local 55432. O container descartável foi removido após a validação. Nenhuma migração de produção, db push ou alteração no banco de desenvolvimento.

## FILES_CHANGED

Implementação: `apps/web/src/games/{DrawGame,DrawCanvas,DrawScoreboard,PartyGameChat,drawV4.css}`, `apps/web/src/components/{GameHub,PartyStages,PartyComposer}`, `apps/web/src/App.tsx`, `apps/server/src/{drawGame.ts,drawGame.test.ts}`, `apps/web/qa/draw-freeze.tsx`, `e2e/party.spec.ts`. Evidências locais: `artifacts/gx422/`.

## DEPENDENCIES

Nenhuma dependência nova.

## MIGRATIONS

Nenhuma migration nova.

## KNOWN_LIMITATIONS

O campo único envia texto como palpite enquanto o jogador pode adivinhar; após acertar, vira mensagem de Party. Dica não foi implementada. Em 390×500 com entrada focada, a compactação reduz o quadro para preservar o campo.

## MANUAL_QA_REQUIRED

Recomenda-se validar teclado virtual e gestos em Android/iOS reais, PWA instalado, leitor de tela e conexões lentas. Automação local não substitui validação hospedada de WebRTC/Drive.

## GX4_3_HANDOFF

GX4.3 não foi iniciada. O desenho visual está estabelecido para a próxima etapa, observada a QA manual acima.

## RESPOSTAS ÀS 55 PERGUNTAS OBRIGATÓRIAS

1. A UI anterior parecia amadora pela fragmentação em blocos de formulário e pelo canvas secundário.
2. Foram abertas as oito baselines listadas acima.
3. Sim, desktop usa Player Rail.
4. Cerca de 150–190 px.
5. Sim; scroll interno para 12 jogadores, sem reduzir o canvas.
6. Sim, Tool Rail junto ao canvas.
7. Sim, guesser não monta a toolbar.
8. Sim, guesser usa a coluna liberada.
9. Sim, buffer lógico 800×600.
10. Sim, apresentação 4:3.
11. Sim, maior e central em 1440×900.
12. Sim, utilizável em 1280×720.
13. Sim, palavra/pista fica acima do quadro.
14. Sim, tempo e progresso ficam associados ao quadro.
15. Sim, controles formam toolbar compacta.
16. Pincel e borracha por ícones/botões nomeados.
17. Tamanhos por três pontos de espessura.
18. Paleta por amostras compactas.
19. Sim, undo segue o servidor.
20. Sim, clear requer confirmação.
21. Sim, atividade abaixo do canvas.
22. Sim, compositor visível ao guesser, inclusive 390×500 e paisagem.
23. Visualmente não durante Draw: mensagens e palpites são integrados; transporte Party/game continua separado.
24. Sim, escolha de palavra é overlay da mesa.
25. Sim, escolhas chegam apenas ao desenhista.
26. Não, secret não aparece no markup do guesser antes da revelação.
27. Sim, Round Result preserva a mesa.
28. Sim, drawer mobile prioriza quadro e ferramentas.
29. Sim, guesser mobile prioriza quadro, feed e entrada.
30. Sim, 320×568 permanece operável.
31. Sim, 390×844 funciona.
32. Sim, 844×390 em fullscreen foi testado.
33. Sim, simulação de teclado/viewport curto passou nos E2E direcionados.
34. Sim, stress fixture com 12.
35. Sim, nomes longos não rompem a mesa.
36. Sim, Player Rail tem scroll próprio.
37. Sim, o DRAWING ativo se ajusta à superfície sem scroll horizontal da página.
38. Não; nenhum asset da referência foi copiado.
39. Não; permanece a paleta Lumio.
40. Sim, identidade Lumio preservada.
41. Oito screenshots reais da suíte final foram abertas: `g2-guesser-mobile`, `g6-draw-guesser-desktop`, `g2-landscape-fullscreen`, `g6-draw-drawer-320`, `g6-draw-guesser-320`, `gx42-guesser-320x568`, `g3-guesser-keyboard` e `g6-draw-result`.
42. Grid desktop incorreto, canvas pequeno, clipping mobile e paisagem estreita.
43. Grid/seletores corrigidos; depois, feed único e altura mobile preenchida.
44. Sim, três clientes A/B/C no E2E G2.
45. Sim, G3 cobre rotação/desenhista/observador.
46. Sim, secret ausente das projeções/DOM de guesser.
47. Não; multitouch, cancelamento, eraser e undo passam no G2.
48. Sim, Quiz e Cards passaram na suíte completa.
49. Sim, E2E direcionado G3 passou.
50. Sim, a suíte completa foi executada depois do último CSS e dos novos asserts 4:3.
51. `npm test` passou: 142/143 servidor (1 skip), 35/35 web, 4/4 SW.
52. `npm run test:e2e`: 17/17 passaram, 9,6 minutos.
53. Não.
54. Não.
55. Dispositivos físicos, teclado real, leitor de tela e rede/serviços hospedados.

## FINAL_VERDICT

GX4.2.2 aprovado em QA local. A ressalva de QA manual em dispositivo físico não bloqueia o freeze visual local; GX4.3 não foi iniciada.

GX4.2.2 READY TO FREEZE — GX4.3 READY
