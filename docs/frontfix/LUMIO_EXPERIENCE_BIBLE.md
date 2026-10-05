# Lumio Experience Bible — FF1

> **Validação FF1.1:** tese e camadas mantidas, agora testadas com capturas autenticadas locais. A Home sem Casas já responde bem à decisão inicial; o alvo CS01/02 aplica-se principalmente à Home com várias Casas. O mobile Media já tem player/chat integrados — FF4 deve lapidar, não reconstruir por suposição. Games Hub e Draw confirmaram visualmente o chrome de mídia e a duplicação social. Ver [prova](FF1_1_VISUAL_PROOF.md) e [matriz](SCREENSHOT_MATRIX.md). Nenhuma nova regra constitucional foi acrescentada: as 32 regras existentes cobrem os achados.

Status: direção de produto para FF2–FF6, **não** especificação de pixel nem autorização para mudar contratos de runtime. Base factual e confiança: [auditoria](FF1_VISUAL_AUDIT.md) e [matriz](SCREENSHOT_MATRIX.md). Tese única: **Lumio é um lugar de encontro privado em que a atividade compartilhada ocupa o palco e as pessoas permanecem próximas sem disputar o palco.**

## 1. Product Experience Thesis

Entrar numa Casa deve parecer chegar à turma; abrir Media, assistir/ouvir; abrir Games, jogar. A tela responde em 3 segundos à pergunta “o que estamos fazendo juntos?”. O objeto em ação — player, quadro, pergunta ou cartas — recebe a maior área e contraste, enquanto o contexto social recua sem desaparecer.

## 2. Lumio Personality

Calmo, próximo, noturno, generoso, competente. Ritmo de sala de estar, não painel de gestão. Delight vem de transições de reunião e reações da turma, não de animação contínua.

## 3. Lumio Is / Lumio Is Not

É Casa persistente + Party ao vivo + experiências de mídia/jogo. Não é SaaS de grupos, clone de streaming, Discord, skin gamer neon ou jogo infantil. Graphite, mint, Inter e logo existentes continuam; isto é organização de experiência, não rebranding. Evitar layouts e arte que reproduzam marcas de terceiros.

## 4. Activity-First Principle

Primeiro mostrar o que se faz; segundo, quem está junto; terceiro, configurações. Exemplo ruim: `Party > Games > Draw > status + card + painel + quadro pequeno`; melhor: quadro/ação da rodada como palco, status da rodada junto dele, social em borda contextual. Em Home, atividade da Casa precede contadores administrativos.

## 5. Core / Social / Experience model

| Camada | Possui | Não possui |
| --- | --- | --- |
| Lumio Core | marca, tokens, navegação entre Casa/experiências, foco/feedback/overlay base | controles de player ou placar |
| Social Shell | presença, People, chat, call, screen share, convite, lifecycle da Party | Queue e ferramentas de jogo |
| Experience: Media | palco/player, Now Playing, Queue, Add Media, Ambient, Library/Hub | identidade de conta e call signaling |
| Experience: Games | Hub, fase, HUD, placar, ferramentas Draw/Quiz/Cards | provider de mídia, Queue |
| Utility | conta, segurança, Drive conectado, configurações | chrome permanente no palco |

O dado de Queue pertence à Party/media compartilhada; sua representação pertence a Media. Chat/call persistem ao alternar Media↔Games, sem remount do socket nem da call (contrato GX2/GX3). Screen Share é social na origem, palco selecionável na experiência.

## 6. Surface model

Quatro superfícies semânticas: `stage` (atividade), `edge` (ações/presença próxima), `layer` (sheet/drawer temporário), `utility` (configuração). A cor de fundo e espaçamento podem separar grupos sem cartão/borda. Palco tem maior área e contraste; edge não deve virar segunda aplicação.

## 7. Card policy

Card só quando representa objeto delimitado e acionável (Casa, jogo no Hub, item de biblioteca). Nunca card genérico envolvendo palco, depois outro card envolvendo player/quadro. Teste “remove the box”: se retirar fundo/borda/radius e só espaçamento bastar, remover. No Hub, tiles devem parecer escolhas de noite, não KPIs.

## 8. Chrome policy

Permanentes: identidade mínima da Casa, alternância Media/Games, saída/contexto e affordance social compacta. Contextuais: Queue/Add Media/Now Playing no Media; placar e fase no Games; call controls sob menu/estado ativo; detalhes de membros em sheet/drawer. Em playback/timer, esconder controles secundários até foco/hover/toque; nunca ocultar ação crítica, erro ou foco. Budget móvel: uma barra de topo compacta + palco + um acesso social/composer; no 320×568, nenhum segundo header permanente dentro da experiência ativa.

