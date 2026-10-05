# Lumio — FF1.1 Visual Proof & Authenticated Experience Validation

## STATUS / EXECUTIVE_SUMMARY

**Prova visual concluída para decisão de direção, sem implementação FF2.** Dez composition studies obrigatórios, em dois passes inspecionados, dez screenshots TARGET finais e 35 screenshots correntes autenticadas locais. O trabalho valida o conceito activity-first e corrige generalizações FF1: Home vazia e chat integrado mobile já funcionam visualmente; Games Hub e Draw concentram a dívida. O usuário deve revisar o pacote de dez imagens antes de autorizar FF2. O resultado é direção de produto, não aprovação de produção, acessibilidade ou playback real.

## WHY_FF1_1_EXISTED / WORKTREE_BASELINE

FF1 tinha uma Bíblia/Constituição e hipóteses fortes, mas faltava observar superfícies privadas correntes e materializar um visual comparável. No início deste turno, `git diff`/`git diff --stat` estavam vazios; os documentos FF1 em `docs/frontfix/` e o relatório FF1 já eram untracked de trabalho anterior e foram preservados. `npm run typecheck`, `npm run lint` e `npm run build` passaram antes dos estudos. Nenhum commit, push, deploy, migration ou alteração produtiva.

## FF1_DOCUMENTS_REVIEWED / AUTHENTICATED_QA_STRATEGY / SECURITY_NOTES

Lidos: `FF1_VISUAL_AUDIT.md`, `LUMIO_EXPERIENCE_BIBLE.md`, `VISUAL_CONSTITUTION.md`, `VISUAL_DEBT_REGISTER.md`, `SCREENSHOT_MATRIX.md`, `FRONTFIX_ROADMAP.md`, mais `docs/AGENT.MD`/`docs/CLAUDE.MD` e o prompt FF1.1. `e2e/ff11-visual-proof.spec.ts` iniciou app real local com armazenamento isolado descartável, signup/verificação/login normais para dois usuários fictícios `example.test`, três Casas e Party real; fotografou com Playwright sem bypass. O YouTube foi um item QA de URL pública, sem chave. Nenhuma credencial de produção foi usada ou incluída. Os arquivos `current` incluem e-mail fictício e palavra de banco local; não contêm segredo real. Sem publicação automática.

## EVIDENCE_LEVELS / CURRENT_SCREENSHOT_MATRIX

`OBS-AUTH-LOCAL`: sessão real do app local, dados QA sintéticos. `OBS-FIXTURE` e `HIST`: imagens anteriores, não prova atual. `CODE`: fonte. `TARGET`: HTML/CSS conceitual. A [matriz completa](frontfix/SCREENSHOT_MATRIX.md) lista viewports/paths/limites. Observados: Home vazia e múltipla, Party/Media vazio e ativo em preparação, Ambient, Chat, People, Call UI, Games Hub, Draw lobby/escolha/drawer/guesser, Quiz lobby/pergunta, Cards turno e Account. Não observados: vídeo tocando de fato, Drive, share real, WebRTC, PWA standalone e privacidade da mão entre contas.

## HOME_CURRENT_FINDINGS / PARTY_CURRENT_FINDINGS / MEDIA_CURRENT_FINDINGS

Home vazia é direta e humana; Home com três Casas é uma lista de cartões “workspace”. O shell Party deixa visíveis título/nav/dock mesmo quando o jogo é o foco. Media desktop tem player de tamanho razoável; Media mobile já integra player e chat no mesmo fluxo. Captura ativa ficou em “Preparando vídeo...”, logo não certifica provider/sync; toast de entrada cobre parte do palco móvel. Ambient monta, mas arte externa não validada. A paisagem atual 844×390 divide player e chat de modo funcional, ainda com pouco respiro.

## SOCIAL_CURRENT_FINDINGS / GAMES_CURRENT_FINDINGS / DRAW_CURRENT_FINDINGS

