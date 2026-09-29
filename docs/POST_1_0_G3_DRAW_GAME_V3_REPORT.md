# Lumio — Pós-1.0 G3 Draw Game V3 / Match System V2

Data: 2026-09-29. Base local: `e4deceb`. Este relatório descreve implementação e QA locais, não um deploy.

## STATUS

Implementação concluída e verificada localmente. Build, typecheck, lint, testes de código e oito E2E passaram. QA de aparelhos físicos, redes externas e providers reais continua listado em MANUAL_REQUIRED; não é certificação de produção.

Nenhum commit, push, deploy, acesso mutável à produção, alteração de .env, Auth/OAuth/scopes, infraestrutura, Prisma/schema/migration, db push/reset ou dependência nova. P2022 de produção permanece investigação separada.

## AUDIT

Git limpo no início; `git status` e `git diff` conferidos. Lidos prompt G3, AGENT.MD, CLAUDE.MD, relatórios G0/G1/G2 e documentação Call relacionada. PROJECT_CONTEXT.md não existe. Código real auditado: contrato, DrawGameRuntime, banco, DrawGame/Canvas/Scoreboard, PartyGameChatProvider/Composer, MobilePartyChat, App, MainStage/GameHub, lifecycle de mídia/voz, integração e E2E.

Reprodução pré-alteração: nove testes do runtime G2 passaram. Confirmados limite de duas voltas, score 101–200/+40, palavras sem categoria, configuração ausente e composição mobile semelhante entre papéis.

Mantidos socket autenticado, membership/guarda existentes, uma sessão efêmera por Party, participação opcional, fases/deadlines, 5s grace period, board incremental, batching 32 pontos/50ms, revisões separadas, undo/clear, limites e projeções individuais. Não criou segundo jogo ou framework.

## MATCH CONFIGURATION

`configure` foi adicionado à union estrita de `game:action`. Envia sessão/rodada/revisão, `targetScore` allowlisted e `theme` controlado. Defaults: meta 100 e Geral.

Só coordenador participante online altera no LOBBY. Revisão exata impede config velha de sobrescrever nova; sessão/rodada antigas são rejeitadas. Não há config local autoritativa nem config revision adicional. Todos recebem os metadados atualizados sem refresh. Após iniciar, configuração fica travada inclusive em ROUND_RESULT/GAME_RESULT.

## TARGET SCORE

Presets 50/100/150/200. Sem campo numérico arbitrário; schema recusa string, NaN, Infinity, 0, negativos, valores fora da allowlist e propriedades extras. Meta fica visível no header e score/meta no placar. Pontuação não é truncada quando excede a meta.

## THEMES

Geral (`general`), Animais (`animals`), Comidas (`food`), Natureza (`nature`), Lugares (`places`), Cotidiano (`daily`). Labels públicos no contrato; palavras apenas no servidor. Cotidiano inclui objetos, transporte, personagens e ações simples, evitando categorias de poucos termos.

## WORD BANK

178 termos PT-BR locais originais. Todos os 120 termos do banco G1 foram preservados e categorizados; complementos próprios, sem scraping, API, IA ou lista de outro jogo.

| Tema | Termos |
|---|---:|
| Animais | 28 |
| Comidas | 28 |
| Natureza | 28 |
| Lugares | 28 |
| Cotidiano | 66 |
| Geral (união, sem duplicar banco) | 178 |

Testes confirmam retenção dos originais, unicidade normalizada, tamanho mínimo e pertencimento de todas as opções ao tema.

## WORD SELECTION

Servidor filtra pool conforme tema e palavras efetivamente escolhidas na partida. `crypto.randomInt` seleciona sem reposição até três opções distintas. Escolha manual e automática marcam palavra usada. Opções não escolhidas podem reaparecer, pois não foram utilizadas no desenho.

