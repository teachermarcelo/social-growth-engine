create table if not exists public.sge_tracking_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  public_key uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sge_tracking_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code uuid not null unique default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 120),
  destination_url text not null check (destination_url ~ '^https://'),
  source text not null default 'social',
  medium text not null default 'organic',
  campaign text not null default 'fluent-immersion',
  created_at timestamptz not null default now()
);
create table if not exists public.sge_tracking_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.sge_tracking_workspaces(id) on delete set null,
  link_id uuid references public.sge_tracking_links(id) on delete set null,
  event_type text not null check (event_type in ('page_view','product_view','cta_click','lead_click','outbound_click')),
  visitor_id text, page_path text, referrer_host text, source text, medium text, campaign text, content text, term text,
  created_at timestamptz not null default now()
);
create index if not exists sge_tracking_events_owner_created_idx on public.sge_tracking_events(owner_user_id, created_at desc);
create index if not exists sge_tracking_events_owner_type_created_idx on public.sge_tracking_events(owner_user_id, event_type, created_at desc);
create index if not exists sge_tracking_events_link_idx on public.sge_tracking_events(link_id, created_at desc);
create index if not exists sge_tracking_events_public_rate_idx on public.sge_tracking_events(workspace_id, visitor_id, created_at desc);
alter table public.sge_tracking_workspaces enable row level security;
alter table public.sge_tracking_links enable row level security;
alter table public.sge_tracking_events enable row level security;
revoke all on public.sge_tracking_workspaces from anon, authenticated;
revoke all on public.sge_tracking_links from anon, authenticated;
revoke all on public.sge_tracking_events from anon, authenticated;
grant all on public.sge_tracking_workspaces to service_role;
grant all on public.sge_tracking_links to service_role;
grant all on public.sge_tracking_events to service_role;
grant usage, select on sequence public.sge_tracking_events_id_seq to service_role;
