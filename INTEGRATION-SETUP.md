# Social Growth Engine — implantação e integração segura

## Estado da primeira versão

O repositório `teachermarcelo/social-growth-engine` já contém um painel estático para calendário de conteúdo, descoberta assistida, campanhas, registro manual de métricas, exportação CSV/JSON e sincronização Supabase existente. Esta branch adiciona o primeiro fluxo de OAuth oficial do Instagram, com aprovação humana e armazenamento criptografado do token no backend.

## Arquitetura

- **Interface:** GitHub Pages (HTML/CSS/JS). Não guardar segredos no browser.
- **Banco:** projeto existente `ingles-para-nacoes` (`rvgcniaowzmsudzliozf`). A migração cria apenas tabelas novas com prefixo `sge_`, sem alterar tabelas de outros sistemas.
- **Backend:** Supabase Edge Function `meta-oauth`; troca o código OAuth e armazena o token criptografado com AES-GCM.
- **Instagram:** Instagram API with Instagram Login para contas profissionais elegíveis. A Meta precisa aprovar as permissões e o app antes de uso em produção.
- **YouTube:** integração não incluída nesta etapa. Próxima etapa: Google Cloud OAuth + YouTube Data API/YouTube Analytics API.

## Pré-requisitos

1. Use o projeto Supabase `ingles-para-nacoes` configurado para esta implantação. A migração já foi aplicada nele. Ela cria tabelas novas `sge_*`; não apague nem substitua tabelas existentes.
2. No Meta for Developers, configure um app e Instagram API with Instagram Login. Use uma conta Instagram profissional elegível.
3. Cadastre como redirect URI a URL exata da Edge Function:
   `https://<PROJECT_REF>.supabase.co/functions/v1/meta-oauth?action=callback`
4. Gere uma chave de criptografia aleatória de 32 bytes (por exemplo, no terminal com `openssl rand -base64 32`) e guarde-a em um gerenciador de senhas.
5. Defina os secrets no Supabase Edge Functions (não no GitHub):
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_REDIRECT_URI` (URL exata acima)
   - `META_TOKEN_ENCRYPTION_KEY` (Base64 de 32 bytes aleatórios)
   - `APP_BASE_URL` (URL do GitHub Pages, ex. `https://teachermarcelo.github.io/social-growth-engine/`)
   - `SUPABASE_ANON_KEY` se não estiver disponível no runtime da função.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e, quando disponível, `SUPABASE_ANON_KEY` são fornecidos pelo runtime Supabase. Nunca copie a service-role para o navegador.
6. A migração `supabase/migrations/20261028_sge_meta_oauth.sql` foi aplicada no projeto `ingles-para-nacoes`. Se for reaplicada em outro ambiente, confira o `project_id` antes.
7. Publique `supabase/functions/meta-oauth/index.ts` como função `meta-oauth`. Configure `verify_jwt=false` no gateway para esta função: o callback de OAuth da Meta não envia JWT; a rota `action=start` valida manualmente a sessão e a rota callback exige um state aleatório, expirado em 10 minutos e de uso único.
8. No painel, entre na conta de sincronização e informe a URL da função `https://<PROJECT_REF>.supabase.co/functions/v1/meta-oauth`, depois clique em **Conectar Instagram**.
9. Teste com uma conta de função/teste antes de solicitar acesso avançado. Confirme no painel Meta as permissões exigidas e a disponibilidade atual de cada escopo.

## Segurança

- A migração ativa RLS e não cria políticas para `anon` ou `authenticated`; apenas o backend com service role acessa as tabelas OAuth.
- O token é criptografado com AES-GCM antes de ser persistido. A chave de criptografia deve existir apenas como secret do backend e ser respaldada em local seguro.
- A URL do projeto e a chave publicável do Supabase não são segredos; a chave service-role, App Secret, tokens e chave de criptografia são secretos.
- Nunca adicionar tokens ou segredos a `app.js`, `.env` versionado, commits ou issues públicas.
- O fluxo OAuth usa estado aleatório de curta duração, de uso único, associado ao usuário autenticado.
- A conexão ainda não publica conteúdo nem responde automaticamente. A publicação/analytics será adicionada após validar login, permissões e testes reais. A aprovação humana permanece obrigatória.

## Fluxo de trabalho

1. Gerar e revisar ideia/roteiro no painel.
2. Salvar o conteúdo como rascunho e aprovar manualmente.
3. A próxima fase poderá enviar conteúdo aprovado à API oficial; nenhuma ação será disparada sem clique de confirmação.
4. Registrar/consultar métricas somente dentro dos endpoints e permissões autorizados.

## Observação sobre banco existente

A interface exige configuração explícita do projeto Supabase. Para esta implantação, use o projeto `ingles-para-nacoes` (`rvgcniaowzmsudzliozf`). As tabelas `sge_*` foram criadas com RLS e sem políticas de cliente; apenas a função backend com service role pode acessá-las nesta fase. Isso protege os tokens, mas o dashboard ainda precisa de uma camada de backend/API para ler e gravar campanhas e métricas.


## Meta Marketing API — campanhas pagas (fase inicial, estrutura pausada)

