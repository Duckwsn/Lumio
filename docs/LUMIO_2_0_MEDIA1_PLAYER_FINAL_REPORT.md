# Lumio 2.0 — MEDIA1 — UniversalPlayer finalization

## 1. STATUS

Implementação local concluída. A repetição E2E completa passou 16/16; a validação de providers reais permanece um gate separado (seções 35, 40 e 46).

## 2. PRODUCT_SCOPE

O produto atual é Casa → Party → Media + Social + Call. MEDIA1 atuou somente no pipeline de player, integração de mídia e estados operacionais. Não iniciou MEDIA2, SYNC1 ou SEC2.

## 3. FF3_1_FROZEN_ACKNOWLEDGEMENT

Composição FF3.1 aprovada preservada: no mobile, Player e Chat continuam juntos, com Chat fixo, microfone no composer e People/Queue/Add Media no cabeçalho. As mudanças visuais ficaram limitadas a erro, buffering e disponibilidade real de controles.

## 4. UX1_BASELINE

UX1 registrava gates verdes, mas uma ocorrência intermitente de posição remota 0 no cenário M1. Relatórios antigos GX3/FF3.1 ainda citam Games; o código LX0/UX1 atual prevalece.

## 5. WORKTREE

O checkout estava limpo antes da edição (`git status --short`, `git diff`, `git diff --stat`). Não houve commit, push, deploy, migração, alteração de credenciais ou OAuth. As únicas alterações de código são as listadas na seção 47. Capturas históricas regravadas automaticamente por E2E não fazem parte da entrega e devem permanecer iguais a HEAD.

## 6. FILES_READ

Foram lidos `docs/AGENT.MD`, `docs/CLAUDE.MD`, `docs/MEDIA_HUB.md`, relatórios M1/M2/M3/GX3/FF3.1/LX0/UX1, implementação de `MediaStage`, `MediaProvider`, `App`, `MediaHub`, store/Drive backend, registro de viewers e testes associados. Código atual foi tratado como fonte de verdade.

## 7. PRE_CHANGE_TESTS

Antes das mudanças: `typecheck`, `lint`, `build`, `npm test` e `git diff --check` passaram. `npm run test:e2e` passou 15/16: o processo do worker FF1.1 saiu inesperadamente com código Windows `3221226505`, antes da asserção; o mesmo teste passou isolado. M1 passou no baseline e em oito repetições controladas. Isso não demonstra a causa da intermitência histórica.

## 8. PLAYER_ARCHITECTURE

`App.tsx` consome snapshot autoritativo (`mediaId`, `revision`, `operationId`) e envia comandos; `MediaStage.tsx` preserva a superfície visual e gera o controller; `MediaProvider.ts` contém adapters YouTube IFrame e Drive/HTMLMediaElement. Servidor gerencia posição, duração, fila, grants e streams. Volume/mute são locais. Os callbacks do adapter passam por guarda de geração/identidade, e o mesmo Stage permanece montado ao abrir painéis sociais. O iframe YouTube agora recebe `src` apenas ao montar: não há recarregamento React externo ao adapter na troca de `mediaId`.

## 9. PROVIDER_CAPABILITY_MATRIX

Status abaixo descreve suporte **no código/API**; não representa teste real de conta/arquivo.

| Capacidade | YouTube | Drive |
|---|---|---|
| Play/Pause | SUPPORTED | SUPPORTED, condicionado a formato/permissão |
| Seek | SUPPORTED | SUPPORTED, condicionado a metadata/Range |
| Volume/Mute | SUPPORTED | SUPPORTED |
| Playback rate | PARTIALLY SUPPORTED; rates dinâmicos/sugestão | SUPPORTED pelo elemento nativo, se browser aceitar |
| Quality | NOT SUPPORTED manualmente | NOT SUPPORTED; não há variantes/transcoding |
| Captions | PROVIDER LIMITED; sem seletor Lumio | NOT SUPPORTED na UI atual |
| Fullscreen | PARTIALLY SUPPORTED; política do browser | PARTIALLY SUPPORTED; política do browser |
| Duration/current time | SUPPORTED; duration pode vir tarde | SUPPORTED quando metadata chega |
| Ended/error | SUPPORTED com guards | SUPPORTED pelo elemento nativo |
| Retry | PARTIALLY SUPPORTED conforme erro | PARTIALLY SUPPORTED; ticket uma vez para falha de rede |
| Autoplay | PROVIDER LIMITED por gesto/política | PROVIDER LIMITED por gesto/política |

