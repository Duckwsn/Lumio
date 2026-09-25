# Etapa 17 — performance, resiliência e observabilidade

Auditoria local em 25/09/2026. Não houve deploy, uso agressivo de APIs Google, migração de banco, Redis, broker, SFU ou alteração visual da Party.

## Arquitetura real e limites

- Web: React 18/Vite/PWA; Landing pública com importação dinâmica do App; Home usa um Socket.IO leve e polling de Casas de 20 s; Party usa outro socket (a rota troca o socket, não mantém um por Casa).
- API: um processo Node/Express/Socket.IO na porta `PORT` (padrão 4000); Web Vite na 5173 em desenvolvimento. `/api/health` é liveness e `/api/ready` é readiness do processo, sem sondagem Google. Ambos não expõem segredos.
- Auth/sessões usam `.data/auth-v2.json`; conexões Google Drive usam cofre criptografado em arquivo local. Casas, Party, fila, presença, grants Drive, rate limits e caches estão em memória. O schema SQLite/Prisma e migrations existem, mas **não são o adapter runtime**. Não há pool nem consultas SQL ativas para otimizar; índices do schema só terão efeito após migração real. Uma segunda instância não compartilhará o estado e não resolverá isso com sticky sessions apenas.
- WebRTC é mesh P2P: com N participantes, há até N−1 PeerConnections por cliente e N(N−1)/2 pares. STUN é configurável; TURN estático só é enviado com URLs/usuário/credencial em env. Sem TURN, redes restritivas podem impedir a call. Nenhum benchmark RTC real foi feito.
- YouTube usa Data API no servidor para pesquisa/metadados, cache TTL de 10/45 min e fallback oEmbed em casos definidos; o player usa o IFrame API oficial. Pesquisa usa debounce de 450 ms e cancelamento no cliente. Não foi consumida quota real nesta auditoria.
- Drive lista uma pasta por vez, com paginação de 100 arquivos no upstream; não faz crawl/search. Cada espectador abre seu próprio stream autorizado via ticket/cookie e Range; não há CDN, transcode ou pooling de downloads. Não foi testado contra uma conta Google real nesta etapa.

## Linha de base medida

Build antes das mudanças: entry público 166,16 kB (52,40 gzip), App 213,11 kB (58,22 gzip), MediaStage 13,35 kB (4,96 gzip), MediaHub 34,62 kB (10,34 gzip), CSS 116,06 kB (21,53 gzip). Build depois: entry 166,16 kB (52,40 gzip), App 214,71 kB (58,54 gzip), MediaStage 13,35 kB (4,95 gzip), MediaHub 35,08 kB (10,45 gzip), CSS 116,06 kB (21,53 gzip). O aumento pequeno reflete código de resiliência; não houve ganho artificial de bundle.

Teste HTTP isolado em loopback (uma execução dedicada, **não produção**): startup 861 ms; `/api/bootstrap` n=30 p50 1,1 ms, p95 2,1 ms. Esses números variam com a carga local. Não há medição anterior comparável para API, heap JS, CPU, event loop, queries ou latência de providers; não se infere melhora numérica nesses itens.

## Falhas encontradas e correções

- O analyser atualizava o estado de `App` a cada ~100 ms, repintando a Party mesmo com configurações fechadas. Agora o nível fica em `ref` e só a janela aberta de CallSettings amostra/repinta o medidor. Speaking continua emitido apenas nas transições de voz; `currentTime` continua local ao MediaStage (intervalo de 500 ms), não ao App nem por WS.
- Socket.IO usa explicitamente delay de 1 s a 30 s, jitter 0,5 e timeout de conexão de 10 s. A sessão inválida já abandona o socket via desmontagem da rota; reconexão reentra na Party e o primeiro snapshot é autoritativo. Um socket para Home ou um para Party, conforme a rota.
- Timer efêmero de reação é substituído/cancelado em novas reações e ao sair. `roomConnections` remove o mapa da sala quando o último socket sai. O cleanup existente de peers, tracks, áudio remoto, AudioContext, timers e listeners foi revisado; teste RTC real ainda falta.
- DriveProvider agora aborta tickets pendentes e remove listener de metadata ao trocar/destruir provider. Navegação de pastas cancela requests obsoletos, descarta respostas antigas e limita o cache local a 50 pastas/60 s por montagem; desconexão limpa o cache.
- Fetches Google do Drive passaram a ter timeout de conexão/cabeçalhos de 12 s; o timeout é retirado após os headers para não interromper vídeos longos. O streaming usa `pipeline` com backpressure e `AbortSignal`; desconexão do consumidor cancela upstream. Range/206 e headers relevantes continuam repassados, sem bufferizar o arquivo inteiro. Erros após headers encerram a resposta; dados privados continuam `no-store` e exigem autorização/ticket.
- Caches YouTube ficam limitados a 2.000 entradas cada, mantendo TTL; buckets de rate limit antigos são podados. A política de cotas e verificações de embedding não foi afrouxada.
- Requests HTTP recebem `X-Request-ID`; logs JSON em stdout/stderr contêm somente método, template de rota, status e duração. Eventos WS relevantes contêm IDs técnicos, não payloads. O teste de integração verifica ausência de tokens de sessão, convite, verificação e reset nos logs. Não existe `/metrics` público.
- `/api/ready` devolve 503 após início de shutdown. SIGINT/SIGTERM abortam streams ativos, fecham sockets e usam deadline de 5 s. O caminho foi auditado/testado por build e teste de processo isolado; entrega real de sinal gracioso no Windows e streams reais ativos durante shutdown ainda exigem validação na futura infraestrutura.
- Respostas antigas de bootstrap/Casas não podem repovoar Home após troca de sessão/logout. Teste de Sync com relógio avançando 1 ms foi corrigido para não exigir posição exatamente zero.