## 9. Typography

Inter continua. Escala funcional: título de experiência, título/ação de fase, corpo, metadado. Não acumular três títulos para o mesmo lugar. Metadado mínimo com legibilidade; evitar 9–10px nas interações. Números de tempo/placar tabulares.

## 10. Color

Graphite base, mint como ação/estado vivo, neutros quentes para profundidade; warning/danger reservados ao significado. Papel claro do Draw é objeto de atividade, não mudança de marca. Mint não deve acender simultaneamente bordas, texto, botões e progresso sem hierarquia.

## 11. Depth

Profundidade por contraste tonal e oclusão. Borda onde delimita clique, palco, foco ou overlay; não em cada bloco. Radius: objeto tocável/overlay, não cada subdivisão. Uma camada elevada por vez.

## 12. Iconography

Ícone com rótulo em ações ambíguas; tooltips e nome acessível em controles compactos. Evitar ícones de Media no palco Games. Não usar cor isolada para significado.

## 13. Controls

Primário = uma ação da fase (entrar, play, responder, desenhar, jogar carta). Secundário = opção próxima. Terciário = menu/contexto. Controles por capacidade real do provider; nunca oferecer qualidade/rate se adapter não suporta. Estados disabled com razão perceptível. No mobile, alvo de toque ≥44×44 mesmo se swatch visual tiver 22px.

## 14. Drawers/Sheets/Dialogs

Sheet: escolha breve (Queue, People, ferramentas, convidar). Drawer: navegação/inspeção que precisa coexistir com palco em desktop; no mobile, parcial e fechável, sem encobrir composer ativo. Dialog: confirmação destrutiva ou decisão bloqueante, com foco contido e retorno ao gatilho. Não modalizar chat normal.

## 15. Motion

Transição curta orienta mudança de experiência/fase e feedback de acerto; não anima molduras constantemente. Nenhum autoplay visual competindo com vídeo/desenho. `prefers-reduced-motion` desativa movimento não essencial, preservando feedback por texto/ícone.

## 16. Feedback

Conexão/reconexão, buffer, erro provider, perto do palpite, acerto, vez, call e screen share têm estados distintos. Feedback local não deve sobrepor feed ou cobrir controles. Qualquer toast de atualização PWA deve evitar o palco móvel e ser dispensável quando não urgente.

## 17. Social Presence

Mostrar quem está junto e, se relevante, quem fala; não transformar pessoas em painel de métricas. People abre contexto detalhado. Chat é linha temporal compartilhada; no Draw, palpites e conversa entram no mesmo feed com tipo/autor/tempo, mantendo regra de segredo e proximidade sem expor a resposta.

## 18. Home

Atual: `header → Suas Casas → cards/status/duas ações → ações globais` (`HousesHome.tsx:43-61`). Alvo: `saudação discreta → Casa(s) com atividade presente como primeiro sinal → entrar na atividade → criar/convite em segundo plano`. Em Casa vazia, convite/criação viram decisão primária simples. Não inventar feed social além do estado autorizado existente.

## 19. Party Shell

Atual: `header + seletor → palco → dock/drawer + possíveis cabeçalhos internos`. Alvo: `identidade/selector compactos → palco dono da experiência → social edge contextual`. Trocar Media/Games preserva Party, chat e call; saída explícita libera recursos, não cancela membership. Sidebar permanente só se uma tarefa simultânea justificar em desktop; default é recolhida/contextual.

## 20. Media

Atual: player + `Now Playing`/Queue/MediaHub/dock podem competir. Alvo: player domina vídeo; metadado e ações aparecem quando solicitados, Queue em sheet/drawer; Ambient usa arte/ambiente e música sem controles de vídeo que não façam sentido. Ao tocar, chrome não essencial recua; teclado/foco e controles explícitos continuam. Fullscreen de vídeo não corta acesso seguro ao chat/call: uma affordance social discreta reabre a camada, respeitando sandbox do iframe.

## 21. Games

Hub é convite a escolher, não catálogo de software. Jogo ativo ocupa palco sem breadcrumb + título + status triplicados. Social continua por edge, não por widget de mídia. Cada jogo usa mesma linguagem de fase, foco, resultado e feedback, mas palco próprio.

## 22. Draw