Enquanto restarem palavras inéditas, só elas são oferecidas: perto do esgotamento podem existir uma ou duas opções. Ao esgotar completamente, histórico leve é limpo e o pool volta a ser elegível. Não há histórico global/banco. Rematch limpa o histórico. Set, palavra e opções não entram na projeção pública; somente choices privadas do drawer.

## SCORE FORMULA V3

Para cada acerto válido, calculado exclusivamente no servidor:

`r = clamp((endsAt - now) / drawDuration, 0, 1)`

`guessPoints = 6 + floor(4 × r) - min(2, número de acertos anteriores na rodada)`

Resultado: 4–10 pontos. Primeiro acerto: 6–10; segundo: 5–9; terceiro e seguintes: 4–8. A ordem influencia no máximo dois pontos; tempo influencia no máximo quatro. O máximo 10 exige fração exatamente 1 (possível no mesmo milissegundo de início); em transporte real geralmente o primeiro máximo observado é 9. Deadline continua estrito: no/depois de endsAt é recusado, não uma oportunidade de ganhar 4 pontos.

Drawer: `min(2, 6 - ganho_do_drawer_na_rodada)` por acerto. Portanto +2 nos três primeiros acertos, zero nos posteriores, máximo 6 por rodada. O cap evita +22 num grupo de 12 enquanto guessers ganham poucos pontos. Sem acertos: zero. `guessed` impede duplicata; cliente não informa score ou vencedor. `roundPoints` continua autoritativo, resetado por rodada.

## SCORE CALIBRATION

Script reproduzível: `node --import tsx scripts/draw-match-calibration.ts`. 1.000 partidas por combinação (16.000 total), PRNG determinístico seed 20260929. Hipóteses: chance independente de acerto 75%; fração restante uniforme .2–.9; ordem por chegada temporal, rotação circular, sem ausências. Tempo ilustrativo: escolha média 7s, resultado 5s; se todos acertam, último acerto encerra; caso contrário aguarda 80s.

Rodadas médias até o resultado:

| Jogadores | Meta 50 | Meta 100 | Meta 150 | Meta 200 |
|---:|---:|---:|---:|---:|
| 2 | 13,4 | 26,5 | 39,8 | 53,5 |
| 3 | 9,8 | 19,8 | 30,1 | 40,3 |
| 5 | 8,5 | 17,5 | 26,6 | 35,9 |
| 8 | 8,4 | 17,6 | 26,9 | 36,5 |

Pontos totais médios distribuídos por rodada: aproximadamente 7,3 / 14 / 25,5 / 39 nos grupos de 2/3/5/8. Isso é soma de todos, não ganho individual.

Faixa p10–p90 de rodadas para meta 50: 11–17 / 8–12 / 7–10 / 7–9, respectivamente. Meta 200: 48–59 / 37–44 / 33–38 / 34–39.

Tempos ilustrativos: meta 50 aproximadamente 12–13min; 100 aproximadamente 24–26min; 150 aproximadamente 36–40min; 200 aproximadamente 49–54min. Os presets são deliberadamente curta/normal/longa/bem longa, não promessa de duração. Grupos rápidos podem terminar muito antes; baixa taxa de acerto pode prolongar muito. Não é benchmark humano/WAN. Default 100 preserva uma sessão normal; 50 permite experimentar sem assumir partida longa.

## VICTORY CONDITION

Receber pontos não encerra imediatamente. A rodada continua até todos os guessers online elegíveis acertarem, o prazo vencer ou a regra de saída resolver a rodada. ROUND_RESULT permanece 5s; na fronteira seguinte o servidor verifica se alguém atingiu target e gera GAME_RESULT sem iniciar novo drawer.

Todos tiveram sua oportunidade dentro da rodada. Scores superiores à meta permanecem reais. Registros de quem saiu durante a partida ou após o resultado conservam seus pontos e nomes; a comparação considera esses registros, sem apagar contribuição anterior. A revanche filtra os participantes elegíveis e zera a nova partida. Se nenhum target foi atingido e restam menos de dois online, encerra com motivo `insufficient_players` e sem declarar vitória por meta.

