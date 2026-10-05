# Constituição visual Lumio — FF1

Normas para review em FF2–FF6. `MUST`/`MUST NOT` são restrições de produto; exceção exige evidência e decisão registrada.

1. MUST fazer a atividade atual dominar a hierarquia da tela.
2. MUST manter Casa, Party e experiência conceitualmente distintas.
3. MUST preservar graphite, mint, Inter e logo Lumio.
4. MUST manter Media e Games na mesma Party sem remount de chat/call por troca de rota.
5. MUST deixar o social próximo, mas subordinado ao palco.
6. MUST identificar dono de cada controle: Core, Social, Media, Games ou Utility.
7. MUST mostrar Queue/Add Media/Now Playing apenas no contexto Media.
8. MUST manter People/Chat/Call disponíveis também em Games.
9. MUST exibir pista/tempo/vez e ação principal do jogo sem busca em menu.
10. MUST unificar conversa e palpites do Draw em um fluxo legível.
11. MUST diferenciar chat, palpite, acerto e quase-acerto por texto/ícone, não só cor.
12. MUST testar 320×568, 390×844, 844×390, 1280×720 e 1440×900.
13. MUST respeitar teclado virtual, visual viewport e safe areas.
14. MUST preservar foco visível, ordem de tabulação e semântica acessível em overlays.
15. MUST oferecer alvo de toque de pelo menos 44×44px para ações móveis.
16. MUST suportar `prefers-reduced-motion` sem perder informação.
17. MUST manter erros, loading e reconexão específicos e recuperáveis.
18. MUST manter Google Login separado da autorização Drive.
19. MUST respeitar capacidades reais dos providers e privacidade das cartas.
20. MUST medir screenshots novas contra o commit sob teste.
21. MUST NOT usar card genérico como recipiente universal.
22. MUST NOT aninhar card de experiência, card de palco e card de conteúdo por padrão.
23. MUST NOT repetir título, breadcrumb e status com o mesmo significado.
24. MUST NOT exibir duas instâncias de chat/composer para a mesma Party.
25. MUST NOT deixar dock/painel universal tomar a área da atividade.
26. MUST NOT usar texto de 9–10px para compensar excesso de informação essencial.
27. MUST NOT esconder ação crítica exclusivamente em hover.
28. MUST NOT abrir modal para tarefa social contínua que cabe em sheet/drawer.
29. MUST NOT disparar animação contínua que concorra com mídia/jogo.
30. MUST NOT mudar contratos de playback, signaling, auth ou game state por estética.
31. MUST NOT copiar composição, ativos ou identidade de produtos de referência.
32. MUST NOT declarar uma tela auditada visualmente com base só em código ou captura histórica.

Teste de cheiro de dashboard: se tela acumula ≥3 entre cards aninhados, múltiplos cabeçalhos, métricas permanentes, sidebar+toolbar+dock, breadcrumbs repetidos e botão primário distante da atividade, voltar ao desenho. Teste “remove the box”: se espaço e tipografia resolvem, retirar borda. Teste “could this be work software?”: em Home/Media/Games, se sim, falta protagonismo da atividade; Utility é exceção.
