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