Chat, People e Call controls abrem. People tem alguns dados com aparência administrativa, porém é uma utility legítima. Games Hub: caixa de palco, três cards iguais, aviso e dock de mídia; é a superfície mais próxima de SaaS. Draw desktop: quadro compete com duas superfícies de conversa; `Adicionar mídia` persiste. Draw mobile 390: canvas reconhecível; em 320: feed do drawer fica curto; em paisagem: quadro vertical cortado. O problema não autoriza mexer no runtime/canvas nesta etapa.

## QUIZ_CURRENT_FINDINGS / CARDS_CURRENT_FINDINGS / ACCOUNT_SETTINGS_FINDINGS

Quiz mostra pergunta/alternativas claras, mas status, breadcrumb e Media dock ocupam atenção. Cards distingue turno, mesa e mão, mas herda mesmo Media dock. O texto de sistema do chat em Games diz “Adicione uma mídia para começar”, inadequado ao contexto. Account é formulário utilitário legível e não deve ser forçado a parecer um palco de entretenimento. “Settings” de conta foi observada; configurações profundas/Drive não foram exercitadas.

## FF1_HYPOTHESES_CONFIRMED / FF1_HYPOTHESES_REFUTED / NEW_FINDINGS

Confirmadas: Hub-catalog, Media chrome em Games, duas conversas Draw desktop, compressão Draw 320, corte paisagem, headers repetidos. Refutadas/parcializadas: toda Home ser dashboard (só múltiplas Casas), Media mobile estar desconectado do chat (já integrado), Quiz/Cards sem protagonismo (pergunta/mão já são reconhecíveis), necessidade de redesenhar Account (não). Novos: toast sobre player e copy de Media dentro de Games. Não inferir erro de player do harness externo.

## DASHBOARD_SMELL_VALIDATION / VISUAL_FATIGUE_VALIDATION

Games Hub marca vários sinais simultâneos: cards homogêneos, bordas aninhadas, Now Playing e dock fora de contexto; Draw desktop soma header/HUD/toolbar/duplo chat. Media desktop é mais palco do que dashboard; Home vazia não falha. Visual fatigue foi avaliada qualitativamente por densidade/bordas/microtexto, não medida em sessão de 2 horas.

## COMPOSITION_STUDY_METHOD / PASS_1 / PASS_1_CRITIQUE / PASS_2 / PASS_3_IF_NEEDED

Fonte HTML/CSS isolada `artifacts/frontfix/ff11/studies/study.html` e captura reprodutível `e2e/ff11-studies.spec.ts`. Dez estudos CS01–CS10 gerados em `pass1`, **todos abertos**. Crítica específica: presença Home pequena, emoji em Draw mascarava canvas, Games usava emoji genérico, marca comprimida, social mobile subutilizado e Media landscape cortado. `pass2` aplicou presença maior, traços SVG autorais, ilustração vetorial simples, respiro e layout de paisagem. Dez estudos foram **abertos novamente**; extras 320×568 e 844×390 gerados/abertos. Pass 3 não foi exigido para escolha de direção; visual final, acessibilidade e estados reais continuam gates FF2–FF6.

## HOME_TARGET / MEDIA_TARGET / GAMES_HUB_TARGET

Home CS01/02: Casa viva com pessoas/Party em destaque; demais Casas em linhas, criação/convite secundários. Media CS03/04: player como maior objeto, chat/presença em borda, Queue por acesso contextual; mobile mantém player e composer juntos. Games CS05/06: escolha de atividade, um jogo destacado e outros diferenciados, zero Media chrome. Os mockups usam dados ilustrativos, não APIs novas.

## DRAW_DESKTOP_TARGET / DRAW_MOBILE_TARGET / QUIZ_CARDS_SILHOUETTE_IF_CREATED / SOCIAL_EDGE_TARGET