A função `meta-ads` está publicada no projeto Supabase `rvgcniaowzmsudzliozf` e o painel contém uma seção para conectar contas de anúncios. A função ainda depende de credenciais e permissões configuradas pelo proprietário no Meta for Developers.

### Redirect URI e secrets

Cadastre esta URI de redirecionamento no produto Facebook Login/OAuth do aplicativo Meta e copie exatamente a mesma URL para o secret `META_ADS_REDIRECT_URI`:

```
https://rvgcniaowzmsudzliozf.supabase.co/functions/v1/meta-ads?action=callback
```

Secrets necessários nas Edge Functions do Supabase:
- `META_APP_ID` — App ID do aplicativo Meta.
- `META_APP_SECRET` — App Secret do aplicativo Meta.
- `META_ADS_REDIRECT_URI` — URI exata acima.
- `META_TOKEN_ENCRYPTION_KEY` — reutiliza a chave AES-GCM de 32 bytes em Base64 usada para criptografar tokens; nunca expor no browser.
- `APP_BASE_URL` — `https://teachermarcelo.github.io/social-growth-engine/`.
- `META_GRAPH_API_VERSION` — opcional; o código usa `v25.0` por padrão.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` são fornecidos pelo runtime Supabase.

Solicita apenas `ads_read` e `ads_management` para esta fase. O aplicativo pode precisar de App Review/nível de acesso adequado para uso fora dos próprios ativos. O acesso é decidido pela Meta, não pelo código.

### O que a primeira fase faz

1. OAuth de Facebook/Meta com state aleatório de uso único e expiração curta.
2. Descobre as contas de anúncios às quais o usuário autenticado tem acesso.
3. Guarda o token criptografado no backend; as tabelas privadas têm RLS e só concedem acesso ao `service_role`.
4. Depois de uma confirmação textual explícita, cria uma campanha de tráfego e um conjunto em estado `PAUSED`, com orçamento vitalício e datas obrigatórias.
5. O orçamento aceito nesta primeira versão é de R$ 20 a R$ 10.000 por estrutura, com período de até 90 dias; apenas contas em BRL e com status ativo são aceitas.
6. A segmentação enviada inicialmente é Brasil + faixa etária (18–65). Região/interesses digitados no formulário são guardados como notas, não aplicados como targeting.
7. Não cria criativo nem anúncio, não ativa campanhas e não executa ações de ativação. A fase de criativos, revisão final e ativação com nova confirmação explícita ainda precisa ser implementada.

### Importante

A criação de uma campanha/conjunto pausados é uma chamada real à API e cria objetos no Gerenciador de Anúncios, mas não deve entregar anúncios sem criativo/anúncio e sem ativação. Verifique os objetos no Ads Manager. Não tente novamente se a função indicar criação parcial; confira primeiro o ID da campanha retornado para evitar duplicação.

A migration `20261028_sge_meta_ads.sql` adiciona somente tabelas novas com prefixo `sge_meta_ads_`; ela foi aplicada ao projeto `ingles-para-nacoes` sem alterar tabelas existentes.


## Rastreamento próprio de tráfego — sem API de anúncios

A função `sge-tracking` está publicada no projeto Supabase `rvgcniaowzmsudzliozf`. A migration `20261029_sge_tracking.sql` cria somente tabelas novas com prefixo `sge_tracking_`, com RLS habilitado e acesso direto revogado para `anon` e `authenticated`. A função valida JWT nas ações de gestão e registra eventos públicos apenas por uma chave pública de workspace.

### O que mede

- Cliques em links rastreáveis criados no painel, redirecionando para destinos HTTPS.
- Visualizações de página, visualizações de produto, cliques em CTA e cliques de lead quando o pixel é instalado no site.
- Origem, meio e campanha (UTM), host de referência e caminho da página.
- Resumo dos últimos 30 dias e cliques por link.

### Como usar

1. Entre na conta na seção Configurações.
2. Abra Análise de desempenho e clique em **Ativar rastreamento**.
3. Crie um link rastreável para a página do kit e use esse link na bio, nos Stories, em descrições de vídeos e em mensagens.
4. Para medir visitas dentro da página de vendas, copie o pixel gerado e instale-o antes de `</body>`. Marque o elemento que identifica o produto com `data-sge-product`, os botões de ação com `data-sge-cta` e os links/formulários de captação com `data-sge-lead`.
5. Volte ao painel e atualize os números. Cliques contam quando o redirecionamento rastreável é acionado; visitas da página só aparecem após instalar o pixel.

O pixel não registra nomes, e-mails ou endereços IP. A chave pública identifica o workspace e permite enviar eventos; por isso, a função valida os tipos de evento e aplica um limite simples por visitante. Para conformidade com a LGPD, informe o uso de analytics na política de privacidade e respeite as escolhas de consentimento aplicáveis.

**Limitações:** isso não revela quem clicou, não coleta impressões dentro do Instagram e não descobre automaticamente perfis pessoais. Para métricas internas do Instagram, é necessária autorização oficial da API; para mostrar conteúdo a públicos frios com segmentação garantida, é necessário usar uma plataforma de anúncios. O rastreamento próprio não tem taxa por API, mas o uso do Supabase está sujeito aos limites do plano.