## TIE RULES

Ao atingir a meta, maior score da partida vence. Empate no maior score resulta em vitória compartilhada (`winnerIds` do servidor). Sem critério por latência, socket, render, nome ou inscrição e sem rodada de desempate. A ordem de acerto influencia o ganho pela fórmula declarada, não atua como tiebreak secreto.

## CONTINUOUS ROTATION

Não existe totalRounds nem duas voltas como condição final. Cursor interno circular percorre ordem inicial, pulando ausentes, com busca limitada a uma volta. Round conta rodadas iniciadas, não posições offline puladas. Próximo drawer é projetado pelo servidor, evitando frontend adivinhar índice depois de skip.

Sem pontos/meta, rotação pode continuar indefinidamente enquanto há jogadores: é consequência explícita de vitória por target, não se adicionou limite oculto de rodadas. Testes ultrapassam duas voltas e verificam meta interrompendo nova rotação.

## LOBBY V3

Uma hierarquia: participantes/placar → Partida (presets + seletor de tema) → iniciar. Sem wizard, settings page, opções avançadas ou modal global. Não autorizado vê configuração, mas fieldset fica disabled; backend valida independentemente da UI.

Rematch é do coordenador, mínimo dois online, na mesma sessão. Retorna ao lobby, conserva ativos/tema/meta e zera scores/board/feed/usedWords/resultado. Coordenador pode configurar antes de iniciar novamente. IDs de rodada novos invalidam ações antigas; Party/Chat/Call não são reconstruídos.

## DRAWER MOBILE

Durante CHOOSING_WORD/DRAWING do participante drawer online: Chat estrutural fica `hidden`, fora da composição e da árvore acessível, mas continua montado. Workspace ocupa a área disponível com canvas lógico 4:3 e toolbar. Header compacto mostra rodada, tema/meta e timer; palavra privada permanece visível. Ferramentas: pincel, borracha, undo nomeado, limpar confirmado, espessura e cores. Undo icon-only no mobile tem aria-label/title; nomes e atalho desktop mantidos.

Canvas usa largura disponível sem esticar o desenho; em portrait estreito, largura limita altura e não se inventa canvas vertical incompatível. Landscape/fullscreen utiliza colunas para ferramentas. Informações secundárias/placar completo não ocupam o drawer mobile durante desenho; score/posição pessoal continuam no header. Voltar à mídia/Hub dá acesso ao Chat e ações existentes sem sair do jogo.

## GUESSER MOBILE

Durante outro drawer ativo: status/tema/timer compactos, canvas menor, histórico integrado grande e composer fixo no fluxo inferior. Elegíveis podem Palpitar/Conversar; observadores e quem acertou continuam Chat normal. Pontos/posição/meta ficam no header, sem dashboard ocupando o histórico. Placar completo reaparece no resultado ou desktop.

## ROLE-ADAPTIVE LAYOUT

`gamePresentationRole` deriva neutral/drawer/guesser de metadados públicos + apresentação selecionada + identidade local. `PartyGameWorkspace` aplica data-game-role; não altera regras/sockets. MobilePartyChat usa o mesmo cálculo para hidden. Nenhum efeito limpa histórico/draft ou recria engine por papel.

Retrato: drawer recebe restante da área; guesser recebe stage flexível limitado por VisualViewport, com canvas proporcionalmente menor e Chat flexível. Paisagem conserva colunas para viewer, enquanto drawer pode usar largura completa e ferramentas à direita. Fullscreen continua superfície própria.

O listener existente de VisualViewport sinaliza altura compacta abaixo de 600px. Apenas no guesser portrait, com composer focado e fora de fullscreen, o canvas fica ainda menor e navegação secundária/título são temporariamente ocultos; voltam ao desfocar ou recuperar altura. Isso corrigiu clipping com viewport 390×500 sem destruir o histórico ou ocultar o composer.