## 10. YOUTUBE

Mantida a [YouTube IFrame Player API oficial](https://developers.google.com/youtube/iframe_api_reference), sem extração de stream. Loader agora falha explicitamente em erro de script ou timeout de 15 s e permite tentativa posterior. Erros 2/5/100/101/150/153 têm mensagens seguras; 153 indica ausência de identificação de cliente/referrer, sem diagnosticar credenciais por adivinhação. A disponibilidade de rates é atualizada quando o provider fica pronto/muda estado. A [documentação de revisão do IFrame](https://developers.google.com/youtube/iframe_api_revision_history) não oferece controle manual confiável de qualidade; nenhum seletor fictício foi criado.

## 11. GOOGLE_DRIVE

Fluxo existente: autorização por conta → descoberta de pasta/arquivo → referência → grant e ticket → elemento nativo. Descoberta agora inclui MIME de áudio comuns (`audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/webm`, `audio/wav`) além de vídeo. `type: audio` chega ao Hub/Player, mas MIME não garante codec reproduzível: `canPlayType`/browser e testes reais ainda são necessários. Vault de token, conta proprietária, membership e expiração permanecem.

## 12. DRIVE_RANGE

POST de reprodução exige sessão, membership, grant do proprietário e mídia listada; emite ticket curto (5 min) e cookie HttpOnly com escopo do ticket. GET/HEAD valida nonce, membership e arquivo. Proxy encaminha Range ao Google `alt=media`, aceita 200/206/416 e repassa `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`; HEAD preserva total quando upstream responde 206. Há `no-store`, limite de streams concorrentes por viewer e abort em desconexão/revogação. Testes locais de Range/grant passam; upstream Drive real não foi medido nesta fase. Não houve `db push`, schema, migração ou afrouxamento de acesso.

## 13. PLAYER_STATE_MACHINE

O controller existente continua único. UI distingue idle/loading/ready/playing/paused/buffering/ended/autoplay blocked/error. Erro de adapter agora atualiza estado de provider e a superfície de erro; buffering superior a 15 s expõe saída recuperável em vez de spinner indefinido. Não foi criada máquina paralela.

## 14. PLAY_PAUSE

Os comandos continuam autoritativos por `mediaId`/`revision`/`operationId`. Testes existentes cobrem início, pausa, retomada e convergence multiusuário. Rejeição de autoplay mantém ação explícita. Nenhuma mudança de protocolo foi feita.

## 15. SEEK

Seek mantém bounds para duração conhecida. Quando duration é 0/desconhecida, posição não é mais forçada a 0 no cliente ou servidor; a duração visual é `--:--`, não um valor inventado. Testes unitários cobrem seek/posição efetiva desconhecida. Seek real em Drive depende de suporte Range/codec do arquivo.

## 16. VOLUME_MUTE

Permanecem locais ao cliente e separados de Call Deafen. Retry preserva volume/mute do controller; troca de provider não envia esses ajustes ao servidor. O navegador ainda pode bloquear autoplay com áudio.

## 17. PLAYBACK_RATE

YouTube usa `getAvailablePlaybackRates()` quando disponível e atualiza a lista após eventos; `setPlaybackRate` é sugestão, não garantia. Drive usa `playbackRate` nativo. A UI não assume que 0.5×/1.25×/1.5×/2× estejam sempre disponíveis no YouTube.

## 18. QUALITY

Não há controle manual confiável na IFrame API atual, e Drive não fornece variantes/transcoding. Nenhum controle de qualidade foi adicionado. A qualidade fica a cargo do provider/arquivo.

## 19. CAPTIONS

Não há seletor Lumio de tracks/idioma. A API oficial de captions YouTube expõe opções limitadas, não seleção completa de faixa ao app; Drive atual não gerencia tracks. Não se declarou suporte inexistente nem se desabilitaram legendas próprias do player YouTube.

## 20. FULLSCREEN

Hook existente conserva superfície e tentativa de landscape onde o browser permite; `Escape`/saída devolvem Player + Chat. E2E sintético cobre fullscreen e retorno. Restrições específicas de iOS/Android real seguem não verificadas.

## 21. AUTOPLAY_BLOCKED

O bloqueio é estado visível com gesto de reprodução, sem loop automático nem falsa indicação de playback. E2E mobile foi corrigido no **harness**, mantendo segundo viewer Media durante reload, pois reload de único viewer por mais de 1,5 s acionava legitimamente a política GX3 de pausa; as asserções não foram enfraquecidas.

## 22. BUFFERING

Buffering prolongado (15 s) agora mostra Retry/Escolher mídia/Pular/Remover na composição existente. Captura `artifacts/m1/m1-buffering-recovery.png` e teste E2E com relógio virtual demonstram esse estado; não representam rede de provider real.

## 23. ERRORS

Taxonomia aplicada por evidência: NETWORK (Drive code 2), UNSUPPORTED_FORMAT (Drive codes 3/4 ou mídia não tocável), MEDIA_UNAVAILABLE/EMBED_RESTRICTED (YouTube 100/101/150), PROVIDER_UNAVAILABLE (script/API), AUTOPLAY_BLOCKED (rejeição do browser), UNKNOWN; 153 tem mensagem própria de configuração/referrer. Mensagens de UI não expõem URL privada, token ou ticket. Erros genéricos não são falsamente classificados como autorização expirada.

## 24. RECOVERY

Retry YouTube recarrega a mesma instância já pronta por `cueVideoById`; recriação é usada se adapter ainda não inicializou. Isso evita que `destroy()` elimine o iframe antes de uma tentativa de recriação. Drive recria adapter e só renova ticket uma vez para erro de rede; codec/decodificação incompatível não consome retry inútil. Erro permanente oferece escolha de outra mídia. Não há retry infinito.

## 25. MEDIA_SWITCHING

E2E adicionou A→B→C e conferência de `src` imutável no iframe entre trocas. O teste reproduziu falha antes da correção e passou após. Guarda de `ended` atrasado consulta `getVideoUrl()` quando disponível, ignorando fim de vídeo anterior. Metadata/volume/mute e duração desconhecida não vazam de forma indevida.

## 26. PLAYER_IDENTITY

MediaStage não passa a remontar ao abrir Chat, Call, Queue, People ou Hub. O defeito comprovado era a atualização do `src` do mesmo iframe pelo React durante troca de mídia, interferindo com o adapter; eliminado. Identidade do player e composição social preservadas.

## 27. TAB_VISIBILITY

Sem novo seek agressivo, listener paralelo ou relógio concorrente. Snapshots autoritativos continuam responsáveis por reconciliação ao retornar à aba. Testes existentes de background/foreground e reconnect são sintéticos; comportamento de throttling em dispositivos reais permanece por validar.

## 28. MEDIA_VIEWER_REGISTRY

Registro e eventos `experience:media:enter/leave` foram mantidos. Identidades por socket/aba, leave/disconnect e composição LX0 continuam na camada GX3. Nenhuma abertura de painel social foi convertida em leave de Media.

## 29. ZERO_VIEWER_POLICY

Pausa autoritativa após 1,5 s sem viewer mantida. O teste mobile foi adaptado para preservar um segundo viewer real durante reload, não para contornar ou reduzir a política.

## 30. QUEUE_INTEGRATION

Fila V2 permanece autoritativa. M3 E2E de três clientes cobriu reorder, ação stale, late join, lote, reconnect e convergence. `advanceQueue` com duration desconhecida conserva a posição corrente no evento ended em vez de zerá-la; CAS/expected item seguem.

## 31. ENDED_EVENT

Fim de mídia anterior é descartado pelo identificador conhecido do player YouTube; avanço da fila continua guardado por identidade/revision no servidor. Testes unitários cobrem evento atrasado; cenário real de timing do IFrame não foi certificado.

## 32. AUDIO

Drive lista e resolve áudio MIME comum; Player usa a apresentação Ambiente existente para `type: audio`, evitando toggle Vídeo/Ambiente inerte. Captura sintética `artifacts/m1/m1-audio-presentation.png` foi aberta. A UX real depende de conta Drive de teste e arquivos/codec autorizados; não há Spotify/YouTube Music novo.

## 33. MULTIUSER_REGRESSION

E2E M1 com três clientes passou no baseline, em oito repetições e nas suítes pós-mudança observadas. M2/M3/GX3 também passaram na rodada completa de 15/16; a única falha daquela rodada foi saída do worker FF3 People antes do cenário, e FF3 isolado passou. Não se reescreveu SYNC1.

## 34. M1_INTERMITTENCY

O 0 remoto observado uma vez em UX1 não foi reproduzido nos ensaios MEDIA1; não é declarado corrigido. O `src` do iframe sendo reatribuído foi defeito independente comprovado por teste antes/depois, mas não há evidência suficiente para atribuir a ele a ocorrência UX1. Se voltar, coletar trace com `mediaId`, revision, player generation e transição sem segredos, e avaliar em SYNC1.

## 35. PROVIDER_REAL_VALIDATION

`YOUTUBE_REAL = UNVERIFIED`. `DRIVE_REAL = UNVERIFIED`. Não foram usados conta Google, credenciais, arquivo privado, ambiente hospedado ou Google Cloud Console. Faltam testes manuais autorizados com vídeo YouTube público/incorporável e restrito, conta Drive de teste com vídeo/áudio e codecs diferentes, Range/seek real, mobile físico e autoplay de navegador real. Fixtures e API oficial não substituem essa validação.

## 36. SECURITY_PRESERVATION

OAuth scopes, vault, sessão, membership, grants, tickets, cookies, Range proxy, CORS e rate limit existentes não foram relaxados. Nenhum access token foi colocado no frontend ou URL pública. Auditoria de segurança completa continua fora do escopo de MEDIA1.

## 37. FINDINGS

P1: atualização React do `src` recarregava iframe YouTube entre mídias; teste A→B→C reproduziu. P2: duração desconhecida virava 0 na posição/235 fictício no store; P2: script YouTube sem falha/timeout recuperável; P2: erro de codec Drive tentava renovar ticket; P2: buffering prolongado sem saída; P2: Drive áudio comum não era descoberto; P2: lista de rates YouTube podia ficar desatualizada. DEFER: validação externa e intermitência M1 sem reprodução causal.

## 38. FIXES

`MEDIA1-01` iframe `src` somente no mount (MediaStage; E2E vermelho→verde); `02` duração desconhecida sem ficção/clamp (MediaStage/store; unit); `03` loader script timeout/erro/retry (MediaProvider; unit); `04` retry por provider e mensagens específicas (MediaProvider/Stage; unit/E2E); `05` buffering recuperável (Stage; E2E/captura); `06` Drive codec vs rede (MediaProvider; unit); `07` áudio Drive discovery + Ambiente (backend/Hub/Stage/App; unit/captura); `08` ended atrasado YouTube (MediaProvider; unit). Todos são locais ao Player/pipeline de mídia.

## 39. TESTS_ADDED

Unit: duration desconhecida, seek/posição efetiva, códigos YouTube, script failure/retry, stale ended, codec Drive, renovação única de ticket, MIME/resolve áudio. E2E: identidade do iframe em A→B→C, buffering com relógio virtual, apresentação áudio. Harness mobile preserva segundo viewer no reload. Asserções de sincronização existentes não foram removidas/enfraquecidas.

## 40. E2E

Baseline 15/16 por saída inesperada do worker Windows (`3221226505`), cenário afetado isolado PASS. Primeira rodada pós-mudança: 15/16 pelo mesmo tipo de saída do worker em FF3 People antes da asserção; FF3 People isolado PASS. Repetição completa: **16/16 PASS em 2,8 min**, sem retry automático do Playwright. Cenários M1/M2/M3/GX2/GX3 e mobile contextual passaram. A falha intermitente do processo do runner permanece registrada, não foi apagada pelo resultado verde.

## 41. VISUAL_QA

Capturas locais abertas para empty, player mobile 320/430, erro mobile, fullscreen e novos estados buffering/áudio. As capturas históricas `artifacts/m1/m1-video-*`, `m1-error-*`, `m1-fullscreen-*` incluem baseline anterior a LX0 e servem apenas como comparação, **não** prova atual. Novas capturas MEDIA1: `m1-buffering-recovery.png`, `m1-audio-presentation.png`; ambas sintéticas. Layout FF3.1 mobile Player + Chat não foi redesenhado. Não houve validação visual em dispositivo físico.

## 42. ACCESSIBILITY

Controles e labels existentes foram preservados; erro/buffering oferecem botões identificáveis e não bloqueiam o Chat. O foco/teclado dos novos caminhos deve ser reavaliado em QA com tecnologia assistiva. Não se declara conformidade WCAG integral.

## 43. PERFORMANCE

O recarregamento redundante do iframe em troca de mídia foi removido. Loader de script tem timeout e cleanup de callback/listener/script em falha. Controller preserva guardas de geração, e retry não duplica player ativo. Sem benchmark real de memória/CPU ou rede, logo melhora quantitativa não é alegada.

## 44. EVIDENCE_MATRIX

| Capability | Provider | Synthetic | Real | Result |
|---|---|---|---|---|
| Play/Pause/Seek | YouTube | M1 + adapter/E2E | UNVERIFIED | Local PASS |
| Troca A→B→C / iframe | YouTube | E2E vermelho→verde | UNVERIFIED | Local PASS |
| Errors/retry/buffering | YouTube | unit + E2E/captura | UNVERIFIED | Local PASS |
| Rates/quality/captions | YouTube | adapter + documentação oficial | UNVERIFIED | Limites declarados |
| Play/Seek/áudio/codec | Drive | unit + fixture/captura | UNVERIFIED | Local PASS |
| Range/ticket/permission | Drive | integração local existente | UNVERIFIED | Local PASS |
| Fullscreen/autoplay/mobile | Ambos | E2E + capturas | UNVERIFIED | Local PASS, browser real pendente |

## 45. KNOWN_DEBT

Providers reais e mobile físico não certificados; qualidade manual/legendas não expostas por capacidade garantida; codec Drive depende de navegador/arquivo; ocorrência M1 histórica não explicada; falha intermitente do worker Playwright no Windows. Nenhum desses pontos deve ser ocultado em preparação para MEDIA2.

## 46. FINAL_GATES

Após código final: `npm run typecheck` PASS; `npm run lint` PASS; `npm run build` PASS; `npm test` PASS; `git diff --check` PASS. E2E primeira rodada pós-mudança: 15 PASS / 1 runner crash / 0 skips em 3,5 min, e o cenário faltante passou isolado em 9,9 s. Repetição completa: **16 PASS / 0 FAIL / 0 SKIP em 2,8 min**, sem retries automáticos do Playwright. Testes locais não validam provider real.

## 47. DIFF_REVIEW

Código: `apps/web/src/components/MediaStage.tsx`, `apps/web/src/media/MediaProvider.ts`, `apps/web/src/components/MediaHub.tsx`, `apps/web/src/App.tsx`, `apps/server/src/store.ts`, `apps/server/src/googleDrive.ts`; testes correspondentes e `e2e/party.spec.ts`. Sem alteração de schema, dependência, OAuth, segredo, protocolo SYNC1, Queue V2 ou composição social. Capturas históricas modificadas por execução E2E serão restauradas estritamente a HEAD para não poluir diff; capturas novas ignoradas permanecem evidência local.

## 48. FINAL_VERDICT

**MEDIA1 LOCAL PASS — REAL PROVIDER VALIDATION PENDING**. A suíte local completa está verde na repetição, com crash anterior do runner documentado. Nunca interpretar este resultado como certificação YouTube/Drive em ambiente real.
