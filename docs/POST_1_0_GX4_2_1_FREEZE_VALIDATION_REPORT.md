# Lumio — GX4.2.1 Freeze Validation & Stress QA

## Escopo e base

Revisão local do Draw V4, sem commit, push ou deploy. Este relatório complementa o registro histórico de GX4.2, cujo veredito anterior era `REQUIRES REVISION`. Não houve alteração de scoring, word bank, temas, targets, `game:action`, wire format dos strokes, batching, reconexão, drawer grace, arquitetura da Party, Call, semântica do Chat, Share, Media, Queue, Viewer Registry, Quiz ou Cards. Não houve dependência nem migration nova.

O teste visual usa `apps/web/qa/draw-freeze.html` e `draw-freeze.tsx`, uma fixture somente de desenvolvimento que renderiza o componente real com dados sintéticos. Não é importada pela entrada de produção. Não serve como prova de sincronização multiusuário; para isso, há o E2E G2 de três clientes e os testes de projeção do servidor.

## Defeito visual encontrado e correção mínima

Com 12 jogadores na fixture mobile, o controle `Placar · N jogadores` não aparecia para drawer nem guesser. A inspeção do estilo computado mostrou que seletores herdados de `styles.css` ocultavam `.draw-bottom`, prevalecendo sobre a regra do Draw V4. A correção foi restrita a três seletores em `apps/web/src/games/drawV4.css`, que restauram `display: contents` apenas para o Draw mobile nos papéis correspondentes. Antes, a asserção de visibilidade da fixture falhava; depois, o placar abriu e a última linha ficou alcançável por rolagem. As capturas finais de 12 jogadores e de 320×568 foram reabertas. Nenhuma regra de jogo foi alterada.

## Validação automatizada e visual

Privacidade: o E2E G2 lê a palavra escolhida apenas na sessão do drawer e verifica nas sessões de guesser e espectador `textContent`, valores de controles, todos os atributos DOM (inclusive `data-*`, `title`, `aria-label` e `aria-description`), texto resolvido de `aria-describedby`, snapshot de acessibilidade, `localStorage`, `sessionStorage` e mensagens de console/pageerror capturadas pelo harness. A comparação é feita também contra as outras opções privadas; o relatório do teste expõe apenas booleanos, não o segredo. O teste de integração de três sockets afirma que o drawer recebe `secretWord`, os demais recebem `maskedWord` sem `secretWord` ou `choices`, e que o snapshot público serializado não inclui o segredo.

Estresse: fixture de 12 pessoas com drawer, guessed, waiting e offline; nomes `Alexandre de Albuquerque` e `JogadorComUmNomeMuitoGrande`; scores 0, 2, 48, 100, 198 e 205. No desktop e no mobile, o placar tem 12 linhas e a última é alcançável por scroll. O truncamento é apenas visual: o nome completo permanece no texto/árvore acessível. Marcadores `Desenha` e `Acertou ✓` e rótulos de score foram assertados. O Game Result foi capturado com 205 pontos. Foram abertas as capturas `gx421-12-desktop-drawer.png`, `gx421-12-desktop-score-bottom.png`, `gx421-12-desktop-guesser.png`, `gx421-12-mobile-before-score.png`, `gx421-12-mobile-drawer.png`, `gx421-12-mobile-score-bottom.png`, `gx421-12-mobile-guesser.png`, `gx421-score-result-desktop.png` e `gx421-score-result-mobile.png` em `test-results/`.

Timer: fixture a 5 s e comparação geométrica com 11 s. O contraste computado do texto crítico contra o fundo testado excedeu 4,5:1; posição do canvas e altura do HUD não mudaram. Captura em `gx421-12-desktop-drawer.png`; a variante com `prefers-reduced-motion: reduce` em `gx421-critical-reduced-motion.png` confirmou timer visível e animação `none` no diálogo. A informação crítica é textual, não dependente de movimento.

Zoom: viewport CSS de 640×450 como equivalente de reflow a 200% de 1280×900; verificados drawer, guesser, toolbar, palavra/pista, timer, composer real e word choice, sem overflow horizontal destrutivo. Capturas `gx421-zoom200-drawer-DRAWING.png`, `gx421-zoom200-guesser-DRAWING.png`, `gx421-zoom200-drawer-CHOOSING_WORD.png`, `gx421-zoom200-real-word-choice.png` e `gx421-zoom200-real-guesser.png`. O campo de palpite simplificado da fixture não representa o composer de produção e quebra seu próprio texto estreito; o parecer sobre composer se baseia na captura do cliente real, que mantém campo e envio acessíveis. É estratégia de emulação de viewport, não teste de zoom físico de todos os navegadores.

Pointer: CDP emula dois pontos de toque simultâneos e `touchCancel`. O segundo toque não produz pixel/stroke fantasma; o cancelamento fecha o stroke em andamento; um novo toque desenha novamente e a imagem converge nos três clientes. Não se afirma rejeição sofisticada da palma ou teste de caneta real.

