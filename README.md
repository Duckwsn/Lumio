# Lumio

Lumio é uma plataforma de Party privada para assistir, ouvir e conversar no mesmo espaço. A interface usa uma única fila mista YouTube/Google Drive, Media Hub, biblioteca, favoritos, progresso, modo cinema, tela cheia, modo ambiente e configurações autoritativas.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + Socket.IO
- Contratos: pacote compartilhado com TypeScript + Zod
- Persistência preparada: Prisma + SQLite local / PostgreSQL em produção
- Voz: sinalização WebRTC P2P preparada por Socket.IO

## Rodar localmente

Requisitos: Node.js 20+ e npm 10+.

```bash
npm install
copy .env.example .env
npm run dev
```

Abra `http://localhost:5173`. A Landing permite criar uma conta com nome, e-mail e senha. Uma conta nova começa sem Casas; crie a primeira pela Home e então entre na Party. Para testar o realtime, gere um convite e abra o link em outro perfil do navegador.

Rotas principais:

- `/`: Landing pública (ou Home quando já autenticado);
- `/login` e `/register`: autenticação;
- `/app`: Home e seletor de Casas;
- `/house/:houseId`: Party protegida;
- `/invite/:token`: convite público com retorno ao fluxo após autenticação.

Também é possível subir a API separadamente:

```bash
npm run dev --workspace @lumio/server
npm run dev --workspace @lumio/web
```

## Como testar Party (Etapa 4)

1. Crie uma conta e uma Casa em `http://localhost:5173`.
2. Entre na Party, gere um convite e aceite-o em outro perfil do navegador.
3. As duas sessões entram na Party principal da mesma Casa.
4. Envie uma mensagem; ela aparece nas duas abas.
5. Adicione um vídeo do YouTube por URL ou ID; a fila é compartilhada.
6. Use play, pause ou a barra de progresso do player oficial/nativo; o estado chega às demais abas.
7. Ative o microfone para iniciar a preparação WebRTC. O browser solicitará permissão.
8. Alterne entre vídeo e áudio pela fila; a Party adapta a apresentação automaticamente sem trocar de sala.
9. Abra o diálogo de mídia, pesquise se `YOUTUBE_API_KEY` estiver configurada ou cole uma URL/ID.
10. Arraste itens da fila para reorganizar, use `pular` em duas janelas e abra `histórico` após o avanço.
11. Use `SPACE`, `M`, `D`, `T` e `/` fora dos campos de texto para os atalhos da Party.
12. Abra o Media Hub com `/`, escolha Recentes/Biblioteca/Favoritos ou pesquise no YouTube.
13. Ative o modo cinema com `T` e use o botão de tela cheia do player. `ESC` fecha diálogos ou sai da tela cheia pelo navegador.
14. Em configurações da Party, altere quem controla mídia/fila e o limiar da votação para pular.
15. No Media Hub, pesquise um termo com três ou mais letras, use **Carregar mais** e compare **Adicionar** com **Reproduzir agora**.
16. Abra as configurações de áudio no rodapé, escolha microfone/saída, ajuste os volumes e teste o modo push-to-talk segurando `V`.
17. Em uma das janelas, clique em **Compartilhar tela** e escolha uma tela ou janela. A outra sessão abre o palco compartilhado e pode alternar de volta para a mídia sem desmontar o player.

`DEAFEN` silencia localmente todos os áudios remotos e também desativa o microfone local; ao desligar, o usuário pode desmutar manualmente. O volume de cada participante é uma preferência local e não afeta os demais.

## Arquitetura

`apps/web` contém a aplicação da Party, o `MediaController`, providers independentes e o Media Hub. Cada mídia renderiza somente um player: o iframe oficial do YouTube ou o elemento nativo de vídeo/áudio do Drive. A PartySession trabalha com o contrato padronizado de mídia; detalhes dos providers ficam em `YouTubeProvider` e `DriveProvider`. `apps/server` mantém o estado autoritativo da Party em memória no modo local, expõe os eventos Socket.IO e guarda tokens Google exclusivamente no processo do servidor. `packages/shared` centraliza tipos, schemas e nomes de eventos.

O esquema Prisma está em `apps/server/prisma/schema.prisma`. A migration `0002_media_hub` prepara configurações, biblioteca de grupo, favoritos do usuário e checkpoints de progresso. O runtime local ainda usa o store em memória; reiniciar a API limpa esses dados.

