# FF1.1 — prova visual autenticada e estudos de composição

Data: 2026-10-05. Este documento é um **gate de direção**, não implementação do FF2. Código de produção, schema, auth e deploy não foram alterados. As capturas `current` são da aplicação real em ambiente local isolado com duas contas QA sintéticas `example.test`, persistência descartável e navegador Playwright; não são capturas da produção hospedada. `pass1`/`pass2` são HTML/CSS conceitual isolado, não componentes executáveis do produto.

## Método, segurança e evidência

`e2e/ff11-visual-proof.spec.ts` iniciou servidor e Vite locais em portas aleatórias, criou duas contas por cadastro/verificação normais da API, autenticou sessões normais, criou três Casas, aceitou convites, montou uma Party e abriu superfícies atuais em 1440×900, 390×844, 320×568 e 844×390. Nenhum bypass de auth/prod, credencial real ou alteração de banco de produção. `PERSISTENCE_MODE=file` usa pasta temporária removida no fim. A mídia YouTube foi um item QA sintético; iframe externo não completou playback, então a captura demonstra shell/player em preparação, **não** vídeo reproduzindo nem sync. Call foi observada como UI; nenhuma negociação WebRTC real foi comprovada.

Níveis: `OBS-AUTH-LOCAL` = tela corrente autenticada no runtime real com dados sintéticos; `OBS-FIXTURE` = fixture/harness histórico, sem reivindicação de produção atual; `HIST` = captura antiga; `CODE` = inferência de fonte; `TARGET` = estudo de composição hipotético. Nenhum `TARGET` prova funcionalidade existente.

## Achados atuais (capturas abertas e inspecionadas)

| Superfície | Evidência atual | Veredito |
| --- | --- | --- |
| Home vazia e 3 Casas | `current/home-empty-*`, `current/home-multiple-*` | Empty state já é claro; com 3 Casas vira seletor de workspaces/cartões. FF1 era amplo demais ao chamar toda Home de dashboard. |
| Account | `current/account-*` | Formulário utilitário legível; não precisa “experience redesign”. |
| Media vazia/ativa/Ambient | `current/media-empty-*`, `current/media-active-*`, `current/media-ambient-*` | Palco desktop razoável; no mobile player e chat já integrados, refutando “sempre desconectados”. Media ativa não prova reprodução por depender do YouTube no QA. Toast de entrada cobriu centro do player móvel. |
| Chat, People, Call | `current/media-chat-*`, `current/media-people-*`, `current/call-controls-*` | Acessíveis; People tem apresentação administrativa, mas UI funcional; Call observada apenas visualmente. |
| Games Hub | `current/games-hub-*` | Box + três cards homogêneos + Now Playing + dock “Adicionar mídia” tornam a rota catálogo/Media híbrido. Em 320, só o começo da escolha cabe. |
| Draw drawer/guesser | `current/draw-drawer-*`, `current/draw-guesser-*` | Quadro existe, mas feed do jogo e Chat da Party aparecem juntos no desktop; Media dock aparece; 320 comprime a conversa; 844×390 corta quadro. |
| Quiz | `current/quiz-lobby-*`, `current/quiz-question-*` | Pergunta e alternativas legíveis; breadcrumb/chrome duplicados e Media dock persistentemente alheio. |
| Cards | `current/cards-turn-*` | Mão/turno distinguíveis; Cards é o jogo menos “dashboard”, porém chrome Media e aviso textual inadequado permanecem. Mão privada não foi testada contra outros observadores. |

## Hipóteses FF1 reavaliadas

Confirmadas: Games Hub como catálogo, Media chrome em Games, Draw com duas conversas visuais no desktop, Draw 320 comprimido e paisagem cortada, excesso de headers/bordas. Refutadas ou reduzidas: Home vazia não é gerenciador; Media mobile já integra player e chat; Account é utilitário aceitável; Quiz/Cards mantêm atividade reconhecível. Não se concluiu falha de player, sync ou WebRTC a partir de screenshot de preparação.

## Estudos, dois passes e crítica

Fonte isolada: `artifacts/frontfix/ff11/studies/study.html`; gerador: `e2e/ff11-studies.spec.ts`. Pass 1 criou e **abri visualmente** CS01–CS10 nos viewports base. Crítica: (a) Home tinha presença pequena em vasto hero, (b) Draw usava emoji que não testava a silhueta de um desenho, (c) Draw mobile deixava feed flutuando com vazio abaixo, (d) marca tinha pouco respiro, (e) Games usava emoji de plataforma, (f) Media em paisagem cortava controles. Pass 2 corrigiu com presença maior, SVG de traços no quadro, conversa ocupando espaço restante, espaçamento da marca, ilustração code-native e layout paisagem compacto. Pass 2 foi capturado e aberto novamente; 320×568 adicional mostrou quadro e composer visíveis, mas somente parte do feed — a decisão final de colapso/rolagem requer FF5/FF6 e QA em aparelho. Não foi necessário pass 3 para a **direção**, embora o layout final não esteja aprovado pixel a pixel.