## CHAT PRESERVATION

ChatPanel e MobilePartyChat conservam tipo/key durante troca de papel. Hidden é apenas apresentação; mensagens seguem atualizando snapshot e timeline. Rascunho normal pertence ao provider da Party, separado do guess. G3 testa identidade DOM do Chat, mensagem recebida durante desenho e draft presente após resultado, sem refresh. Troca de breakpoint desktop/mobile ainda muda superfície como antes; provider conserva drafts, não se promete sobreviver a reload completo.

Scroll segue mecanismo G2: acompanha quando próximo ao fim, preserva leitura quando rolado acima, indicador de novas mensagens. Não criou outra timeline. Palpite de rodada é descartado ao trocar rodada, não convertido em conversa normal.

## CHAT/GUESS

Composer/protocolos G2 preservados: Conversar usa chat:message; Palpitar usa game:action/guess. Backend compara, sanitiza e pontua; acerto só produz “Nome acertou!”. Provider social omite word/choices/board. Palavra só revelada no resultado. Não impede usuários contarem deliberadamente a resposta por conversa/voz.

## TOOLBAR MOBILE

Duas faixas compactas: ferramentas/undo/clear/espessura e cores roláveis com alvos touch. Não há painel permanente sobre o canvas ou gesto secreto. Clear exige confirmação; Ctrl/Cmd+Z usa mesmo undo autoritativo e ignora edição de texto/overlays/redo/repeat/inelegibilidade. Não houve alteração no algoritmo de pintura/coordenadas.

## FULLSCREEN

Hook Fullscreen API/fallback e tentativa de paisagem preservados. Drawer prioriza board/tools e não recebe composer fullscreen. Guesser continua podendo palpitar no PartyComposer contextual, compartilhando drafts e protocolo, sem segundo histórico. Sair conserva apresentação/board. Escape e mini diálogo mantêm G2. Rotação física e Safari/PWA permanecem QA manual.

## DESKTOP

Não aplica ocultação mobile: Chat lateral permanece, layout canvas/placar/ferramentas G2 conservado. Configuração, tema/meta, score novo e resultados também estão no desktop. GameHub V2/ícone/card/lazy continuam iguais.

## RECONNECT

Snapshot individual inclui target/theme/score/phase/round/cursor projetado/timestamps/board; config não retorna a defaults. Grace 5s e pedidos de sync existentes conservados. Nenhuma mutation repetida às cegas. Palavra/choices somente para drawer legítimo conforme fase.

## LATE JOIN

Quem chega observa partida atual, vê meta/tema/placar/prazo e não entra na ordem. Pode participar no resultado/lobby. Não usa nova Party ou socket. Ordem nova é definida ao iniciar, não por entrada arbitrária no meio.

## CALL

RTCManager/signaling/STUN/TURN/captura/mute/deafen não alterados. Hidden Chat não executa teardown de call. Mic ON/OFF permanece; botões continuam nas superfícies existentes (voltar à mídia dá acesso no drawer mobile). Regressão de três peers/áudio sintético passou. WAN/TURN e hardware reais não são certificados por loopback.

## MEDIA

MainStage/MediaStage permanecem montados; não mudou provider/playhead/operationId/queueRevision/mediaRevision/autoplay. Tema, score ou papel não pedem ticket/seleção/captura. Game continua apresentação local.

## YOUTUBE

Iframe único continua em região visível separada de pelo menos 200px, conforme decisão G0/G1/G2. Não esconder deliberadamente, extrair, duplicar ou colocar offscreen. Essa área consome viewport, sobretudo com teclado: jogo pode rolar internamente e não é garantido que todas as ferramentas/placar caibam simultaneamente. Não sacrificar compliance para prometer canvas/Chat irreais; landscape/fullscreen/retorno à mídia são opções. Fixture não certifica serviço/políticas Google reais.