Draw CS07/08: quadro claro dominante, HUD palavra/tempo próximo e um fluxo “Palpites e conversa”; ferramenta em drawer, composer em guesser. CS09/10: quadro 4:3 não deformado, ferramentas acessíveis, composer visível até 320; feed reduzido exige rolagem/collapse na implementação. Quiz/Cards não tiveram studies independentes obrigatórios; devem herdar game shell sem Media dock, mantendo pergunta e mão privada protagonistas. Social edge não vira segundo app: chat/pessoas/call persistem, mas recuam diante do palco.

## CURRENT_VS_TARGET / TESTES DE EXPERIÊNCIA

| Teste | Resultado do TARGET | Cautela |
| --- | --- | --- |
| Work Software | Home viva, Media cinema/conversa, Games escolha; não dashboard de gestão | Utility Account excetuada |
| Product Screenshot | Silhuetas Home/Media/Games/Draw distinguíveis | Estudos não são tela final |
| Remove The Box | Linhas substituem cards secundários; uma borda útil do palco | Borda social ainda pode ser simplificada |
| What Am I Doing | Entrar, assistir, jogar, desenhar/adivinhar aparecem de imediato | Confirmar com usuário em FF2 |
| Experience Silhouette | Palco escuro de vídeo versus quadro claro de Draw versus Casa viva | Mantém graphite/mint/Inter/logo |

## DATA_REALITY_CHECK / DOCUMENTOS

Representações de pessoas, atividade, tempo, fila e mensagens são ilustrativas; FF2 deve mapear apenas dados já autorizados da Casa/Party. Não introduzir feed social persistente, recomendador ou capacidade de player falsa. A [Bíblia](frontfix/LUMIO_EXPERIENCE_BIBLE.md) foi validada com notas de exceção; a [Constituição](frontfix/VISUAL_CONSTITUTION.md) mantém 32 regras, sem inflação; [dívida](frontfix/VISUAL_DEBT_REGISTER.md) e [matriz](frontfix/SCREENSHOT_MATRIX.md) atualizadas; [roadmap](frontfix/FRONTFIX_ROADMAP.md) revalidado.

## FF2_FINAL_CONTRACT / FF3–FF6 / GX4_2_3_HANDOFF

FF2: Home CS01/02 + shell compacto compartilhado; tirar Media chrome de Games por ownership visual; preservar 0 Casas, troca Media/Games e lifecycle de Party/call. FF3: social edge, um chat sem duplicação. FF4: player/Queue/Ambient contextuais sem tocar sync/providers. FF5: Hub, Draw/Quiz/Cards em game shell e HUD contextual. FF6: CSS, touch, 320, landscape, teclado, safe areas, acessibilidade e QA prolongado. GX4.2.3 segue **depois** FF6 para imersão/toolbar/proporção Draw. Nenhuma ordem alterada.

## FILES_CREATED / FILES_CHANGED / PRODUCTION_CODE_CHANGES / DEPENDENCIES / MIGRATIONS

Criados: esta entrega, `frontfix/FF1_1_VISUAL_PROOF.md`, dois specs QA, `artifacts/frontfix/ff11/current/` e `studies/` (fonte + pass1/pass2). Atualizados: cinco docs FF1 (Auditoria, Bíblia, Matriz, Dívida, Roadmap); Constituição validada sem edição. Código de produção: **nenhum**. Dependências: **nenhuma**. Migrations: **nenhuma**. Commit/push/deploy: **nenhum**.

## TESTS / MANUAL_QA_REQUIRED / RISKS / OPEN_QUESTIONS

`npm run typecheck`, `npm run lint` e `npm run build` passaram no baseline **e novamente ao final** (Vite: 1671 módulos). `ff11-visual-proof.spec.ts` e `ff11-studies.spec.ts` passaram; o primeiro uso de um clique de People após Ambient travou e foi removido, depois o spec inteiro passou — não afirmar que aquele estado adicional foi testado. `git diff --check` não encontrou whitespace em arquivos rastreados; os novos arquivos continuam untracked para revisão manual. QA manual pendente: YouTube/Drive reais, reconexão, WebRTC/share, PWA standalone, teclado virtual, leitores de tela/foco, 320/390 em dispositivo físico, rotação e conforto prolongado. Risco de estudos: exemplos estilizados podem ser confundidos com recursos existentes. Questão para usuário: aprova a direção das dez imagens como ponto de partida FF2? Não é autorização de deploy/FF2 automático.

