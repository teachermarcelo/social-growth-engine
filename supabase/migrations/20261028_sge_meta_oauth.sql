-- Social Growth Engine: private Meta OAuth storage.
-- Apply only to the dedicated Social Growth Engine Supabase project.
create table if not exists public.sge_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sge_meta_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  instagram_user_id text,
  instagram_username text,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sge_oauth_states enable row level security;
alter table public.sge_meta_connections enable row level security;

-- Intentionally create no client-facing policies for these tables.
-- Only the server-side Edge Function using the service role may access them.
revoke all on public.sge_oauth_states from anon, authenticated;
revoke all on public.sge_meta_connections from anon, authenticated;
grant all on public.sge_oauth_states to service_role;
grant all on public.sge_meta_connections to service_role;

create index if not exists sge_oauth_states_expiry_idx
  on public.sge_oauth_states (expires_at);
