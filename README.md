# Social Growth Engine

Painel semiautomático para planejar conteúdo de Instagram e YouTube, gerar ideias de ganchos, registrar métricas e exportar relatórios. Protótipo estático em HTML, CSS e JavaScript puro, adequado para GitHub Pages.

## Estado desta versão

- Interface responsiva com navegação por seções.
- Planejamento de conteúdo com filtros, edição e exclusão.
- Gerador local de sugestões de ganchos e chamadas para ação.
- Registro manual de visualizações, alcance, curtidas, comentários, compartilhamentos, seguidores ganhos e retenção.
- Indicadores agregados e exportação CSV.
- Backup e restauração JSON.
- Dados guardados no `localStorage` do navegador atual.
- **Não há conexão configurada com Instagram/Meta ou YouTube APIs.** Nenhuma publicação é enviada automaticamente e nenhum indicador é obtido diretamente das plataformas.

## Executar localmente

1. Baixe ou clone o repositório.
2. Abra `index.html` no navegador. Para um servidor local, use a extensão Live Server do VS Code ou `python -m http.server 8000`.
3. Acesse `http://localhost:8000` quando usar o servidor local.

Não há dependências de build nem chaves necessárias para a versão local.

## Publicar com GitHub Pages

1. Crie um **repositório novo** chamado `social-growth-engine` na sua conta GitHub.
2. Envie todos os arquivos e pastas deste pacote para a raiz do repositório.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**, branch `main` e pasta `/ (root)`.
5. Salve e aguarde o GitHub publicar o site. O endereço exato será mostrado nas configurações do Pages.

Mantenha este projeto separado dos seus repositórios existentes. Não copie arquivos sobre `teacher-plataforma` e não altere tabelas ou credenciais do Supabase existente.

## Como usar

1. Em **Estúdio de conteúdo**, informe um tema, plataforma, formato e objetivo.
2. Gere ganchos e adapte o texto à publicação real.
3. Salve no planejamento e acompanhe o status.
4. Publique manualmente na rede social.
5. Após um período consistente, registre as métricas disponíveis em **Análise de desempenho**.
6. Exporte CSV para análise externa ou JSON para backup.

## Métricas e interpretação

A taxa agregada de engajamento por visualização é calculada como:

`(curtidas + comentários + compartilhamentos) / visualizações × 100`

É uma métrica de comparação simplificada, não necessariamente igual às taxas oficiais de cada plataforma. O alcance pode não ser equivalente a visualizações. Evite comparar formatos, períodos e públicos muito diferentes.

## Próximas etapas para integração real

### Instagram

- Avaliar os requisitos atuais da Meta Platform API para o tipo de conta e os recursos pretendidos.
- Implementar autenticação OAuth, permissões aprovadas e fluxo de renovação de tokens.
- Usar backend para guardar tokens em segredos/variáveis de ambiente.
- Implementar apenas endpoints de publicação e insights autorizados para a conta e o tipo de mídia.

### YouTube

- Criar projeto no Google Cloud e habilitar YouTube Data API e, quando necessário, YouTube Analytics API.
- Configurar OAuth 2.0 para o canal.
- Executar chamadas autenticadas no backend; tratar quotas, erros e consentimento.
- Respeitar limites de API e políticas de upload/analytics.

**Segurança:** nunca coloque client secrets, access tokens, refresh tokens ou chaves privadas em `app.js`, em commits públicos ou em variáveis expostas ao browser. Uma integração de produção deve usar backend com segredos protegidos, política de privacidade e controles de acesso.

## Limitações conhecidas

- `localStorage` é específico do navegador e do dispositivo; não sincroniza entre computador e celular.
- Os dados podem ser perdidos ao limpar o armazenamento do navegador. Exporte backups regularmente.
- As sugestões são modelos locais baseados no tema, não um modelo de IA conectado.
- GitHub Pages hospeda conteúdo estático; não é um servidor seguro para armazenar credenciais nem executar tarefas backend privadas.
- Esta versão ainda não foi conectada a contas sociais nem submetida a testes de API externa.
