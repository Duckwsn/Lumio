# Call V4 e screen share V2

## Arquitetura

Atualização pós-1.0: entrar na Party registra automaticamente a voz, depois do snapshot/socket autenticado. O microfone começa desligado, sem `getUserMedia`; peers recebem áudio por transceivers inicialmente `recvonly`. A ação explícita **Ativar microfone** captura áudio e reutiliza o sender/transceiver existente com `replaceTrack`, `setStreams` e direção `sendrecv`. A negociação continua pertencendo a `onnegotiationneeded`. Não existem ações normais de entrar/sair da call; para não ouvir, use deafen; para encerrar a voz, saia da Party.

Na descoberta de cada par, somente o lado impolite inicia a primeira oferta; o polite responde. Depois da primeira descrição remota, ambos podem renegociar via o handler existente. Isso evita rollback/glare inicial que a regressão receive-only encontrou com transceivers duplicados e ICE sem avançar. Candidatos de uma oferta ignorada não são aplicados. A conexão de outro peer não apaga avisos de permissão/dispositivo de microfone.

Reconexão de Socket.IO encerra captura local e compartilhamento, invalida capturas pendentes e recria a participação de voz sem ligar o microfone. Um microfone fisicamente desconectado exige nova ativação explícita. Deafen também silencia o envio; ao reativar a recepção, o microfone permanece desligado até uma ação explícita. Mute comum usa `track.enabled = false`, conserva a permissão/track já solicitada e não encerra recepção. Negar microfone é erro não fatal com botão de nova tentativa. O navegador pode exigir **Ativar áudio da call** para reprodução; isso não inicia captura.

A call continua na Party existente. Cada cliente mantém no máximo uma `RTCPeerConnection` por outro usuário ativo na call (P2P mesh). Com quatro participantes, cada navegador possui três conexões e envia cada track até três vezes; o custo de upload/CPU aumenta aproximadamente com `N−1`. Não houve medição real em redes remotas nesta etapa, então não há evidência para migrar para SFU.

O servidor registra um socket ativo por usuário e Party. `voice:join` descobre só quem está na call, e `voice:signal` exige origem e destino ativos na mesma Party e o socket de destino correto. O socket ID funciona como geração: ofertas/candidatos da conexão anterior não são aceitos após reconexão. A negociação do cliente usa o padrão de peer educado/não educado para resolver ofertas simultâneas; `onnegotiationneeded` é o único caminho para ofertas locais, inclusive troca de track e restart ICE. Falha de conexão dispara no máximo três ICE restarts com atraso crescente, cancelados ao reconectar ou sair.

O player e a call mantêm ciclos de vida separados. O mic usa `echoCancellation`, `noiseSuppression` e `autoGainControl` como solicitações ao navegador; a efetividade depende do dispositivo e navegador. Trocar microfone usa `replaceTrack` sem sair da call. PTT transmite apenas enquanto V está pressionado e libera ao perder foco ou ocultar a página. Ducking é local: volume base × fator configurado, com redução/retorno suaves. Seleção de saída depende de `setSinkId`.

Screen share usa a track de vídeo da mesma conexão P2P, sem transportar mídia pelo WebSocket. O servidor é autoridade de um único compartilhamento por Party, inclusive entre abas do mesmo usuário. Encerrar no navegador ou no Lumio limpa a track; ao desconectar, o servidor libera imediatamente o slot. O áudio da tela **não** é capturado/transmitido nesta versão (`audio: false`). O microfone é independente.

## STUN/TURN

No `.env` da raiz, configure `RTC_STUN_URLS` como lista separada por vírgulas. Para TURN, preencha `RTC_TURN_URLS`, `RTC_TURN_USERNAME` e `RTC_TURN_CREDENTIAL` em conjunto. Exemplo de URL: `turn:turn.example.com:3478?transport=udp` ou `turns:turn.example.com:5349?transport=tcp`. Reinicie o servidor após alterar `.env`. A API autenticada `/api/rtc/config` entrega `iceServers` ao navegador somente quando a call inicia, com `Cache-Control: no-store`.

STUN sozinho não garante comunicação em NATs/firewalls restritivos. A rota de configuração exige sessão e participação na Casa informada por `roomId`. Credenciais TURN enviadas ao navegador podem ser inspecionadas por usuários autorizados; para produção, use credenciais efêmeras e curtas do seu provedor TURN e limite de uso. Não coloque segredos TURN em variáveis `VITE_*`, nem em logs. TLS/HTTPS e um TURN funcional são necessários para uso real na Internet. A ausência de TURN é uma limitação declarada, não uma falha silenciosamente resolvida.

## Roteiro manual de QA

1. Dois usuários em navegadores/perfis separados: entrar na mesma Party, confirmar voz automática sem prompt de microfone, ativar microfone, falar, mutar/desmutar e sair da Party. Confirmar um único áudio por pessoa e cleanup ao sair.
2. Três e quatro usuários: repetir; observar CPU/upload e qualidade. A mudança de provider YouTube ↔ Drive, Media Hub e modo cinema não deve reiniciar mic ou call.
3. Permissão do microfone negada/sem dispositivo: Party permanece utilizável, call em escuta, botão permite tentar novamente.
4. Trocar microfone e desconectar o dispositivo selecionado: confirmar mic desligado e nova ativação explícita; PTT deve continuar funcionando. Testar V pressionado com perda de foco e aba oculta.
5. Dois usuários iniciam screen share quase juntos: apenas um vence. Testar parada pelo botão e UI do navegador, saída/fechamento da aba do dono, e nova tentativa do outro usuário.
6. Interromper rede por poucos segundos: voz mostra reconexão; após volta, confirmar recepção sem duplicatas, mic desligado e captura de tela encerrada. Reativar ambos somente por gesto explícito. Em rede que exige relay, repetir com TURN configurado.
7. Se o navegador bloquear autoplay remoto, clicar em “Ativar áudio da call”. Testar saída de áudio somente onde `setSinkId` estiver disponível.

Esses são testes manuais, não substituídos por typecheck/build. Testes de registro cobrem isolamento por Party, segunda aba e sinais obsoletos. A regressão pós-1.0 também usa três contextos Chromium e transporte WebRTC real em loopback com microfones sintéticos; não substitui aparelhos físicos, áudio humano ou redes remotas/TURN. Veja `AUTOMATIC_PARTY_VOICE_REPORT.md`.
