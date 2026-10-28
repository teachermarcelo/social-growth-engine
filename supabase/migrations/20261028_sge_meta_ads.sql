-- Social Growth Engine: isolated Meta Ads OAuth and campaign review tables.
-- Adds new SGE-prefixed tables only; does not alter existing application tables.

create table if not exists public.sge_meta_ads_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sge_meta_ads_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_user_id text,
  ad_account_id text not null,
  ad_account_name text,
  account_status integer,
  currency char(3) not null default 'BRL',
  timezone_name text,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ad_account_id)
);

create table if not exists public.sge_meta_ads_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ad_account_id text not null,
  campaign_id text,
  adset_id text,
  ad_id text,
  campaign_name text not null,
  objective text not null default 'OUTCOME_TRAFFIC',
  destination_url text,
  budget_amount numeric(12,2) not null check (budget_amount > 0),
  budget_currency char(3) not null default 'BRL',
  start_date date not null,
  end_date date not null,
  targeting_summary jsonb not null default '{}'::jsonb,
  review_status text not null default 'draft'
    check (review_status in ('draft','approved','rejected','created_paused','active','failed')),
  approval_phrase text,
  approved_at timestamptz,
  meta_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists sge_meta_ads_states_expiry_idx
  on public.sge_meta_ads_oauth_states (expires_at);
create index if not exists sge_meta_ads_connections_user_idx
  on public.sge_meta_ads_connections (user_id);
create index if not exists sge_meta_ads_jobs_user_status_idx
  on public.sge_meta_ads_jobs (user_id, review_status, created_at desc);

alter table public.sge_meta_ads_oauth_states enable row level security;
alter table public.sge_meta_ads_connections enable row level security;
alter table public.sge_meta_ads_jobs enable row level security;

revoke all on public.sge_meta_ads_oauth_states from anon, authenticated;
revoke all on public.sge_meta_ads_connections from anon, authenticated;
revoke all on public.sge_meta_ads_jobs from anon, authenticated;

grant all on public.sge_meta_ads_oauth_states to service_role;
grant all on public.sge_meta_ads_connections to service_role;
grant all on public.sge_meta_ads_jobs to service_role;