## DRIVE

Ticket/Range/src/lifecycle/playhead não foram alterados. Troca de papel/config não reinicia vídeo. Regressões de adapters e fixtures existentes; OAuth/arquivo remoto reais continuam manuais.

## SCREEN SHARE

Slot/track/conexão continuam existentes. Iniciar jogo não para share; chegada de share não termina game. Regressão conserva srcObject/engine em fixture, não realiza captura física do sistema.

## SECURITY

Allowlist/union strict, identidade do socket, membership e phase/revision/deadline verificados no backend. Config não concede role de House. Set de palavras usadas/cursor interno são omitidos da projeção; labels públicos não contêm banco. Testes capturam payloads antes de revelação. RoundPoints/winnerIds/resultReason são produzidos no servidor.

Participação continua máximo 12 ativos; registros de score ausentes não consomem slots da revanche. Nada toca Auth/OAuth/DB/produção. Feed usa texto React, não HTML; limits/batching G1/G2 preservados.

## PERFORMANCE

Metadados não reenviam strokes. Config/score/papel não repintam board sem mudança de boardRevision/rodada. Cursor busca no máximo 12 slots; usedWords bounded pelo banco; feed continua 40. Timers são apresentação local, sem evento de relógio a cada segundo. Game continua lazy, sem biblioteca nova. Build: chunk DrawGame 17,90 kB / gzip 6,41 kB; sem benchmark de horas/p95/WAN. Integração loopback observou guess→estado remoto em 9ms e delta de dois pontos com 261 bytes, sem board nos metadados de guess; não é SLA de produção.

Skills React/composição influenciaram derivação por papel, provider de drafts e preservação de nós/refs; agent-browser orientou QA exploratório local isolado. Nenhuma habilidade exigiu modificação de produção.

## ACCESSIBILITY

Fieldset/legend, labels explícitos de tema/espessura, aria-pressed nos presets, disabled, foco/teclado e estado textual. Opções privadas continuam mini diálogo com trap de Tab, timer e fundo inert G2. Hidden Chat não deixa controles invisíveis focáveis. Reduced motion e undo contextual mantidos. Não validado leitor de tela real ou desenho totalmente por teclado.

## TESTS

Verificação final, após todos os ajustes funcionais e visuais:

- `npm run typecheck`: passou nos workspaces.
- `npm run lint`: passou (scripts atuais usam TypeScript, não uma auditoria ESLint adicional).
- `npm run test`: backend 91 testes, 85 passaram e 6 opcionais de persistência/PostgreSQL foram pulados; frontend 29/29; service worker 4/4. Zero falhas.
- Runtime: nove regressões G1/G2 e sete novos testes G3 passaram; integração adicional de três sockets passou.
- `npm run test:e2e`: 8/8 passaram na execução final, 3,3min, incluindo G3 (58,8s), G2, RTC, mobile, Auth/House/Invite, mídia/screen e proporções Drive.
- `npm run build`: passou shared/server/web; Vite concluiu em 29,07s.
- `git diff --check`: passou; avisos locais LF→CRLF não são erros de whitespace.

Os seis skips não equivalem a aprovação de banco de produção. Não houve acesso ou modificação de produção. Simulação de 16 mil partidas e testes controlados complementam, mas não substituem, partidas humanas.

## MULTI-CLIENT

Integração de três sockets autenticados captura choices/secret/board/feed/chat, configura meta/tema sincronizados e rejeita não-coordenador, pontos pequenos/duplicata, próxima rodada e remoção de membership. E2E de três contextos completa rotações até target/revanche por UI, sem informar score pelo cliente.

## E2E

Nova sequência: Party → Hub → ingressar → host configurar 50/Animais → todos sincronizados → start → escolha privada temática → geometrias drawer/guesser → keyboard viewport → fullscreen → guesses → rodada/role switch → mensagem/draft/DOM preservados → mais de duas voltas → meta → resultado → rematch lobby → editar novamente.