## ANSWERS_TO_100_REQUIRED_QUESTIONS

| # | Resposta | # | Resposta |
| --- | --- | --- | --- |
| 1 | Sim, local atual. | 2 | Dois cadastros QA, verificação/login normais. |
| 3 | Não. | 4 | Sim, vazia e três Casas. |
| 5 | Sim, três Parties/Casas QA. | 6 | Sim, vazio/ativo/Ambient; playback não. |
| 7 | Sim. | 8 | Sim, lobby/escolha/dois papéis. |
| 9 | Sim, lobby/pergunta. | 10 | Sim, turno. |
| 11 | Conta sim; configurações profundas não. | 12 | Sim. |
| 13 | Sim. | 14 | UI sim; WebRTC não. |
| 15 | `artifacts/frontfix/ff11/current/*` deste teste. | 16 | Fixtures históricos GX; nenhum TARGET é OBS. |
| 17 | `artifacts/gx3/*`, `artifacts/gx422/*`, FF1 visitante. | 18 | Provider playback, share/call real, PWA, Drive, teclado/leitor. |
| 19 | Hub-catálogo, chrome Media Games, Draw duplicado/comprimido. | 20 | Home vazia, Media mobile integrado, Account utilitário. |
| 21 | Games Hub. | 22 | Caixa + cards iguais + dock + metadados. |
| 23 | Home vazia. | 24 | Uma decisão clara: criar/entrar. |
| 25 | Casa/jogo clicável; palco delimitado. | 26 | Envelopes e cards internos repetidos. |
| 27 | Linhas de Casas secundárias e opções de jogo. | 28 | Nav Games + breadcrumb + título de jogo. |
| 29 | “Jogos”, status/Now Playing repetidos. | 30 | Dock Media em jogo; duplo chat Draw. |
| 31 | `Adicionar mídia` no dock universal em Games. | 32 | Microtexto + barras/headers + dois feeds. |
| 33 | Dez obrigatórios, cinco extras de viewport. | 34 | Sim, dez. |
| 35 | Sim, todos os dez pass1. | 36 | Home, Draw, Games, Media paisagem. |
| 37 | Presença fraca, emoji, vazio social, controles cortados. | 38 | Sim, dez pass2. |
| 39 | Não para direção; FF2 requer iteração final. | 40 | Draw: emoji → traço SVG e feed mobile. |
| 41 | Home com três Casas. | 42 | Objeto Casa é card por natureza, precisa pessoas/atividade. |
| 43 | A Casa onde a turma está. | 44 | Avatares e Party em andamento, sem KPI. |
| 45 | Lugar de encontro, não workspace. | 46 | Sim, secundário abaixo. |
| 47 | Não no TARGET; atual múltipla sim. | 48 | Sim, como direção. |
| 49 | Sim, ocupa palco. | 50 | Acesso contextual, fora do vídeo permanente. |
| 51 | Contextual ao Media, não no Games. | 52 | Borda lateral/abaixo do player. |
| 53 | Uma faixa curta. | 54 | Sim em 390; 320 real ainda testar. |
| 55 | Sim no TARGET. | 56 | Sim como silhueta; playback real pendente. |
| 57 | Sim. | 58 | Não no TARGET; atual sim. |
| 59 | Não no TARGET. | 60 | Não no TARGET. |
| 61 | Só nome útil, sem triplicação. | 62 | Sim por edge contextual. |
| 63 | Sim em jogo ativo; Hub mostra escolha. | 64 | Sim no TARGET. |
| 65 | Sim. | 66 | Sim. |
| 67 | Não no TARGET; sim atual desktop. | 68 | Sim, “Palpites e conversa” único. |
| 69 | Sim, quadro/toolbar próximos. | 70 | Não no TARGET; feed secundário/rolável. |
| 71 | Sim, seis atalhos visíveis no estudo. | 72 | Conceitualmente sim: quadro/composer visíveis; QA físico pendente. |
| 73 | Sim. | 74 | Sim, na lateral/contexto. |
| 75 | Sim no TARGET. | 76 | Sim para direção; precisão/touch pendentes. |
| 77 | Sim. | 78 | Logo, graphite/mint, Inter, ritmo calmo. |
| 79 | Casa viva / player escuro / escolha / quadro claro. | 80 | Nenhuma no TARGET. |
| 81 | Primeiro Games emoji era genérico; revisado. | 82 | Não no pass2. |
| 83 | Não. | 84 | Não no TARGET; Account pode ser utilitário. |
| 85 | Sim, emoji substituído e hierarquia ajustada. | 86 | Sim, para direção FF2. |
| 87 | CS01/CS02. | 88 | Identidade compacta CS03/05/07. |
| 89 | Dock Media Games, headers/bordas redundantes. | 90 | Chat/call, House, player, rotas, vazia. |
| 91 | Queue/Add Media/People/score sem perder acesso. | 92 | `App.tsx` Party shell/dock, GameHub/Draw composição. |
| 93 | Sim, direção definida; detalhe FF2 ainda iterar. | 94 | Sim, um chat/edge. |
| 95 | Sim, Media contextual. | 96 | Sim, Hub/jogos. |
| 97 | Sim, integração/QA. | 98 | Não. |
| 99 | Sim. | 100 | Sem blocker visual de **direção**; QA real é gate de implementação. |