Palco = quadro, palavra/pista, tempo e ferramenta/entrada de palpite conforme papel. Drawer tem ferramentas perto do quadro; guesser tem composer/feed sem segunda caixa de chat. Placar é sob demanda, exceto mudança de posição/acerto; nunca esconder vez/tempo. Regra exata de drawer/guesser e mobile imersivo é GX4.2.3, após FF6; FF5 estabelece fundação, não refaz a mecânica.

## 23. Quiz

Pergunta e opções dominam. Timer/progresso são suporte; placar/resultados entram na transição. Desacoplar card genérico de layout do Draw. Quiz V2 (GX4.3) só após GX4.2.3.

## 24. Cards

Mesa, mão privada e vez dominam. Privacidade de cartas é contrato: jamais mostrar mão alheia em overlay social, screenshot fixture público ou acessibilidade indevida. Ações de turno claras, latência/reconexão sem duplicar jogada.

## 25. Utility UI

Conta, settings, Drive e segurança podem usar formulários/painéis convencionais porque a tarefa é configurar. Não levar seu visual de formulário para Media/Games. Google Login e autorização Drive permanecem separadas.

## 26. Desktop

Palco cresce primeiro. Edge social pode abrir sem reduzir palco abaixo do tamanho útil; se reduzir, vira overlay temporário. A 1280×720, evitar header + dock + painel sempre expostos.

## 27. Mobile

Composição própria, não desktop comprimido: media portrait mantém player + composer; Games privilegia atividade, social por sheet/edge. Teclado virtual usa `visualViewport`/`dvh` e composer ancorado sem cobrir conteúdo; scroll do feed preserva leitura. Em 320 px, texto/ações não dependem de ícones minúsculos. Landscape é modo imersivo de fullscreen móvel, especialmente Draw.

## 28. Tablet

Nem mobile esticado nem desktop reduzido: palco central, edge opcional, sheets com largura limitada. Testar toque sem hover.

## 29. PWA

Standalone aproveita altura extra, mas mantém safe areas e deep links; sem promessa offline para Party autenticada. Install CTA depende do navegador; fallback instrui onde achar o comando. Atualização não interrompe call/jogo.

## 30. Accessibility

Navegação por teclado, foco visível, ordem DOM compatível com visual, `aria-live` seletivo para fase/erro, contraste testado em mint/texto secundário, labels em ícones, reduced motion, targets ≥44px. Não esconder foco quando controls auto-hide. Feed de chat/jogo não deve anunciar cada caractere ou floodar leitor de tela.

## 31. Performance

Manter lazy routes/jogos, media provider só em Media, continuidade socket/call, evitar novo polling/iframe/remount durante troca visual. Animação não deve fazer layout thrash; imagens e glows não dominam GPU em sessões de horas.

## 32. Microcopy

Humano, curto, específico: “Aguardando Duda escolher” > “Estado de seleção”; “Voltar aos jogos” quando realmente volta ao Hub. Não chamar Media de “mídia” em todo título visível; experiência principal pode nomear vídeo/música concreta. Distinguir sair do jogo, Party, Casa e conta.

## 33. Anti-patterns

Não aninhar cards, não criar dashboard de presença, não repetir breadcrumbs, não manter barra de ferramentas sem uso, não copiar marca alheia, não usar microtexto para caber tudo, não disfarçar estado desabilitado, não esconder funções essenciais atrás de hover, não misturar controles Media no Games. Se uma tela de entretenimento pudesse ser app de trabalho trocando logo, rever.

## 34. Review checklist

1. Em 3 segundos, qual é a atividade? Ela domina a screenshot?
2. Quem está junto é perceptível sem competir? A troca Media/Games mantém chat/call?
3. Cada controle permanente passa “por que sempre visível?”; cada cartão passa “remove the box”?
4. Há título/estado/ação duplicados? Media aparece em Games? Feed de Draw duplica chat?
5. 320×568, 390×844, 844×390, 1280×720 e 1440×900 preservam palco, teclado, safe area e foco?
6. Contraste, toque, teclado, reader, reduced motion e latência/reconexão foram testados?
7. Estilo ainda parece Lumio sem logo? Media e Games são diferentes sem parecer apps separados?

## Antes → depois: arquitetura de informação

```text
HOME:  header/conta → título → cards (status, pessoas, CTAs) → ações
   →   chegada → Casa viva (atividade/pessoas) → entrar → criar/convite
MEDIA: header + dock → player → now playing + fila + chat permanente
   →   player/ambiente → social edge → fila/biblioteca por intenção
GAMES: header Party → game nav → catálogo/card → now playing/dock
   →   escolha de jogo → palco do jogo → social edge
DRAW:  breadcrumb → HUD → placar/rail + quadro → feed + chat lateral
   →   pista/tempo + quadro → palpite/conversa únicos → placar sob demanda
CHAT:  dock + drawer + feed local do Draw
   →   um fluxo Party, apresentado contextual à experiência
PEOPLE: contador + dock + drawer
   →   sinal compacto de presença → sheet/drawer com detalhe
```

