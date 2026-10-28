-- Social Growth Engine tables isolated by sge_ prefix inside ingles-para-nacoes.
-- This migration creates new tables only; it does not alter existing application tables.
create table if not exists public.sge_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Multiple Instagram accounts can be connected by the same SGE user.
create table if not exists public.sge_meta_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instagram_user_id text not null,
  instagram_username text,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, instagram_user_id)
);

create table if not exists public.sge_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null default 'instagram' check (platform in ('instagram','youtube','meta_ads')),
  objective text not null default 'traffic',
  destination_url text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','active','paused','completed','archived')),
  budget_amount numeric(12,2) check (budget_amount is null or budget_amount >= 0),
  budget_currency char(3) not null default 'BRL',
  audience_config jsonb not null default '{}'::jsonb,
  approval_required boolean not null default true,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sge_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.sge_campaigns(id) on delete set null,
  platform text not null,
  metric_date date not null default current_date,
  impressions bigint not null default 0 check (impressions >= 0),
  reach bigint not null default 0 check (reach >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  conversions bigint not null default 0 check (conversions >= 0),
  spend_amount numeric(12,2) not null default 0 check (spend_amount >= 0),
  currency char(3) not null default 'BRL',
  extra_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sge_automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null default 'instagram',
  trigger_type text not null,
  action_type text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  requires_approval boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sge_oauth_states_expiry_idx on public.sge_oauth_states (expires_at);
create index if not exists sge_meta_connections_user_idx on public.sge_meta_connections (user_id);
create index if not exists sge_campaigns_user_status_idx on public.sge_campaigns (user_id, status);
create index if not exists sge_metrics_user_date_idx on public.sge_metrics (user_id, metric_date desc);
create index if not exists sge_automation_rules_user_enabled_idx on public.sge_automation_rules (user_id, enabled);

alter table public.sge_oauth_states enable row level security;
alter table public.sge_meta_connections enable row level security;
alter table public.sge_campaigns enable row level security;
alter table public.sge_metrics enable row level security;
alter table public.sge_automation_rules enable row level security;

-- All reads/writes are server-side only until user-scoped RLS policies are designed.
revoke all on public.sge_oauth_states from anon, authenticated;
revoke all on public.sge_meta_connections from anon, authenticated;
revoke all on public.sge_campaigns from anon, authenticated;
revoke all on public.sge_metrics from anon, authenticated;
revoke all on public.sge_automation_rules from anon, authenticated;

grant all on public.sge_oauth_states to service_role;
grant all on public.sge_meta_connections to service_role;
grant all on public.sge_campaigns to service_role;
grant all on public.sge_metrics to service_role;
grant all on public.sge_automation_rules to service_role;
