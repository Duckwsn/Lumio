# FF1 — auditoria factual da experiência

> **Nota histórica:** as lacunas de sessão privada descritas abaixo eram verdadeiras no passe FF1. FF1.1 obteve QA autenticado local e reavaliou as hipóteses em [FF1_1_VISUAL_PROOF.md](FF1_1_VISUAL_PROOF.md); não reinterpretar esta auditoria como estado corrente.

Data: 2026-10-05. Escopo: leitura e documentação, sem alteração de runtime. Evidências visuais e lacunas estão em [SCREENSHOT_MATRIX.md](SCREENSHOT_MATRIX.md). Uma captura histórica é evidência de uma regressão/risco, **não** prova de que a produção atual ainda tem a mesma aparência.

## Passada 1 — inventário observado

| Superfície | Evidência e observação | Confiança |
| --- | --- | --- |
| Landing desktop e 390×844 | Navegador nativo, produção, 2026-10-05: hero, prévia de Party, graphite/mint e hierarquia editorial visíveis. No mobile, hero e prévia ficam em sequência; aviso de versão ocupa área inferior. | Alta para estado visitante |
| Login 390×844 | Navegador nativo, produção: Google Login anunciado, mas o controle aparece como região vazia no screenshot; DOM expõe `Continuar com Google` como genérico. Pode ser carregamento/bloqueio do widget, não falha comprovada. Campos de senha permanecem. | Média; requer sessão/browser Google funcional |
| Draw 320×568, 390×844, 844×390 | `artifacts/gx422/final-review/`: quadro central, palavra/tempo acima e atividade abaixo. Em 320×568, breadcrumb/HUD e atividade comprimem palco. Em paisagem, quadro ultrapassa a altura visível da captura; precisa QA em dispositivo real. | Alta para fixture capturada, não para produção |
| Draw desktop 1440×900 | `artifacts/gx422/unified/guesser-1440x900.png`: mesa ocupa parte esquerda, `Chat da Party` vazio à direita apesar de feed da mesa dentro do jogo. | Alta para fixture; duplicação ainda plausível pelo JSX atual |
| Games Hub 1440 | `artifacts/gx3/games-1440.png`: header Party + caixa de Jogos + três cartões + Now Playing + dock. Captura é anterior e não basta para alegar aparência atual. | Histórica |
| Media 390 | `artifacts/gx3/media-390.png`: player e chat integrado, ações de social na borda do chat. Captura é anterior. | Histórica |
| Home, Media ativo, Quiz, Cards, People, Account | Código inspecionado, mas sem sessão autenticada/fixture atual em browser neste passe. **Não auditado visualmente.** | Código apenas |

## Mapa de rotas e donos atuais

`/` → Landing; `/login`, `/register` → entrada; `/app` → Home; `/account` → conta; `/house/:id/media` e `/house/:id/games` → mesmo Party socket/call/chat; `/house/:id` → alias de Media; `/invite/:token` → convite. Fonte: `docs/ENTRY_FLOW.md`, `apps/web/src/App.tsx:782-839`, `apps/web/src/party/experienceRoute.ts`.

| Dono técnico atual | Arquivos centrais | Fronteira observada |
| --- | --- | --- |
| Entrada/Home | `EntryExperience.tsx`, `HousesHome.tsx`, `LandingPage.tsx`, `AccountPage.tsx` | Home reúne Casas, presença, ações de entrada e conta. |
| Party Shell | `App.tsx`, `useHousePartyShell.ts`, `PartyStages.tsx`, `MobilePartyChat.tsx` | Navegação, chat, pessoas, call, drawer e composição de palco. |
| Media | `MediaStage.tsx`, `MediaHub.tsx`, `MediaProvider.ts`, `AmbientPresentation.ts` | Player/provider/queue/library; deve montar só em `/media`. |
| Games | `GameHub.tsx`, `GameDesignSystem.tsx`, `DrawGame.tsx`, `QuizGame.tsx`, `CardGame.tsx` | Sessão, HUD, placar, fases, controles do jogo. |