## Matriz permanente/contextual

| Elemento | Home | Media ativo | Games Hub | Jogo ativo |
| --- | --- | --- | --- | --- |
| Casa/saída | contexto | compacto | compacto | compacto/overlay |
| Seletor Media/Games | não | topo compacto | topo compacto | acessível, discreto |
| People/Chat/Call | sinais | edge/composer | edge | edge/composer adaptado |
| Queue/Add Media/Now Playing | não | contextual | não | não |
| Game phase/score/tools | não | não | apenas escolha | contextual por jogo |

## Decision log

| Decisão | Evidência | Alternativa rejeitada | Fases |
| --- | --- | --- | --- |
| Três camadas Core/Social/Experience | `App.tsx:810-847`, GX2/GX3, screenshot Draw desktop | Um shell universal com todos os controles | FF2–FF5 |
| Activity-first e chrome contextual | Draw mobile e Game Hub histórico, código atual | Painel permanente de cada domínio | FF2–FF6 |
| Feed único no Draw | `DrawGame.tsx:89-92`, fixture desktop | Chat e palpites em painéis separados | FF3/FF5/GX4.2.3 |
| Preservar graphite/mint/Inter/logo | Landing observada, `styles.css:1-6` | Rebranding completo | todas |
| Migração incremental | CSS legado + escopo Draw sobreposto | Big-bang de CSS/JSX | FF2–FF6 |

## Sequência de migração e contratos

FF2 estabelece tokens semânticos, shell e Home; FF3 move social para edge/sheets sem alterar signaling; FF4 compõe Media; FF5 compõe Games; FF6 consolida responsividade, CSS legado, acessibilidade e regressão. Primitivos novos podem coexistir temporariamente com antigos, com inventário de remoção por fase; no fim não há duplicatas ativas. Preservar invariantes: auth/deep link, party lifecycle, Queue/history, provider sync, call, presence, jogos, privacidade. GX4.2.3 herda palco/edge/tokens e trata Draw; GX4.3 vem depois.

## Perguntas em aberto

Nenhuma decisão humana bloqueia a direção. Testes com pessoas e sessão autenticada são necessários antes de afirmar que todos os problemas visuais descritos em artefatos históricos permanecem. Ajustes finos de ritmo, escala e motion devem acontecer nas fases de implementação, dentro desta constituição.

## FF1.2 — regras de acesso e camadas contextuais

- **Media action access:** Fila e Adicionar são secundários identificáveis junto ao palco; Hub é o lugar de busca, biblioteca, playlists, histórico e Drive. Não manter Fila como sidebar obrigatória nem transformar Hub em CMS. A adição é `abrir → escolher → + Fila`; tocar agora permanece ação distinta e autorizada.
- **Social control cluster:** Call/Mic/Chat são sinais compactos da Party, independentes de Media e Games. Estado textual acompanha ícones: Call OFF, conectada/Mic OFF, Mic ON e áudio mutado (deafen). People, Share e dispositivos aparecem na camada social contextual. Permissão de mic negada nunca parece transmissão ativa.
- **Contextual surfaces:** Fila desktop é drawer temporário sem perder a leitura do player; Hub/Add são camadas dentro da Party. Em mobile ocupam a tela para priorizar busca, teclado, lista e ações; fechar retorna ao palco. Não empilhar player inteiro, fila inteira e chat inteiro em 320.
- **Settings entry:** Conta e vinculação Google ficam na identidade do usuário; Call/devices e volumes ficam na Party. Deve haver uma entrada rotulada — não apenas engrenagem críptica — via menu do usuário/Party. Drive é uma conexão de dados separada do Google Login.
- **Ownership invariant:** Queue/Add/Hub/Now Playing/playback só em Media. Chat/People/Call/Mic/Deafen/Share onde aplicável são Party-scoped e convivem com Games/Draw sem virar dock universal. Game HUD, pincéis, timer e palpites pertencem ao jogo.

Estas regras descrevem estudos `TARGET` FF1.2; a implementação FF2–FF6 deve manter permissões, estados, semântica, foco, safe areas e funcionalidades reais. Aprovação visual final é humana.
