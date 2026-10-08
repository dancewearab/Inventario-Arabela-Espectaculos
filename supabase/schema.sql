-- ============================================================
-- ArabelaEspectaculos MVP - Supabase SQL Schema
-- Ejecutar en el SQL Editor de Supabase (en orden)
-- ============================================================

-- ── 1. EXTENSIONES ──────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 2. ENUM TYPES ───────────────────────────────────────────
create type costume_status as enum (
  'available', 'borrowed', 'reserved', 'washing', 'repair', 'lost'
);

create type user_role as enum ('admin', 'coordinator', 'dancer');

create type movement_action as enum (
  'checkout', 'return', 'send_wash', 'send_repair',
  'mark_lost', 'damage_report', 'status_change', 'assign'
);

create type damage_severity as enum ('low', 'medium', 'high');

-- ── 3. TABLA USERS ──────────────────────────────────────────
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        user_role not null default 'dancer',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.users enable row level security;

-- ── 4. TABLA EVENTS ─────────────────────────────────────────
create table public.events (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  date            date not null,
  location        text,
  description     text,
  coordinator_id  uuid not null references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.events enable row level security;
create index idx_events_date on public.events(date);
create index idx_events_coordinator on public.events(coordinator_id);

-- ── 5. TABLA COSTUMES ───────────────────────────────────────
create table public.costumes (
  id                  uuid primary key default uuid_generate_v4(),
  code                text not null unique,
  qr_token            text unique,
  name                text not null,
  category            text not null,
  size                text not null,
  description         text,
  photos              text[] default '{}',
  status              costume_status not null default 'available',
  location            text,
  current_holder_id   uuid references public.users(id) on delete set null,
  current_event_id    uuid references public.events(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.costumes enable row level security;
create index idx_costumes_status on public.costumes(status);
create index idx_costumes_code on public.costumes(code);
create index idx_costumes_category on public.costumes(category);
create index idx_costumes_holder on public.costumes(current_holder_id);

-- ── 6. TABLA COSTUME_MOVEMENTS ──────────────────────────────
create table public.costume_movements (
  id          uuid primary key default uuid_generate_v4(),
  costume_id  uuid not null references public.costumes(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete set null,
  event_id    uuid references public.events(id) on delete set null,
  action      movement_action not null,
  notes       text,
  photo_url   text,
  created_at  timestamptz not null default now()
);

alter table public.costume_movements enable row level security;
create index idx_movements_costume on public.costume_movements(costume_id);
create index idx_movements_user on public.costume_movements(user_id);
create index idx_movements_created on public.costume_movements(created_at desc);

-- ── 7. TABLA EVENT_COSTUMES ─────────────────────────────────
create table public.event_costumes (
  id          uuid primary key default uuid_generate_v4(),
  event_id    uuid not null references public.events(id) on delete cascade,
  costume_id  uuid not null references public.costumes(id) on delete cascade,
  dancer_id   uuid references public.users(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique(event_id, costume_id)
);

alter table public.event_costumes enable row level security;
create index idx_event_costumes_event on public.event_costumes(event_id);
create index idx_event_costumes_costume on public.event_costumes(costume_id);

-- ── 8. TABLA DAMAGE_REPORTS ─────────────────────────────────
create table public.damage_reports (
  id           uuid primary key default uuid_generate_v4(),
  costume_id   uuid not null references public.costumes(id) on delete cascade,
  reported_by  uuid not null references public.users(id) on delete set null,
  movement_id  uuid references public.costume_movements(id) on delete set null,
  description  text not null,
  photo_url    text,
  severity     damage_severity not null default 'medium',
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.damage_reports enable row level security;
create index idx_damage_costume on public.damage_reports(costume_id);
create index idx_damage_resolved on public.damage_reports(resolved);
create index idx_damage_created on public.damage_reports(created_at desc);

-- ── 9. TRIGGERS: AUTO updated_at ────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated
  before update on public.users
  for each row execute function update_updated_at();

create trigger trg_costumes_updated
  before update on public.costumes
  for each row execute function update_updated_at();

create trigger trg_events_updated
  before update on public.events
  for each row execute function update_updated_at();

-- ── 10. TRIGGER: AUTO-CREATE USER PROFILE ───────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  user_role_val public.user_role := 'dancer';
  raw_role text;
begin
  if new.raw_user_meta_data is not null then
    raw_role := lower(trim(new.raw_user_meta_data->>'role'));
    if raw_role in ('admin', 'coordinator', 'dancer') then
      user_role_val := raw_role::public.user_role;
    end if;
  end if;

  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, 'usuario'), '@', 1)),
    user_role_val
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 11. RLS POLICIES ────────────────────────────────────────

-- Users: todos pueden ver, solo el propio usuario puede editar
create policy "Users are viewable by authenticated" on public.users
  for select using (auth.role() = 'authenticated');

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- Costumes: todos los autenticados pueden leer
create policy "Costumes viewable by authenticated" on public.costumes
  for select using (auth.role() = 'authenticated');

-- Costumes: coordinadores pueden insertar/actualizar/borrar
create policy "Coordinators (and admins) can insert costumes" on public.costumes
  for insert with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

create policy "Costumes updatable by authenticated" on public.costumes
  for update using (auth.role() = 'authenticated');

create policy "Coordinators (and admins) can delete costumes" on public.costumes
  for delete using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

-- Movements: todos pueden leer y crear
create policy "Movements viewable by authenticated" on public.costume_movements
  for select using (auth.role() = 'authenticated');

create policy "Movements creatable by authenticated" on public.costume_movements
  for insert with check (auth.role() = 'authenticated');

-- Events: todos pueden leer
create policy "Events viewable by authenticated" on public.events
  for select using (auth.role() = 'authenticated');

-- Events: coordinadores pueden crear/editar/borrar
create policy "Coordinators (and admins) manage events" on public.events
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

-- Event costumes: todos pueden leer y coordinadores gestionar
create policy "Event costumes viewable" on public.event_costumes
  for select using (auth.role() = 'authenticated');

create policy "Coordinators (and admins) manage event costumes" on public.event_costumes
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

-- Damage reports: todos pueden leer y crear, coordinadores pueden actualizar
create policy "Damage reports viewable" on public.damage_reports
  for select using (auth.role() = 'authenticated');

create policy "Damage reports creatable" on public.damage_reports
  for insert with check (auth.role() = 'authenticated');

create policy "Coordinators (and admins) can update damage reports" on public.damage_reports
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

-- ── 14. TABLA LISTS Y LIST_ITEMS ─────────────────────────────────
create table public.lists (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lists enable row level security;
create index idx_lists_name on public.lists(name);

create table public.list_items (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references public.lists(id) on delete cascade,
  costume_id uuid not null references public.costumes(id) on delete cascade,
  stock integer not null default 1,
  created_at timestamptz not null default now(),
  unique(list_id, costume_id)
);

alter table public.list_items enable row level security;
create index idx_list_items_list on public.list_items(list_id);
create index idx_list_items_costume on public.list_items(costume_id);

create trigger trg_lists_updated
  before update on public.lists
  for each row execute function update_updated_at();

create policy "Lists viewable by authenticated" on public.lists
  for select using (auth.role() = 'authenticated');
create policy "Coordinators and admins can insert lists" on public.lists
  for insert with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

create policy "Coordinators and admins can update lists" on public.lists
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  ) with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

create policy "Coordinators and admins can delete lists" on public.lists
  for delete using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

create policy "List items viewable" on public.list_items
  for select using (auth.role() = 'authenticated');

create policy "Coordinators and admins can insert list items" on public.list_items
  for insert with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

create policy "Coordinators and admins can update list items" on public.list_items
  for update using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  ) with check (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

create policy "Coordinators and admins can delete list items" on public.list_items
  for delete using (
    exists (select 1 from public.users where id = auth.uid() and role in ('coordinator','admin'))
  );

-- ── 12. STORAGE BUCKET ──────────────────────────────────────
-- Ejecutar esto en el dashboard de Supabase Storage o como SQL:
insert into storage.buckets (id, name, public)
values ('costume-photos', 'costume-photos', true)
on conflict (id) do nothing;

create policy "Costume photos accessible" on storage.objects
  for select using (bucket_id = 'costume-photos');

create policy "Authenticated can upload photos" on storage.objects
  for insert with check (
    bucket_id = 'costume-photos' and auth.role() = 'authenticated'
  );

create policy "Authenticated can update photos" on storage.objects
  for update using (
    bucket_id = 'costume-photos' and auth.role() = 'authenticated'
  );

-- ── 13. SEEDS DE PRUEBA ─────────────────────────────────────
-- NOTA: Primero crea los usuarios en Supabase Auth Dashboard:
--   coordinador@demo.com / Demo1234!  (role: coordinator)
--   bailarin@demo.com    / Demo1234!  (role: dancer)
-- Luego reemplaza los UUIDs aquí con los reales de auth.users

-- Descomentar y ajustar UUIDs después de crear los usuarios:
/*
do $$
declare
  coord_id uuid := '<UUID-DEL-COORDINADOR>';
  dancer_id uuid := '<UUID-DEL-BAILARIN>';
  event1_id uuid := uuid_generate_v4();
  event2_id uuid := uuid_generate_v4();
begin

-- Costumes
insert into public.costumes (code, name, category, size, status, location, description) values
  ('VES-001', 'Vestido Flamenco Rojo', 'Vestido', 'M', 'available', 'Estante A-1', 'Vestido rojo con volantes, bordados dorados'),
  ('VES-002', 'Traje de Ballet Clásico', 'Traje completo', 'S', 'available', 'Estante A-2', 'Tutú blanco con corpino bordado'),
  ('VES-003', 'Falda de Tango', 'Falda', 'M', 'washing', 'Lavandería', 'Falda negra con apertura lateral'),
  ('VES-004', 'Blusa Folclórica Azul', 'Blusa', 'L', 'repair', 'Costurera', 'Mangas bordadas, botones nacarados'),
  ('VES-005', 'Vestido Contemporáneo', 'Vestido', 'XS', 'available', 'Estante B-1', 'Tela fluida color crema'),
  ('VES-006', 'Traje de Danza Árabe', 'Traje completo', 'M', 'borrowed', null, 'Cinturón con monedas plateadas'),
  ('VES-007', 'Calzado de Flamenco', 'Calzado', 'Único', 'available', 'Zapatera C', 'Zapatos de tacón con hebillas'),
  ('VES-008', 'Tocado de Flores', 'Tocado', 'Único', 'available', 'Estante D-1', 'Corona de flores artificiales');

-- Events
insert into public.events (id, name, date, location, description, coordinator_id) values
  (event1_id, 'Gala de Fin de Año', '2025-12-15', 'Teatro Principal', 'Presentación anual de todos los grupos', coord_id),
  (event2_id, 'Festival de Primavera', '2025-05-20', 'Parque Central', 'Evento al aire libre', coord_id);

end $$;
*/
