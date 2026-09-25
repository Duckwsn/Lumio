# Google Drive no Lumio — Etapa 9

> Registro histórico da Etapa 9. No runtime PostgreSQL da Etapa 18, conexões Drive são guardadas cifradas no banco, e os cookies de playback usam `SameSite=None; Secure` em produção; grants/tickets continuam efêmeros. Não copiar um `.env` novo sobre um existente. Leia [GOOGLE_OAUTH_SCOPE_AUDIT.md](GOOGLE_OAUTH_SCOPE_AUDIT.md) e [DEPLOYMENT_18.md](DEPLOYMENT_18.md) antes de configurar produção.

## O que foi implementado

O usuário Lumio conecta separadamente a conta Google. No Media Hub, a guia Google Drive abre **Meu Drive**, permite entrar em pastas e subpastas, voltar pelas migalhas de navegação, carregar páginas adicionais, atualizar a pasta e selecionar vídeos para reproduzir, enfileirar ou guardar na biblioteca da Casa. A listagem ocorre apenas quando a guia é aberta. Não há busca global no Drive.

O mesmo Lumio Player controla reprodução, pausa, seek, volume local e sincronização da Party. Cada integrante da Casa recebe um ticket temporário próprio para assistir ao vídeo selecionado. O navegador nunca recebe o access token nem o refresh token Google; os bytes passam pela API Lumio, que repassa `Range`, `Content-Range`, `Content-Length`, `Content-Type` e `Accept-Ranges` quando fornecidos pelo Google.

## Configuração local

1. No Google Cloud Console, selecione/crie um projeto e habilite a **Google Drive API**.
2. Configure a tela de consentimento OAuth. Durante o modo **Testing**, adicione explicitamente os endereços Google usados nos testes como test users.
3. Crie um **OAuth Client ID** do tipo *Web application*. Registre exatamente `http://localhost:4000/api/google-drive/oauth/callback` como *Authorized redirect URI*. Configure a origem do frontend (`http://localhost:5173`) conforme a configuração do seu projeto.
4. Copie `.env.example` para `.env` na raiz. Defina `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `CLIENT_ORIGIN` de acordo com as URLs reais. Gere uma chave de 32 bytes em hexadecimal, por exemplo `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, e coloque-a em `GOOGLE_TOKEN_ENCRYPTION_KEY`. Não publique nem faça commit desse arquivo ou da chave.
5. Reinicie `npm run dev`. Entre no Lumio, abra uma Casa → **Adicionar mídia** → **Google Drive** → **Conectar Google Drive**. Autorize a conta Google na janela aberta.

O escopo `drive.readonly` permite navegar pelo **Meu Drive** existente e ler vídeos. É um escopo **restrito**: disponibilizar o app publicamente requer a verificação OAuth do Google e pode exigir avaliação de segurança. O escopo `drive.file` é menos amplo, porém só dá acesso aos arquivos que o usuário escolhe/abre com o app, e não atende a navegação integral por pastas prevista aqui. O Google pode limitar a duração de refresh tokens de apps externos em modo Testing; uma reconexão pode ser necessária. Links de vídeo que não possam ser baixados não são exibidos como reproduzíveis.

## Proteção e ciclo de vida

- Tokens Google são persistidos no cofre local `.data/google-drive-connections.json` com AES-256-GCM. O arquivo e `.env` estão ignorados pelo Git. **Guardar a chave em local seguro**: perdê-la impede abrir o cofre; girá-la requer uma estratégia de migração/reconexão.
- O fluxo OAuth usa `state`, PKCE S256, `access_type=offline` e origem explícita no retorno à janela do Lumio. A conexão não é login Lumio.
- A API confere sessão Lumio, associação à Casa, mídia na fila ou tocando, concessão daquele arquivo naquela Party e associação do dono da conexão. Concessões duram 24 horas em memória; tickets duram cinco minutos e exigem um cookie `HttpOnly` da sessão de playback. Sair da Casa, ser removido dela ou desconectar o Drive revoga a concessão relacionada.
- A seleção não altera o compartilhamento do arquivo no Google. O backend serve o vídeo aos membros da Casa usando a autorização do dono da conexão. Portanto, **adicionar um vídeo à fila dá acesso temporário ao conteúdo aos demais membros da Casa**, mesmo que o arquivo seja privado no Drive. Só selecione vídeos que você deseja compartilhar com essa Casa.
- Os arquivos do Drive não são carregados para o servidor nem copiados para a biblioteca; o servidor apenas transmite bytes durante o playback.

## Limitações atuais

- Desde Auth V2, usuários e sessões novos persistem em `.data/auth-v2.json`; Casas, filas e concessões ainda são em memória. Conexões Drive criadas antes da Auth V2 podem ficar órfãs, pois os usuários antigos não eram persistidos. As migrations Prisma `0007_google_drive_connection` e `0008_auth_v2` preparam persistência relacional futura, **mas não são usadas pelo runtime atual**. A persistência social e grants ainda precisa ser implementada antes de produção.
- São exibidos somente `video/mp4`, `video/webm` e `video/ogg` baixáveis. A reprodução real depende dos codecs suportados pelo navegador, permissões do arquivo, cotas, rede e política do Google Drive. Não há transcodificação.
- O cookie de playback `SameSite=Strict` pressupõe frontend e API no mesmo site (como `localhost` em portas diferentes). Hospedar em sites separados exigirá outra configuração de cookie/CORS/HTTPS, com revisão de segurança.
- Não há integração testada com conta Google real neste ambiente sem as credenciais e um usuário de teste autorizado. O status correto é **NÃO TESTADO COM CONTA GOOGLE REAL**.

## Verificação

Automatizada: `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`. O teste `apps/server/src/googleDrive.test.ts` simula respostas oficiais para consentimento, cofre criptografado, listagem paginada, isolamento entre usuários, concessões, tickets, `Range` e desconexão.

Manual com conta de teste: conectar e cancelar consentimento; navegar raiz/pasta/subpasta; paginar/atualizar; selecionar MP4; reproduzir e fazer seek em dois usuários da mesma Casa; testar usuário fora da Casa, remoção de membro, desconexão do dono, arquivo removido/permissão negada, cota/erro 429, rede instável, vídeo longo e refresh token expirado. Validar que não há token Google em URLs, Network do frontend ou logs. Não usar arquivos pessoais sensíveis nessa bateria.

Referências oficiais: [OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server), [escopos da Drive API](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [download e Range](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [verificação de escopos restritos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
