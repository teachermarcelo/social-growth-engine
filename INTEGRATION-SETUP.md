# Social Growth Engine — implantação e integração segura

## Estado da primeira versão

O repositório `teachermarcelo/social-growth-engine` já contém um painel estático para calendário de conteúdo, descoberta assistida, campanhas, registro manual de métricas, exportação CSV/JSON e sincronização Supabase existente. Esta branch adiciona o primeiro fluxo de OAuth oficial do Instagram, com aprovação humana e armazenamento criptografado do token no backend.

## Arquitetura

- **Interface:** GitHub Pages (HTML/CSS/JS). Não guardar segredos no browser.
- **Banco:** projeto Supabase exclusivo do Social Growth Engine. A migração abaixo cria apenas tabelas `sge_*` privadas para estado OAuth e conexão Meta.
- **Backend:** Supabase Edge Function `meta-oauth`; troca o código OAuth e armazena o token criptografado com AES-GCM.
- **Instagram:** Instagram API with Instagram Login para contas profissionais elegíveis. A Meta precisa aprovar as permissões e o app antes de uso em produção.
- **YouTube:** integração não incluída nesta etapa. Próxima etapa: Google Cloud OAuth + YouTube Data API/YouTube Analytics API.

## Pré-requisitos

1. Confirme/crie um projeto Supabase exclusivo para este app. **Não aplique a migração em Fluent Immersion, Inglês para Nações ou qualquer outro projeto.**
2. No Meta for Developers, configure um app e Instagram API with Instagram Login. Use uma conta Instagram profissional elegível.
3. Cadastre como redirect URI a URL exata da Edge Function:
   `https://<PROJECT_REF>.supabase.co/functions/v1/meta-oauth?action=callback`
4. Defina os secrets no Supabase Edge Functions (não no GitHub):
   - `META_APP_ID`
   - `META_APP_SECRET`
   - `META_REDIRECT_URI` (URL exata acima)
   - `META_TOKEN_ENCRYPTION_KEY` (Base64 de 32 bytes aleatórios)
   - `APP_BASE_URL` (URL do GitHub Pages, ex. `https://teachermarcelo.github.io/social-growth-engine/`)
   - `SUPABASE_ANON_KEY` se não estiver disponível no runtime da função.
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo Supabase no runtime hospedado.
5. Aplique `supabase/migrations/20261028_sge_meta_oauth.sql` **somente** no projeto dedicado.
6. Publique a função `supabase/functions/meta-oauth/index.ts`.
7. No painel, entre na conta de sincronização e informe a URL da função `https://<PROJECT_REF>.supabase.co/functions/v1/meta-oauth`, depois clique em **Conectar Instagram**.
8. Teste com uma conta de função/teste antes de solicitar acesso avançado. Confirme no painel Meta as permissões exigidas e a disponibilidade atual de cada escopo.

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

A versão anterior do app já continha uma URL Supabase em `app.js`, mas não foi possível confirmar o acesso/estado desse projeto por meio da conexão disponível. Esta branch **não modifica nenhum banco**. Antes de ativar sync na nuvem e OAuth, confirme que `SUPABASE_URL` da interface aponta para o projeto exclusivo do Social Growth Engine e valide as tabelas existentes. Não substitua o projeto sem migrar/confirmar os dados.
