# FRONTFIX FF2–FF6 — contratos de implementação

> **FF1.1 revalidou a ordem sem iniciar FF2.** Referência visual obrigatória: [FF1_1_VISUAL_PROOF.md](FF1_1_VISUAL_PROOF.md), capturas `current` e estudos finais `pass2/CS01`–`CS10`. FF2 tem agora uma direção concreta: Home CS01/02, shell compacto de CS03/05/07, remoção de Media chrome de Games, identidade da Party/experiência em uma única barra. Estudo não é implementação nem licença para modificar contratos de runtime. FF3 cuida da borda social/único chat; FF4 do contexto Media; FF5 de Hub/Draw/Quiz/Cards; FF6 de CSS/acessibilidade/QA; GX4.2.3 continua depois de FF6. A Home vazia atual e o chat integrado no Media mobile devem ser **preservados**, não refeitos cegamente.

Pré-condição: ler Bíblia, constituição, matriz e registrar screenshots **atuais** das superfícies privadas com conta/ambiente QA. Um estágio não pode declarar concluído apenas porque código compila. Nenhum estágio deve alterar autoridade de backend, auth, game runtime, provider sync ou schema por razões estéticas.

| Fase | Entrega | Fora de escopo | Aceite/handoff |
| --- | --- | --- | --- |
| FF2 — Core/Shell/Home | Tokens semânticos; header Party compacto; seletor Media/Games; Home centrada em atividade; política de chrome; overlay base. | Redesenho profundo de Media/Draw, lógica de Casa. | Home 0/1/muitas Casas e Party em golden viewports; saída/rotas/deep links intactos; API dos slots de palco/social entregue a FF3/FF4/FF5. |
| FF3 — Social | People/presença; chat único; call e screen-share controls; drawers/sheets responsivos; estados de conexão. | Signaling novo, alteração de permissões ou feed de jogo. | Uma Party, um fluxo de chat; call persiste Media↔Games; chat útil em fullscreen; foco e teclado verificados. |
| FF4 — Media | Player protagonista; chrome em playback; Queue/Add Media/Now Playing contextual; Ambient; MediaHub; mobile Media. | Alterar semântica de sync, autoplay ou grants Drive. | YouTube/Drive respeitam capacidades, playback/reconnect/fila intactos, fullscreen/chat acessível; goldens vídeo/ambient/erro. |
| FF5 — Games | Hub como escolha; Games shell sem Media chrome; HUD por fase; score/result; mobile game base; Draw/Quiz/Cards encaixados. | Refazer regras dos três jogos; GX4.2.3; Quiz V2. | Entrar/voltar/trocar experiência sem perda de sessão; Draw sem chat duplicado; privacidade Cards; goldens lobby/ativo/resultado. |
| FF6 — integração | Consolidar CSS legado, breakpoints, toque, safe areas, teclado, PWA, motion/reduced motion, visual regression; remover duplicatas após migração. | Nova feature de jogo/mídia. | Sem seletor global legado, sem CSS órfão, QA humano móvel e gates typecheck/lint/build/test/E2E; evidência de screenshots por commit. |

## Ordem e compatibilidade

FF2 → FF3 → FF4 e FF5 (podem ter partes em paralelo após slots estabilizados) → FF6. FF4 não deve depender de CSS específico de jogo, FF5 não deve reabrir Shell. Novos primitives podem coexistir temporariamente com antigos, mas cada PR lista o seletor/componente legado a remover em FF6. Em qualquer fase, o usuário deve poder alternar Media/Games sem refazer call ou join Party; media provider só monta em Media; Queue mantém autoridade atual; screen share permanece social e visualização contextual.

Após FF6, GX4.2.3 implementa proporção/imersão/toolbar/guesser do Draw herdando slots e tokens; depois GX4.3 Quiz V2. Não antecipar essas features no FRONTFIX.

## Gate por fase

1. Capturar baseline no commit exato, incluindo 320×568, 390×844, 430×932, 844×390, 1280×720, 1440×900 e tablet quando pertinente.
2. Verificar visualmente estados vazio, carregando, ativo, erro, reconexão, overlay aberto e teclado virtual; documentar diferença intencional.
3. Rodar typecheck, lint, build, unit/integration/E2E pertinentes e `git diff --check`.
4. Revisão humana: conforto após 20–30 min, brilho/contraste em ambiente noturno, toque em aparelho com notch, leitor de tela/teclado, rotação, fullscreen, fala/call real, latência.
5. Aplicar testes: “o que estou fazendo?”, “remove the box”, “por que sempre visível?”, “isso poderia ser software de trabalho?”; reprovar resposta ambígua.

Risco principal: mudar composição visual e acidentalmente desmontar provider/call ou duplicar chat/estado. Mitigação: separar slots de apresentação de hooks de sessão, testes de lifecycle e golden screenshots por fase. Risco secundário: snapshots antigos tratados como estado atual; cada PR deve produzir capturas novas.
