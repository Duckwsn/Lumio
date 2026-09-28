# Pós-1.0 — Voz automática na Party

## Escopo e resultado

Entrada na Party passa a iniciar automaticamente participação de voz após sessão, membership e snapshot/socket prontos. Microfone começa OFF sem captura local nem solicitação de permissão. Home/Landing não inicializam voz. A arquitetura continua P2P mesh e um socket ativo de voz por usuário/Party, com autorização e descoberta no servidor.

Desktop: o Dock oferece ativar/desativar microfone e deafen. Mobile: o ícone junto ao Chat mantém o menu compacto existente; abrir esse menu não captura áudio. Escolher **Ativar microfone** é o gesto explícito de captura. Não há modal automático nem CTAs **Entrar na call**/**Sair da call**. Configurações mantêm dispositivos, volumes, ducking e PTT quando há teclado.

Pessoas mantém grupos Party/Online/Offline, sem grupo separado de call. Na Party, mostra falando, microfone desligado/ativo ou áudio desativado, usando presença realtime para não manter indicador de fala após mute. Os IDs e flags internos de call continuam necessários para autorização/signaling, não como nova sala visual.

## Lifecycle e privacidade

- `App.tsx`: efeito de entrada depende de IDs/socket/estado da conexão, não de cada atualização do snapshot. `voice:join` tem ACK e timeout de 10 s; falha não derruba Chat/player. Reconexão registra a voz novamente; erro de permissão/aba concorrente permanece explícito, sem loop de retry.
- Peers inicialmente sem microfone continuam usando transceivers `recvonly` de áudio/vídeo. A primeira ativação reutiliza o transceiver de áudio em `rtc/microphone.ts`, substitui track, associa stream e muda direção para `sendrecv`. Ofertas continuam exclusivamente via `onnegotiationneeded`, preservando perfect negotiation e ICE restart existentes.
- A regressão real encontrou ofertas iniciais simultâneas com rollback, transceivers duplicados e ICE estacionado em `new`. O primeiro offer agora pertence somente ao lado impolite; o lado polite responde, sem segundo caminho de offers. Após descrição remota, ambos podem renegociar normalmente. Candidatos de offer ignorado também são descartados. O handler de conexão agora limpa só erros de rede, preservando feedback de permissão negada.
- `getUserMedia` só ocorre após ativação explícita ou troca de dispositivo quando já há microfone autorizado/ativo. Não se cria uma track capturada e silenciada na entrada. Falha/negação conserva voz em recepção e botão para nova tentativa.
- Mute desabilita a track já capturada, sem sair da voz ou bloquear recebimento. Essa track pode permanecer aberta/sinalizada pelo navegador até sair/desconectar; não confundir mute com liberação da permissão. Deafen silencia recepção e envio; desativar deafen não volta a ligar o microfone por conta própria.
- Desconectar Socket.IO encerra mic/display tracks, analyser/AudioContext e peers, invalida a geração da captura pendente e retorna mic OFF. Uma resposta tardia de captura não repovoa a Party. Troca de dispositivo também tem proteção contra retorno obsoleto. Dispositivo encerrado exige nova ativação explícita, sem recaptura automática.
- Sair da Party remove registro de voz, tracks, peers, áudio remoto/listeners/timers conforme cleanup existente. Autoplay remoto mantém ação mínima de liberação; não solicita microfone. Screen share permanece explícito e sem captura de áudio da tela.
- `RoomStore.addMember` inicia presença com `muted: true`, sem modificar contratos de mídia, autenticação, OAuth ou banco. Nenhuma migração, configuração TURN/SFU, infra ou deploy foi alterado.

## Evidência de testes

O teste WebRTC usa servidor local isolado, contas descartáveis e três contextos Chromium, sem chaves Google ou dados da implantação. O transporte RTC é real; áudio de entrada é sintético (`--use-fake-device-for-media-stream`). Não é uma escuta humana nem teste WAN. O cenário passou três repetições consecutivas após a correção de oferta inicial e passou novamente na suíte completa: **4 E2E aprovados** em aproximadamente 1,1 min, sem retries. A captura `test-results/mobile-automatic-voice.png` foi inspecionada visualmente: menu compacto, feedback não fatal, opção de ativar mic e Chat/player preservados.

As rodadas iniciais falharam e não são apresentadas como aprovações: além dos dois bugs corrigidos (glare inicial e feedback apagado por peer conectado), assertions foram ajustadas para distinguir registro/descoberta de pares do transporte de áudio. Com ambos os mic OFF, não se exige ICE conectado em todo par inativo; exige-se recepção RTP dos pares que publicam áudio, presença e recursos coerentes. Esperas de transporte/reconexão são limitadas a 20 s. Não há sleeps para mascarar falhas nem retry automático do teste.

Cobertura adicionada: presença automática de três usuários; zero captura/display capture ao entrar; publicação explícita de A; B recebe RTP e reproduz áudio sem mic; C entra depois com mic OFF e recebe A; negação de mic de B conserva recepção e permite retry; B publica e C recebe duas fontes; deafen/mute sem saída; reconexão de A sem nova captura; saída de C limpa peers e áudio; captura solicitada que resolve após saída é interrompida. Autoplay negado é simulado por `NotAllowedError` em `play()`, seguido de liberação por ação; negação de mic também é simulada, não um prompt manual.

Testes unitários validam reutilização do sender/transceiver sem track adicional, fallback quando não há slot, escolha do primeiro offer e presença inicialmente silenciada na entrada/reentrada. A suíte mobile conserva player/chat/sheets/fullscreen/sync existentes e acrescenta zero captura na entrada e negação de microfone por gesto no menu mobile. As mudanças anteriores de proporção do player/chat foram preservadas. A configuração RTC do servidor isolado usa host candidates, sem STUN/TURN externo; isso evita depender de rede Google para QA em loopback e não altera env de produção.

## Checks finais — 28/09/2026

| Check | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (checks TypeScript dos workspaces) |
| `npm test` | 85 aprovados: servidor 61, web 20, service worker 4; 5 PostgreSQL SKIP por ausência do banco dedicado de testes |
| `npm run test:e2e` | 4 aprovados, sem retries |
| Multiusuário RTC isolado, `--repeat-each=3` | 3 execuções consecutivas aprovadas |
| `npm run build` | PASS; App 226,88 kB / gzip 61,63; CSS 122,85 kB / gzip 22,63 |

## QA manual pendente

Ainda testar em aparelhos Android/iOS reais: prompt/autoplay nativos, Bluetooth/remoção física de dispositivo, seleção de saída, PTT com perda de foco, screen share real e reconexão em redes distintas/TURN. Os testes de layout/fullscreen e media usam fixtures de provider; não demonstram call humana durante YouTube/Drive oficiais. Party Games não possui runtime nesta alteração: não foi implementado nem há cenário de game aprovado; voz continua pertencendo ao App/Party, não ao stage de mídia.

Sem commit, push ou deploy. Nenhuma configuração OAuth foi publicada, nenhum segredo foi acessado para esta tarefa.