320×568: depois da última regra CSS, o G3 real de três clientes recapturou `gx42-drawer-320x568.png` e `gx42-guesser-320x568.png`; ambas foram abertas. O drawer mantém canvas, HUD, palavra, paleta, toolbar e saída; o guesser mantém canvas, pista, chat, composer e saída. A fixture de 12 jogadores também recapturou `gx421-12-drawer-320x568.png` e verificou que palavra e botão do placar não se sobrepõem.

## Banco de dados e gates finais

Docker Desktop foi ativado durante a revisão. O banco de desenvolvimento existente, `infra-postgres-1` em 127.0.0.1:5433, não foi tocado. Para os testes condicionais, foi criado PostgreSQL 16-alpine descartável `lumio-gx421-qa-postgres`, apenas em 127.0.0.1:55432, banco `lumio_test`; as quatro migrations existentes foram aplicadas **somente** nesse banco isolado por `migrate deploy`. `npm test` recebeu `LUMIO_TEST_DATABASE_URL` apontando para ele. Depois dos testes, apenas esse contêiner de QA foi parado e removido; o banco de desenvolvimento continuou ativo. Não houve acesso a banco de produção, `db push`, reset, exclusão de dados ou mudança de schema.

No estado final do código: `npm run typecheck` passou; `npm run lint` passou; `npm run build` passou. `npm test` passou: servidor 141 aprovados/1 skip opt-in de boot compilado, web 35/35, service worker 4/4, total 180 testes, 179 aprovados, 1 skip, nenhuma falha. `npm run test:e2e` teve uma primeira passagem com 16/17: timeout de 120 s no cenário de chat/player móvel, durante reconexão de ambiente. Esse caso passou isoladamente em 47,1 s **sem alteração de código**. A suíte inteira foi então repetida e passou **17/17 em 6,6 min** depois da última alteração de CSS/testes. A primeira falha intermitente permanece registrada, sem ser mascarada. `git diff --check`: sem erros; apenas avisos de conversão LF/CRLF do Git no Windows.

## Respostas explícitas às 27 perguntas

1. **SecretWord foi procurada em todo DOM relevante?** Sim, nos dois clientes não autorizados, incluindo texto, inputs, atributos e snapshot acessível.
2. **Algum atributo não autorizado continha secret?** Não no cenário instrumentado.
3. **Accessible names foram auditados?** Sim, via snapshot da árvore acessível, além de rótulos/descrições DOM.
4. **localStorage contém secret?** Não no cenário instrumentado.
5. **sessionStorage contém secret?** Não no cenário instrumentado.
6. **Logs capturados continham secret?** Não nas mensagens de console/pageerror observadas pelo harness.
7. **Word choices continuam exclusivas do drawer?** Sim, nas projeções reais e na interface.
8. **Fixture de 12 participantes foi executada?** Sim, desktop e mobile, papéis drawer e guesser.
9. **Quais screenshots de 12 participantes foram abertas?** As nove capturas desktop/mobile de placar, papéis e resultado listadas acima, além de `gx421-12-drawer-320x568.png`.
10. **Nomes longos quebraram alguma superfície?** Não nas capturas inspecionadas; truncamento visual preserva nome completo no DOM acessível.
11. **Score extremo foi testado?** Sim: 0, 2, 48, 100, 198 e 205 no placar e 205 no resultado.
12. **Timer crítico foi capturado?** Sim, a 5 s, com contraste e geometria verificados.
13. **Reduced motion crítico foi testado?** Sim, timer textual permanece e animação do diálogo é `none`.
14. **Zoom 200% foi testado?** Sim, por viewport CSS equivalente de 640×450, com papéis e controles reais/fixture.
15. **Pointercancel recebeu teste dedicado?** Sim, `touchCancel` via CDP, seguido de novo stroke.
16. **Multi-touch recebeu teste dedicado?** Sim, segundo contato simultâneo sem marca fantasma.
17. **320×568 foi recapturado após a regra CSS final?** Sim, no G3 real e na fixture.
18. **Drawer 320×568 ficou utilizável?** Sim na emulação, com os controles pedidos presentes.
19. **Guesser 320×568 ficou utilizável?** Sim na emulação, inclusive composer e saída.
20. **A suíte E2E COMPLETA foi executada depois da última alteração?** Sim, duas passagens; a segunda foi 17/17.
21. **Resultado final do npm test?** 179 aprovados, 1 skip opt-in, 0 falhas, com PostgreSQL isolado.
22. **Resultado final E2E?** 17/17; primeira passagem teve um timeout intermitente em cenário móvel, seguida de passagem isolada e completa verdes.
23. **Typecheck/lint/build/diff-check passaram?** Sim.
24. **Houve mudança de runtime/protocolo?** Não nesta revisão; apenas CSS, fixture e testes.
25. **Houve dependency?** Não.
26. **Houve migration?** Nenhuma nova; quatro migrations existentes foram aplicadas somente no banco descartável de teste.
27. **Quais itens continuam exclusivamente como QA físico/manual?** `MANUAL_QA_REQUIRED`: iPhone Safari físico, Android Chrome físico, stylus e pressão reais, notch real, teclado virtual real, VoiceOver, TalkBack e WAN real. Nenhum deles é declarado validado.

GX4.2 READY TO FREEZE — GX4.3 READY