Regressão G2 conserva touch/pixels, undo/eraser/clear, native editing, reconexão, máscaras/segredo e fullscreen guess; adapta expectativas da antiga fórmula/Chat visível do drawer. Regressões Party existentes incluem Auth/House/Invite/RTC/People/Queue/YouTube/Drive/screen.

## VISUAL QA

As 21 screenshots finais locais em test-results/g3-* foram abertas e inspecionadas: lobby mobile/desktop, escolha por tema, drawer/guesser 320/360/375/390/412/430, keyboard, landscape, retorno Chat, placar perto da meta, round/game result. Passagem complementar agent-browser usou fixture temporária, login sintético, Hub, ingresso e lobby readonly; notas .data/g3-visual-qa/report.md e captura adicional de desktop. Não foi atribuída ao QA exploratório a partida completa executada pelo E2E. Sessão CLI encerrada, sem conta/arquivo real.

Correções durante implementação: labels explícitos permitem localizar seletor sem incluir texto de todas as opções; lobby mobile ganhou altura para acomodar iniciar; composição compacta corrigiu canvas cortado com teclado simulado; header mostra ganho pessoal quando placar secundário é ocultado. Capturas finais confirmaram esses ajustes.

Evidência de geometria em viewport de 844px de altura:

| Largura | Canvas drawer (altura px) | Canvas guesser (altura px) |
|---:|---:|---:|
| 320 | 217,50 | 194,11 |
| 360 | 247,50 | 194,11 |
| 375 | 258,75 | 194,11 |
| 390 | 270,00 | 194,11 |
| 412 | 286,50 | 194,11 |
| 430 | 300,00 | 194,11 |

Em todas as larguras: razão 4:3, drawer > guesser por pelo menos 8%, área útil das mensagens >190px e composer dentro da viewport, sem overflow horizontal. Em 390×500 focado: mensagens >65px, canvas totalmente dentro do stage e composer dentro da altura reduzida. Teste confirma o mesmo nó do Chat antes/depois de desenhar, mensagem recebida enquanto oculto e rascunho conservado. Canvas em branco nessas capturas específicas é intencional: a sequência G3 verifica partida/layout; pintura touch/pixels/eraser/undo/clear é coberta pela regressão G2.

## KNOWN LIMITATIONS

- Jogo/feed/board/config efêmeros e single-process; restart encerra partida.
- Sem acertos a meta não chega: não inventou final por duas voltas ou limite oculto.
- Target 200 é intencionalmente bem longo; simulação não prevê habilidade/conluio de amigos.
- Ao final de um pool, há uma ou duas escolhas até esgotar, depois recicla palavras.
- Em portrait, largura física limita altura do board 4:3; não distorce para preencher tela inteira.
- YouTube visível + teclado em altura extrema exigem scroll/compromisso; não cabe tudo.
- Chat do drawer mobile está vivo mas sem controles visuais durante a vez; retornar à mídia/Hub dá acesso às ações sociais/call.
- Fullscreen guess tem composer, não histórico completo duplicado.
- Não suporta desenho só por teclado, rede offline ou persistência de rascunho após reload.
- Skips PostgreSQL não validam produção/migrations; G3 não corrige P2022.

## MANUAL_REQUIRED

1. Android Chrome/iOS Safari/PWA: keyboard real, VisualViewport/safe areas, touch/stylus, scroll de cores e troca de papel repetida; histórico/rascunho e foco após hide.
2. Rotação física durante fullscreen, orientation lock/fallback, portrait funcional e landscape sem clipping.
3. Mac físico Cmd+Z/edição nativa; leitor de tela, zoom, reduced motion.
4. Amigos em redes distintas: jogo/voz mic ON/OFF/deafen, TURN, reconnect/ausência e share físico sem recriar peers.
5. YouTube/Drive reais (OAuth/ticket/Range/ads/autoplay), uma instância e retorno no playhead correto.
6. Partidas humanas 2/3/5/8: percepção de duração, dificuldade de categorias, metas, cap do drawer, empate/revanche, sessão longa em aparelho antigo.