Não confundir dono dos dados com dono da UI: Queue/Now Playing são estado de mídia compartilhado da Party, mas controles visuais são de Media; Chat/Call são serviços sociais comuns, não widgets internos de Draw. Fontes: `App.tsx:810-847`, `PartyStages.tsx:19-54`, `GameHub.tsx:12-48`.

## Passada 2 — causas compartilhadas

1. **Camadas simultâneas**: header Party, navegação de experiência, Game Hub, HUD, placar, painel de chat e dock podem disputar a mesma tela (`App.tsx:810-847`, `GameHub.tsx:34-43`, `DrawGame.tsx:65-92`).
2. **Ownership visual ambíguo**: o Draw recebe um composer do Shell e também monta feed da mesa; a lateral do Shell pode continuar aberta (`App.tsx:829-847`, `DrawGame.tsx:89-92`). A captura `gx422/unified/guesser-1440x900.png` demonstra duplicação no fixture. Além disso, `Now Playing`, drawer de Fila e `Adicionar mídia` são renderizados incondicionalmente também na rota Games (`App.tsx:832-860`): dívida confirmada por código atual, embora sem screenshot autenticada atual.
3. **CSS acumulativo**: `styles.css` contém regras genéricas antigas do Draw e novas regras globais; `drawV4.css` sobrepõe a mesa via `:has`, alturas por viewport e breakpoints (`styles.css:1054-1108`, `drawV4.css:3-18,134-234`). Isso amplia risco de layout em 320 px e paisagem.
4. **Card/border como fallback**: Game Hub tem catálogo de botões-cartão dentro do palco (`GameHub.tsx:41`); Home usa House cards com status, previews e dois CTAs (`HousesHome.tsx:48-59`). Não é intrinsecamente errado; torna-se dashboard quando título, status e ação repetem a mesma informação.
5. **Metadados permanentes**: Draw mostra papel, rodada, tema/meta, score, breadcrumbs e sessão, mesmo quando a ação primária é adivinhar (`DrawGame.tsx:65-89`, `GameHub.tsx:34`). Reduzir por prioridade de fase, não ocultar informação essencial.

Fadiga potencial: excesso de contornos, muitos focos mint simultâneos, microtexto, superfícies pretas uniformes, informação periférica sempre visível e composer duplicado. Isso é diagnóstico de estrutura/código + fixtures, não um estudo de sessão longa com pessoas.

## Passada 3 — síntese e preservar

Preservar logo, Inter, graphite/mint, caráter privado, Casa/Party como conceitos, player compartilhado, rotas separadas, continuidade de chat/call, acessibilidade por foco, feed unificado de palpites/conversa, quadro claro do Draw, e distinção Google Login/Drive. Evoluir a hierarquia e o ownership visual; remover duplicação de chrome e CSS legado só em fases posteriores. Não trocar identidade por neon, skins infantis ou catálogo genérico.

## Conformidade de interface — achados verificáveis

- `HousesHome.tsx:43-61`: cabeçalho de conta mistura avatar e dois comandos; avaliar menu único/ordem de foco em FF2.
- `GameHub.tsx:34`: breadcrumb `Jogos / nome` aparece mesmo com navegação de experiência Party acima; testar redução contextual em FF5.
- `DrawGame.tsx:91`: feed com mensagens e palpites tem rótulos `Jogo`/`Chat`; diferenciar sem depender só da cor em FF5/GX4.2.3.
- `styles.css:1070` versus `drawV4.css:81-83`: touch target de cores cai de 44px genéricos para 22px; FF6 deve recuperar alvo interativo ≥44px sem sacrificar a grade visual.
- `styles.css:1-16`: tokens centrais existem, mas Draw introduz valores locais; FF2 define semântica e FF6 retira divergências legadas.

## Limites e validação

Nesta execução, não havia servidor local ouvindo nas portas 5173/4000, nem conta autenticada disponível para auditar telas privadas. O navegador hospedado foi usado só como visitante. Nenhuma afirmação de QA visual completo de Home/Party/Media/Quiz/Cards/Settings é feita. `npm run typecheck` e `npm run lint` passaram. O primeiro `npm run build` falhou por `esbuild` não conseguir ler diretório ancestral (`Acesso negado`) no sandbox; a repetição sem essa restrição passou integralmente (Vite: 1671 módulos, 20,45 s). Não houve erro de código.