| Study | Papel/viewport | Decisão de composição | Captura final |
| --- | --- | --- | --- |
| CS01 | Home desktop | Uma Casa viva dominante, demais como linhas; pessoas antes de administração | `artifacts/frontfix/ff11/studies/pass2/CS01-1440x900.png` |
| CS02 | Home mobile | Entrada imediata acima da dobra; demais Casas em scroll | `artifacts/frontfix/ff11/studies/pass2/CS02-390x844.png` |
| CS03 | Media desktop | Palco largo, social numa borda, Queue contextual | `artifacts/frontfix/ff11/studies/pass2/CS03-1440x900.png` |
| CS04 | Media mobile | Player + conversa/composer no mesmo fluxo; paisagem revisada | `artifacts/frontfix/ff11/studies/pass2/CS04-390x844.png` |
| CS05 | Games desktop | Jogo escolhido como convite, outras opções distintas, sem Media | `artifacts/frontfix/ff11/studies/pass2/CS05-1440x900.png` |
| CS06 | Games mobile | Uma escolha principal acima da dobra, outras em linhas | `artifacts/frontfix/ff11/studies/pass2/CS06-390x844.png` |
| CS07 | Draw desktop drawer | Canvas branco protagonista, ferramenta lateral, um feed | `artifacts/frontfix/ff11/studies/pass2/CS07-1440x900.png` |
| CS08 | Draw desktop guesser | Quadro + pista/tempo + composer único | `artifacts/frontfix/ff11/studies/pass2/CS08-1440x900.png` |
| CS09 | Draw mobile drawer | Quadro 4:3 + ferramenta adjacente + social subordinado | `artifacts/frontfix/ff11/studies/pass2/CS09-390x844.png` |
| CS10 | Draw mobile guesser | Quadro + feed/composer; 320×568 capturado | `artifacts/frontfix/ff11/studies/pass2/CS10-390x844.png` |

São estudos de **silhueta**. Copy, desenhos de exemplo, mensagens, pessoas, tempos e controles não são novas funcionalidades nem estado real do servidor. O mock mostra vídeo estilizado, não um embed autorizado; tokens de 9–10px e hit targets de estudos não são aprovação de acessibilidade. Os estados alvo de Quiz/Cards herdam o palco Game sem Media chrome; seu desenho detalhado pertence a FF5.

## Contrato visual de implementação FF2

FF2 pode implementar a Home CS01/02 e o shell comum das três experiências sem inventar uma direção: identidade compacta da Casa, troca Media/Games persistente, espaço do palco controlado pela experiência, borda social contextual. Remover primeiro o acoplamento **visual** (não o dado) de Now Playing/Queue/Add Media em Games, cabeçalhos repetidos e bordas recipientes sem função. Preservar estado Party/socket/call, modelos House, provider adapters, acesso a chat/People/Call, regras de jogo, erros/loading, foco e semântica. Queue e Media Hub tornam-se contextuais **somente visualmente** em FF4; chat único do Draw é fronteira FF3/FF5, não alteração de autorização de palpites. FF2 deve comparar 0/1/muitas Casas e viewport 320/390/844 paisagem/1440, teclado, rotação, safe areas e foco.

FF3 (Social), FF4 (Media), FF5 (Games), FF6 (integração) e GX4.2.3 depois de FF6 continuam na ordem prevista. FF2 não deve antecipar player/sync, WebRTC nem runtime do Draw.

## Testes de produto e limites

- **Work Software**: CS01/02 mostram encontro e atividade, não tabela de Casas; CS05/06 parecem escolha de brincadeira, não catálogo de módulos. Media é uma sessão de assistir, não um dashboard. Account é utilitário e não participa desse gate.
- **Product Screenshot / Silhouette**: identificar por recorte: Home = Casa viva/pessoas, Media = grande quadro escuro, Games = escolha ilustrada, Draw = canvas branco. Uma mesma marca, fundos graphite, mint com papel de ação, sem neon.
- **Remove the Box**: demais Casas e jogos secundários viraram linhas; palco mantém borda apenas para delimitação/interação. A borda social ainda pode ser reduzida no FF3.
- **What am I doing?**: “Entrar na Casa”, “assistir/conversar”, “escolher jogo” e “desenhar/adivinhar” aparecem sem navegar em menus.
- **Conforto/fadiga**: a direção reduz chrome e competição; conforto por horas, teclado virtual, VoiceOver/TalkBack e toque em aparelho não foram medidos — QA manual obrigatório.

## Human review package

Abrir **as dez capturas finais** da tabela CS01–CS10, nesta ordem, e comparar com as `current` correspondentes da [matriz](SCREENSHOT_MATRIX.md). São as únicas dez imagens principais; 320×568 e 844×390 ficam como anexos técnicos. Aprovação humana da **direção** ainda é necessária antes de FF2. Nenhum destes arquivos foi incorporado ao aplicativo.

## FF1.2 INTERACTION SURFACE COMPLETION (2026-10-05)

FF1.1 CS01–CS10 permanece intacto. FF1.2 acrescenta somente as superfícies de acesso que faltavam: CS11–CS24 em `artifacts/frontfix/ff12/studies/study.html`, com `pass1` e `pass2` separados e evidência autenticada do app em `artifacts/frontfix/ff12/current/`. A auditoria usou uma Casa e conta QA descartáveis, em servidor local isolado; não é prova de produção, reprodução YouTube, Drive conectado ou WebRTC real.

As decisões complementares são: **Media** expõe Fila, Adicionar e Hub próximos ao palco sem sidebar permanente; Fila é uma superfície de sessão com Now Playing e Up Next, não um gerenciador de biblioteca; **Party** mantém Call/Mic/Chat em sinal compacto, com Deafen/People/Share/Devices em camada contextual; **Games** não exibe Fila, Add Media, Hub, Now Playing ou playback; **Settings** separam Conta/identidades, Casa e dispositivos da Call. Em 390 e 320, Hub e Fila assumem a tela; não tentam exibir player, chat e controles completos simultaneamente. O teclado virtual, tamanhos finais de toque, leitores de tela e chamadas reais continuam gates de implementação/QA, não ficam aprovados por imagens estáticas.

O relatório completo, inventário de funcionalidades, crítica dos dois passes e pacote humano estão em [POST_1_0_FF1_2_INTERACTION_SURFACES_REPORT.md](../POST_1_0_FF1_2_INTERACTION_SURFACES_REPORT.md). Nenhum redesign funcional de produção foi feito nesta etapa.