## HUMAN_REVIEW_PACKAGE

Abra estes **dez** TARGETs finais, em ordem; compare com a [matriz current](frontfix/SCREENSHOT_MATRIX.md). Todos estão em `artifacts/frontfix/ff11/studies/pass2/`:

1. [CS01 Home desktop](../artifacts/frontfix/ff11/studies/pass2/CS01-1440x900.png)
2. [CS02 Home mobile](../artifacts/frontfix/ff11/studies/pass2/CS02-390x844.png)
3. [CS03 Media desktop](../artifacts/frontfix/ff11/studies/pass2/CS03-1440x900.png)
4. [CS04 Media mobile](../artifacts/frontfix/ff11/studies/pass2/CS04-390x844.png)
5. [CS05 Games Hub desktop](../artifacts/frontfix/ff11/studies/pass2/CS05-1440x900.png)
6. [CS06 Games Hub mobile](../artifacts/frontfix/ff11/studies/pass2/CS06-390x844.png)
7. [CS07 Draw desktop drawer](../artifacts/frontfix/ff11/studies/pass2/CS07-1440x900.png)
8. [CS08 Draw desktop guesser](../artifacts/frontfix/ff11/studies/pass2/CS08-1440x900.png)
9. [CS09 Draw mobile drawer](../artifacts/frontfix/ff11/studies/pass2/CS09-390x844.png)
10. [CS10 Draw mobile guesser](../artifacts/frontfix/ff11/studies/pass2/CS10-390x844.png)

Anexos técnicos: `CS02/06/09/10-320x568.png` e `CS04-844x390.png` na mesma pasta. A pergunta final: sem ver o Lumio anterior, estas imagens descrevem primeiro um lugar para estar junto/assistir/jogar? **Sim para direção**, com visual final e uso real ainda por validar.

## FINAL_VERDICT

**FF1 + FF1.1 READY TO FREEZE — FF2 READY**

“Ready” aqui autoriza apenas pedir revisão humana da direção e, depois, iniciar FF2 separadamente. Não declara site publicado, fluxo de provider/call testado nem implementação FF2 concluída.
