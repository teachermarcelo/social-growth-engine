# Social Growth Engine

Painel semiautomático para planejar conteúdo de Instagram e YouTube, gerar ideias de ganchos, registrar métricas e exportar relatórios. A interface é estática para GitHub Pages; integrações que exigem tokens usam funções backend e secrets protegidos.

## Estado desta versão

- Interface responsiva com navegação por seções.
- Planejamento de conteúdo com filtros, edição e exclusão.
- Fase 1: cadastro de segmentos e geração de termos de pesquisa, links para resultados públicos do YouTube e Instagram, registro de oportunidades e envio de oportunidades ao planejador.
- Fase 2: planejamento de campanhas orgânicas/pagas com objetivo, segmento, datas, orçamento, meta, notas e status; nenhuma campanha é ativada automaticamente.
- Gerador local de sugestões de ganchos e chamadas para ação.
- Registro manual de visualizações, alcance, curtidas, comentários, compartilhamentos, seguidores ganhos e retenção.
- Indicadores agregados e exportação CSV.
- Backup e restauração JSON.
- Dados guardados no `localStorage` do navegador e sincronização opcional com Supabase por conta autenticada.
- Tabelas exclusivas `sge_posts`, `sge_metrics`, `sge_segments`, `sge_opportunities` e `sge_campaigns`, com RLS para separar os dados de cada usuário.
- Mesclagem de dados locais e da nuvem no login; exportação JSON continua disponível como backup.
- Integração Instagram: esta branch inclui o fluxo inicial de OAuth oficial e o armazenamento criptografado do token no backend; ainda exige projeto Supabase dedicado, secrets, configuração do app Meta e teste real antes de conectar.
- YouTube: ainda sem integração de API.
- Nenhuma publicação automática está ativa; o fluxo é semiautomático e exige revisão/aprovação humana.

## Executar localmente

1. Baixe ou clone o repositório.
2. Abra `index.html` no navegador. Para um servidor local, use a extensão Live Server do VS Code ou `python -m http.server 8000`.
3. Acesse `http://localhost:8000` quando usar o servidor local.

Não há dependências de build nem chaves necessárias para a versão local.

## Publicar com GitHub Pages

1. Este projeto já está no repositório `teachermarcelo/social-growth-engine`; mantenha-o separado de `teacher-plataforma` e dos demais projetos.
2. Para testar as alterações desta branch, abra um Pull Request de `feat/secure-meta-oauth` para `main` e revise antes de mesclar.
3. Abra **Settings → Pages** e confirme a configuração de publicação.
4. O workflow em `.github/workflows/pages.yml` valida o JavaScript e publica o site quando houver push em `main`.
5. O endereço de publicação fica nas configurações do Pages. Não publique secrets no repositório.

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

## Supabase: configuração aplicada

O app usa o cliente JavaScript oficial via CDN, o Project URL e uma chave publicável (não secreta). O app exige que a URL do projeto Supabase dedicado e a chave publicável sejam informadas em **Configurações → Sincronização na nuvem**. Nenhum projeto antigo é selecionado automaticamente. O acesso às tabelas de conteúdo deve ser protegido por RLS para que cada usuário autenticado veja apenas os próprios registros. A migração `supabase/migrations/20261028_sge_meta_oauth.sql` adiciona tabelas privadas para OAuth e não deve ser aplicada a nenhum outro projeto.

1. Abra **Configurações → Sincronização na nuvem**.
2. Crie uma conta com e-mail e senha; se a confirmação por e-mail estiver ativa, confirme o endereço antes de entrar.
3. Ao entrar, o app mescla os dados locais com os registros remotos por ID e envia os registros locais para a nuvem.
4. Continue exportando backups JSON periodicamente.

A sincronização foi implementada, mas ainda depende de um teste no navegador com uma conta real. O GitHub Pages é estático; a chave publicável é destinada ao navegador, e nenhum segredo `service_role`, senha de banco ou token privado foi adicionado ao repositório.

## Próximas etapas para integração real

### Instagram

- O código inicial está em `supabase/functions/meta-oauth/index.ts` e a migração em `supabase/migrations/20261028_sge_meta_oauth.sql`.
- Siga `INTEGRATION-SETUP.md` para configurar app Meta, redirect URI, secrets, criptografia e publicar a Edge Function.
- A função deve ser implantada com validação JWT do gateway desativada (`verify_jwt=false`) porque o callback OAuth vem da Meta; a rota de início valida manualmente o JWT do usuário e o callback valida um state aleatório de uso único.
- A integração não está ativa até o backend e os secrets serem configurados e testados. A aprovação humana permanece obrigatória.

### YouTube

- Criar projeto no Google Cloud e habilitar YouTube Data API e, quando necessário, YouTube Analytics API.
- Configurar OAuth 2.0 para o canal.
- Executar chamadas autenticadas no backend; tratar quotas, erros e consentimento.
- Respeitar limites de API e políticas de upload/analytics.

**Segurança:** nunca coloque client secrets, access tokens, refresh tokens ou chaves privadas em `app.js`, em commits públicos ou em variáveis expostas ao browser. Uma integração de produção deve usar backend com segredos protegidos, política de privacidade e controles de acesso.

## Limitações conhecidas

- `localStorage` é específico do navegador e do dispositivo; não sincroniza entre computador e celular.
- Os dados podem ser perdidos ao limpar o armazenamento do navegador. Exporte backups regularmente.
- As sugestões de descoberta são termos de pesquisa derivados localmente do segmento; o app abre resultados oficiais para inspeção humana. Não há coleta automática de conteúdo nem um modelo de IA conectado.
- GitHub Pages hospeda conteúdo estático; não é um servidor seguro para armazenar credenciais nem executar tarefas backend privadas.
- O fluxo Meta nesta branch ainda não está implantado nem validado com credenciais reais. Não aplique a migração a projetos Supabase usados por Fluent Immersion, Inglês para Nações ou outros produtos.
- A descoberta usa links públicos e a Fase 2 organiza campanhas sem ativar anúncios. Não há API social conectada nem coleta automática. A sincronização das novas tabelas precisa ser validada no navegador com uma conta real.