## Contratos realtime principais

`room:join`, `room:leave`, `room:mode`, `room:settings`, `presence:update`, `media:play`, `media:pause`, `media:seek`, `media:change`, `media:sync`, `media:request-sync`, `queue:add`, `queue:remove`, `queue:move`, `queue:next`, `queue:previous`, `queue:history`, `vote:skip`, `chat:message`, `reaction:send`, `voice:join`, `voice:leave`, `voice:speaking`, `voice:signal`, `screen:start`, `screen:stop` e `screen:state`.

## Variáveis de ambiente

Veja `.env.example`. `PORT`, `CLIENT_ORIGIN`, `VITE_API_URL` e `VITE_SOCKET_URL` bastam para o modo local. Cole a chave do projeto Google Cloud em `YOUTUBE_API_KEY` somente no `.env` do servidor; ela habilita a busca oficial `/api/youtube/search` e nunca é enviada ao browser. Sem ela, URLs continuam funcionando por metadados públicos do oEmbed. `DATABASE_URL` está reservado para a troca do store em memória por Prisma.

## Configurar Google Drive

1. No Google Cloud Console, habilite a **Google Drive API** e crie um cliente OAuth 2.0 do tipo aplicação Web.
2. Cadastre exatamente `http://localhost:4000/api/google-drive/oauth/callback` como URI de redirecionamento autorizada.
3. Preencha no `.env`:

```env
GOOGLE_CLIENT_ID=seu-client-id
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/google-drive/oauth/callback
```

4. Reinicie `npm run dev`, abra o Media Hub, vá em Drive e escolha **Conectar Google Drive**.

O backend solicita `drive.readonly`, `openid` e `email`. `drive.readonly` é um escopo restrito pelo Google: ele é necessário para explorar e reproduzir arquivos existentes em todo o Drive e exige verificação do app antes de uso público. Uma evolução com Google Picker + `drive.file` pode reduzir o escopo para arquivos escolhidos explicitamente. O `CLIENT_SECRET`, access token e refresh token nunca são enviados ao frontend. Para reprodução, cada participante obtém do backend um ticket aleatório com validade de cinco minutos; o servidor faz proxy com suporte a `Range` usando a autorização daquele participante. Um arquivo privado continua privado e só toca para contas que já tenham permissão e `capabilities.canDownload`.

Formatos inicialmente listados: MP4, WebM, MP3, M4A/MP4 audio, WebM audio, OGG e WAV. Codec e suporte final ainda dependem do navegador.

## Limitações atuais

- O login local e o estado da Party usam memória no processo do servidor; reiniciar a API limpa os dados.
- O provider YouTube encapsula o embed oficial e aplica ressincronização com cooldown para evitar loops agressivos de seek. Não há scraping, download ou retransmissão de conteúdo.
- A busca textual oficial do YouTube depende de `YOUTUBE_API_KEY` e da cota da API. O servidor limita chamadas por usuário e mantém cache curto; URL direta usa oEmbed como fallback quando a cota acaba.
- Google Drive depende de credenciais OAuth reais e não foi validado contra uma conta quando elas estão ausentes. Tokens ficam em memória e são perdidos ao reiniciar a API; persistência futura exige armazenamento criptografado.
- Arquivos Drive só reproduzem quando cada participante tem permissão. Codecs não suportados pelo navegador não são convertidos.
- A voz usa P2P com sinalização Socket.IO, deafen, mute, push-to-talk, volume individual, ducking e detecção local; uma call grande ainda exige SFU/TURN e observabilidade de produção.
- O compartilhamento de tela transmite vídeo P2P e permite apenas um apresentador. O áudio do sistema foi desativado nesta etapa para evitar duplicação/eco com o microfone.
- Câmera, SFU/TURN gerenciado e persistência efetiva por Prisma continuam fora desta etapa.

## Roadmap sugerido

1. Ligar o runtime ao Prisma/SQLite e persistir biblioteca, favoritos, progresso e sessões.
2. Armazenar credenciais OAuth com criptografia e rotação de chaves.
3. Adicionar TURN e migrar calls maiores para uma SFU, mantendo P2P para grupos pequenos.
4. Persistir Casas, convites, perfis e sessões com o schema Prisma já preparado.
5. Evoluir o player oficial do YouTube com eventos de duração/ended para avanço automático confiável.