## Evidência e cobertura

- Teste de integração: 50 ciclos connect → join → snapshot → disconnect em servidor isolado; endpoint de health permaneceu disponível. Isso valida churn de Socket.IO, não horas de uso nem ausência absoluta de crescimento de heap.
- Testes de unidade: 50 alternâncias de provider com 50 destruições; ticket Drive pendente abortado no destroy; Range, grants, ticket e propagação de AbortSignal em mock Drive; queue revision/idempotência, snapshot e auth/security já existentes.
- Navegador interno do Codex: Landing 390×844 e 430×932 sem overflow horizontal; sem iframe/Party runtime na página; CTA leva a `/login`. Não foi feita autenticação real nem Party multiusuário nesta rodada.
- Build do backend iniciado isoladamente com configuração local de produção (sem credenciais reais/serviços externos): `/api/health` 200, `/api/ready` 200 e `X-Request-ID` presente. Ctrl+C no terminal Windows encerrou o processo sem entregar evidência do handler SIGINT; shutdown gracioso por sinal continua **não validado**.
- PWA: suíte existente confirma cache apenas de shell/assets públicos; API, auth e mídia privada não entram no Cache Storage. Logout não adiciona cache privado.
- **Não testado**: soak de horas, WebRTC real (peers/tracks/getStats, speaking/ducking, screen share 10×), Google Drive real em streaming/concurrency/seek/cancelamento, YouTube real, três browsers, falha de banco (não há DB runtime), reinício do backend com três usuários simultâneos, browser offline 10/60 s. Não declarar esses cenários como aprovados.

## Preparação para a etapa 18 (sem deploy)

- Configuração: `PORT`, `CLIENT_ORIGIN`, `APP_PUBLIC_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `VITE_API_URL`, `VITE_SOCKET_URL`, Google OAuth/Drive, chave de criptografia, YouTube e `RTC_*` estão em `.env.example`. Produção exige origens públicas HTTPS e provedor de e-mail real. Fallbacks `localhost` servem apenas ao desenvolvimento; conferir valores Vite no build de produção.
- Dados: substituir adapters locais/voláteis por persistência transacional antes de múltiplas instâncias. Aplicar/revisar migrations com o adapter real; hoje `DATABASE_URL` e índices Prisma não são usados pelo processo.
- Realtime: Socket.IO precisa de upgrade WS e estado compartilhado ou topologia de instância única até migrar; sticky session isolada não sincroniza Casas/Party. TURN com credenciais temporárias é requisito operacional a avaliar.
- Google Drive: cofre local, grants/tickets em memória e um stream upstream por espectador são riscos para restart/escala; revisar armazenamento de tokens e quotas na implantação. Callback OAuth é configurável por `GOOGLE_REDIRECT_URI`.
- Observabilidade: coletar logs JSON stdout/stderr, monitorar `/api/health` e `/api/ready`; medir memória/event loop, tráfego de Party, p95 real, erros por provider e RTC getStats em ambiente de teste com contas controladas. Não expor métricas privadas sem autenticação.

Nenhuma migration foi alterada nesta etapa. O teste local não demonstra prontidão para produção; os riscos acima precisam de decisão explícita na etapa 18.
