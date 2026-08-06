-- =============================================================================
-- Painel de Obrigações Acessórias — schema relacional (Supabase / Postgres)
-- =============================================================================
-- Este script substitui o modelo antigo de "documento único" (tabela
-- board_state com uma linha JSONB) por tabelas relacionais, com Row Level
-- Security (RLS) e dois papéis de acesso: admin e membro.
--
-- Rode este script inteiro de uma vez no SQL Editor do Supabase, num projeto
-- novo (ou depois de apagar a tabela antiga board_state, se for migrar um
-- projeto existente — veja o bloco de migração comentado no final).
--
-- O script é seguro para rodar mais de uma vez no mesmo projeto (idempotente):
-- tabelas, políticas, funções e gatilhos são recriados sem gerar erro de
-- "já existe" se você rodar tudo de novo (por exemplo, depois de atualizar
-- este arquivo numa versão futura do painel).
-- =============================================================================

-- Extensão necessária para gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) PERFIS (papéis de acesso: admin | membro)
-- -----------------------------------------------------------------------------
-- Cada usuário autenticado tem um perfil. O perfil é criado automaticamente
-- (via trigger, abaixo) quando você cria a conta da pessoa em
-- Authentication → Users. Por padrão todo mundo entra como "membro"; você
-- promove alguém a "admin" rodando um UPDATE (ver passo 5 do SETUP.md).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'membro' check (role in ('admin','membro')),
  created_at timestamptz not null default now()
);

-- Função auxiliar "is_admin": usada dentro das políticas de segurança para
-- checar o papel do usuário logado sem causar recursão infinita nas regras
-- da própria tabela profiles (por isso é "security definer").
create or replace function is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from profiles where id = uid) = 'admin', false);
$$;

-- Cria o perfil automaticamente quando uma conta nova é criada em
-- Authentication → Users (mantém o fluxo de "admin cadastra a equipe" do
-- painel original, sem cadastro público).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), 'membro')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated"
  on profiles for select
  to authenticated
  using (true);

-- Só admin pode alterar papel/nome de outras pessoas. Qualquer pessoa pode
-- alterar o próprio display_name (mas não o próprio "role" — isso é
-- bloqueado abaixo por um gatilho, para ninguém conseguir se autopromover).
drop policy if exists "profiles_update_admin_or_self" on profiles;
create policy "profiles_update_admin_or_self"
  on profiles for update
  to authenticated
  using (is_admin(auth.uid()) or id = auth.uid())
  with check (is_admin(auth.uid()) or id = auth.uid());

create or replace function prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só bloqueia quando a alteração vem de uma sessão autenticada comum
  -- (front-end, via PostgREST/RLS) e essa pessoa não é admin. Quando
  -- auth.uid() é nulo, a gravação está vindo de fora desse contexto — por
  -- exemplo, do SQL Editor do Supabase, usado no bootstrap do primeiro
  -- administrador (passo 5 do SETUP.md) — e não deve ser bloqueada, pois
  -- quem tem acesso ao SQL Editor do projeto já tem confiança máxima.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin(auth.uid()) then
    raise exception 'Só um administrador pode alterar papéis de acesso.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on profiles;
create trigger trg_prevent_self_role_escalation
  before update on profiles
  for each row execute function prevent_self_role_escalation();

-- -----------------------------------------------------------------------------
-- 2) EMPRESAS
-- -----------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table companies enable row level security;

drop policy if exists "companies_select_authenticated" on companies;
create policy "companies_select_authenticated"
  on companies for select
  to authenticated
  using (true);

drop policy if exists "companies_insert_admin" on companies;
create policy "companies_insert_admin"
  on companies for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "companies_update_admin" on companies;
create policy "companies_update_admin"
  on companies for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "companies_delete_admin" on companies;
create policy "companies_delete_admin"
  on companies for delete
  to authenticated
  using (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 3) OBRIGAÇÕES
-- -----------------------------------------------------------------------------
create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('federal','estadual','municipal','trabalhista','societaria')),
  company_id uuid references companies(id) on delete set null,
  responsible text not null default '',
  frequency text not null check (frequency in ('mensal','trimestral','anual','pontual')),
  day_of_month int check (day_of_month between 1 and 31),
  month int check (month between 1 and 12),
  months int[],
  due_date date,
  notes text not null default '',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frequency_fields_check check (
    (frequency = 'mensal'     and day_of_month is not null) or
    (frequency = 'trimestral' and day_of_month is not null and months is not null) or
    (frequency = 'anual'      and day_of_month is not null and month is not null) or
    (frequency = 'pontual'    and due_date is not null)
  )
);

create index if not exists obligations_company_idx on obligations(company_id);
create index if not exists obligations_frequency_idx on obligations(frequency);

alter table obligations enable row level security;

drop policy if exists "obligations_select_authenticated" on obligations;
create policy "obligations_select_authenticated"
  on obligations for select
  to authenticated
  using (true);

drop policy if exists "obligations_insert_admin" on obligations;
create policy "obligations_insert_admin"
  on obligations for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "obligations_update_admin" on obligations;
create policy "obligations_update_admin"
  on obligations for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "obligations_delete_admin" on obligations;
create policy "obligations_delete_admin"
  on obligations for delete
  to authenticated
  using (is_admin(auth.uid()));

-- Mantém updated_at e updated_by em dia automaticamente a cada UPDATE.
create or replace function touch_obligation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_touch_obligation on obligations;
create trigger trg_touch_obligation
  before update on obligations
  for each row execute function touch_obligation();

-- -----------------------------------------------------------------------------
-- 4) CONCLUSÕES (histórico de "quem concluiu e quando")
-- -----------------------------------------------------------------------------
-- Uma linha por ocorrência concluída (obrigação + data da ocorrência).
-- "unique" impede duplicidade se duas pessoas clicarem "concluir" ao mesmo
-- tempo — a segunda gravação simplesmente falha com erro de duplicidade,
-- em vez de sobrescrever silenciosamente o registro da primeira.
create table if not exists completions (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  occurrence_date date not null,
  done_by uuid references profiles(id),
  done_by_name text not null,
  done_at timestamptz not null default now(),
  unique (obligation_id, occurrence_date)
);

create index if not exists completions_obligation_idx on completions(obligation_id);

alter table completions enable row level security;

drop policy if exists "completions_select_authenticated" on completions;
create policy "completions_select_authenticated"
  on completions for select
  to authenticated
  using (true);

-- Qualquer pessoa autenticada pode marcar uma conclusão (isso é a ação do
-- dia a dia da equipe). O done_by é sempre o próprio usuário logado — a
-- política abaixo impede que alguém grave conclusão em nome de outra pessoa.
drop policy if exists "completions_insert_own" on completions;
create policy "completions_insert_own"
  on completions for insert
  to authenticated
  with check (done_by = auth.uid());

-- Desfazer: a própria pessoa pode desfazer o que ela concluiu; admin pode
-- desfazer qualquer conclusão (ex.: corrigir um clique errado de outra
-- pessoa do time).
drop policy if exists "completions_delete_own_or_admin" on completions;
create policy "completions_delete_own_or_admin"
  on completions for delete
  to authenticated
  using (done_by = auth.uid() or is_admin(auth.uid()));

-- =============================================================================
-- Fim do schema. Próximo passo: veja o SETUP.md para criar o primeiro admin
-- e as contas da equipe.
-- =============================================================================
