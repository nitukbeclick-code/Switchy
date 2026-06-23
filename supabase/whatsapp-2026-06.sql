-- WhatsApp AI agent + CRM data layer (2026-06).
-- Three tables: contact (CRM pipeline) / conversation (intent + memory) /
-- message (transcript + idempotency). RLS is enabled with NO client policies —
-- only the service_role (the whatsapp-webhook bot + the crm-api edge fn) reaches
-- these; the Flutter app never queries them directly (it goes through crm-api).
--
-- IMPORTANT: this project's default privileges do NOT grant to service_role, so
-- relying on them silently 403s (the documented 2026-06 incident — see
-- schema.sql §grants, chat_messages/bill_analyses carry the same note). Grant
-- explicitly. Idempotent / re-runnable.

create table if not exists public.whatsapp_contacts (
  id                 uuid primary key default gen_random_uuid(),
  wa_phone           text not null unique,             -- E.164 digits from messages[].from
  wa_name            text,                             -- contacts[0].profile.name
  status             text not null default 'new',      -- new/active/qualified/handed_off/won/lost/blocked
  assigned_tg_id     bigint,
  assigned_name      text,
  lead_id            uuid references public.leads(id) on delete set null,
  profile_id         uuid references public.profiles(id) on delete set null,
  opted_in_marketing boolean not null default false,
  last_inbound_at    timestamptz,                      -- last customer message (drives the 24h window)
  last_message_at    timestamptz,                      -- last message either direction
  created_at         timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references public.whatsapp_contacts(id) on delete cascade,
  status          text not null default 'open',        -- open/bot/human/closed
  intent          text,                                -- qa/recommend/bill/human/greeting
  ai_state        jsonb not null default '{}'::jsonb,  -- advisor answers gathered, last category…
  assigned_tg_id  bigint,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  contact_id      uuid not null references public.whatsapp_contacts(id) on delete cascade,
  direction       text not null,                       -- in / out
  actor           text not null,                       -- customer / bot / rep
  msg_type        text not null default 'text',        -- text/image/interactive/template/system
  body            text,                                -- text/caption only; NEVER base64 bytes
  wa_message_id   text unique,                         -- Meta wamid — idempotency key (in & out)
  status          text,                                -- received | sent/delivered/read/failed
  created_at      timestamptz not null default now()
);

create index if not exists wa_contacts_phone_idx  on public.whatsapp_contacts (wa_phone);
create index if not exists wa_contacts_status_idx on public.whatsapp_contacts (status, last_message_at desc);
create index if not exists wa_conv_contact_idx    on public.whatsapp_conversations (contact_id, created_at desc);
create index if not exists wa_msg_conv_idx        on public.whatsapp_messages (conversation_id, created_at desc);
create index if not exists wa_msg_wamid_idx       on public.whatsapp_messages (wa_message_id);

alter table public.whatsapp_contacts      enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages      enable row level security;

-- Explicit service_role grants (default privileges do NOT grant here).
grant select, insert, update, delete on public.whatsapp_contacts      to service_role;
grant select, insert, update, delete on public.whatsapp_conversations to service_role;
grant select, insert, update, delete on public.whatsapp_messages      to service_role;