## FILES_CHANGED

packages/shared/src/drawGame.ts; apps/server/src/drawGame.ts, drawWords.ts, drawGame.test.ts, drawGame.integration.test.ts, drawMatch.test.ts; apps/web/src/App.tsx, main.tsx, components/MobilePartyChat.tsx, games/DrawGame.tsx, DrawCanvas.tsx, DrawScoreboard.tsx, PartyGameChat.tsx, drawingShortcut.test.ts, styles.css; e2e/party.spec.ts; scripts/draw-match-calibration.ts; docs/AGENT.MD, CLAUDE.MD e este relatório. Evidências .data/test-results são saídas locais ignoradas.

## RESPOSTAS OBRIGATÓRIAS

1. Fórmula exata: `6 + floor(4 × r) - min(2, acertos_anteriores)`, r fração restante clamp 0..1; só servidor.
2. Mínimo 4/máximo 10 por acerto válido; primeiro 6–10, segundo 5–9, demais 4–8.
3. Drawer +2 por acerto nos primeiros três, cap 6/rodada; demais +0.
4. Presets 50/100/150/200: progressão simples por duração, conferida em 16 mil simulações. Default 100/Geral.
5. Rodadas médias para 2 jogadores: 13,4/26,5/39,8/53,5; 3: 9,8/19,8/30,1/40,3; 5: 8,5/17,5/26,6/35,9; 8: 8,4/17,6/26,9/36,5 (metas crescentes).
6. Vitória é verificada depois de resolver a rodada e concluir ROUND_RESULT, antes de iniciar novo drawer.
7. Maior score vence; maiores empatados compartilham vitória server-authoritative, sem tiebreak de rede.
8. Cursor circular bounded sobre ordem inicial, pula ausentes, round aumenta por rodada real; target substitui total fixo.
9. Geral, Animais, Comidas, Natureza, Lugares e Cotidiano.
10. Quantidades: Geral 178, outras 28/28/28/28/66; união sem copiar pool.
11. UsedWords privado impede repetir desenhos até esgotar pool; perto do fim 1–2 opções, esgotou reinicia ciclo.
12. Theme/target são campos públicos do snapshot/metadados existente em reconnect/late join, não defaults locais.
13. Coordenador participante online + LOBBY + sessão/rodada/revisão exatas + schema strict; não basta disabled.
14. Drawer mobile: status/tema/meta/timer/palavra, board grande 4:3, pincel/borracha, undo/clear confirmado, espessura/cores; Chat oculto e informações secundárias fora da composição.
15. Guesser mobile: status compacto, canvas menor, lista social grande, modos/compose inferior; scoreboard pessoal no header, completo no resultado.
16. NÃO desmonta Chat para ocultar durante desenho: conserva componente/key/socket e usa hidden.
17. Mensagens seguem no snapshot/timeline montada; ao mostrar novamente estão no mesmo histórico, sem refresh.
18. Guesser → drawer aplica role/hidden e expande palco; resultado → neutral mostra Chat; próximo drawer → guesser reduz canvas e dá espaço à lista. Draft normal conservado pelo provider.
19. Usa VisualViewport/100dvh/safe areas e flex min-height:0; altura reduzida ajusta palco, lista e composer continuam acessíveis. Não há UA hack.
20. E2E mede bounding boxes em seis larguras: altura útil das mensagens, composer dentro da viewport, canvas drawer > viewer, proporção 4:3; confere identidade DOM do Chat e mensagem/draft durante troca de papel. Números finais em TESTS/VISUAL QA.
