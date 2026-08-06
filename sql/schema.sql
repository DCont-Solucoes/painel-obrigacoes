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
  responsible_id uuid references profiles(id) on delete set null,
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

-- Garante a coluna em projetos que já rodaram uma versão anterior deste
-- script (create table if not exists não adiciona colunas novas a uma
-- tabela que já existe — por isso o ALTER explícito abaixo).
alter table obligations add column if not exists responsible_id uuid references profiles(id) on delete set null;
create index if not exists obligations_responsible_id_idx on obligations(responsible_id);

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

-- -----------------------------------------------------------------------------
-- 5) PRIORIDADE (campo simples em obligations)
-- -----------------------------------------------------------------------------
-- Coluna aditiva — não afeta nenhuma obrigação já cadastrada (todas ficam
-- com 'media' por padrão). A validação dos valores permitidos é feita na
-- interface (dropdown fechado), não por CHECK constraint, para manter esta
-- migração simples de reaplicar.
alter table obligations add column if not exists priority text not null default 'media';

-- -----------------------------------------------------------------------------
-- 6) COMENTÁRIOS por obrigação
-- -----------------------------------------------------------------------------
create table if not exists obligation_comments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  author_id uuid references profiles(id),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists obligation_comments_obligation_idx on obligation_comments(obligation_id);

alter table obligation_comments enable row level security;

drop policy if exists "obligation_comments_select_authenticated" on obligation_comments;
create policy "obligation_comments_select_authenticated"
  on obligation_comments for select
  to authenticated
  using (true);

drop policy if exists "obligation_comments_insert_own" on obligation_comments;
create policy "obligation_comments_insert_own"
  on obligation_comments for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "obligation_comments_delete_own_or_admin" on obligation_comments;
create policy "obligation_comments_delete_own_or_admin"
  on obligation_comments for delete
  to authenticated
  using (author_id = auth.uid() or is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 7) TRILHA DE AUDITORIA (quem criou/editou/excluiu obrigações)
-- -----------------------------------------------------------------------------
-- Só admins conseguem consultar (dados de "quem fez o quê" são sensíveis).
-- Ninguém grava direto nesta tabela pela aplicação — só o gatilho abaixo
-- grava, via security definer, então nem RLS de insert é necessária: não
-- existe política de insert/update/delete para o papel "authenticated",
-- então a API bloqueia qualquer tentativa de escrita direta.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  changed_by uuid references profiles(id),
  changed_by_name text,
  changed_at timestamptz not null default now(),
  diff jsonb
);

create index if not exists audit_log_table_row_idx on audit_log(table_name, row_id);
create index if not exists audit_log_changed_at_idx on audit_log(changed_at desc);

alter table audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on audit_log;
create policy "audit_log_select_admin"
  on audit_log for select
  to authenticated
  using (is_admin(auth.uid()));

create or replace function log_obligation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_diff jsonb;
  v_row_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row_id := old.id;
    v_diff := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_row_id := new.id;
    v_diff := jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new));
  else
    v_row_id := new.id;
    v_diff := to_jsonb(new);
  end if;

  insert into audit_log (table_name, row_id, action, changed_by, changed_by_name, diff)
  values (
    'obligations', v_row_id, lower(tg_op),
    auth.uid(),
    coalesce((select display_name from profiles where id = auth.uid()), 'sistema'),
    v_diff
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_obligation_insert on obligations;
create trigger trg_log_obligation_insert
  after insert on obligations
  for each row execute function log_obligation_change();

drop trigger if exists trg_log_obligation_update on obligations;
create trigger trg_log_obligation_update
  after update on obligations
  for each row execute function log_obligation_change();

drop trigger if exists trg_log_obligation_delete on obligations;
create trigger trg_log_obligation_delete
  after delete on obligations
  for each row execute function log_obligation_change();

-- -----------------------------------------------------------------------------
-- 8) FERIADOS e ajuste para dia útil
-- -----------------------------------------------------------------------------
-- Escopo desta função: se a obrigação tiver adjust_business_day = true, o
-- painel empurra o vencimento calculado para a frente até cair num dia que
-- não seja sábado/domingo nem um feriado cadastrado aqui. Isso NÃO calcula
-- "o Nº-ésimo dia útil do mês" (regra que varia por tributo e é fácil de
-- calcular errado silenciosamente) — é um ajuste mais simples e seguro:
-- "não deixa vencer num fim de semana ou feriado".
create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  scope text not null default 'nacional' check (scope in ('nacional','estadual','municipal'))
);

alter table obligations add column if not exists adjust_business_day boolean not null default false;

alter table holidays enable row level security;

drop policy if exists "holidays_select_authenticated" on holidays;
create policy "holidays_select_authenticated"
  on holidays for select
  to authenticated
  using (true);

drop policy if exists "holidays_insert_admin" on holidays;
create policy "holidays_insert_admin"
  on holidays for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "holidays_delete_admin" on holidays;
create policy "holidays_delete_admin"
  on holidays for delete
  to authenticated
  using (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 9) COMPROVANTES anexados às conclusões (Supabase Storage)
-- -----------------------------------------------------------------------------
-- Cria o bucket de armazenamento (privado — só autenticados acessam) e as
-- políticas de acesso aos arquivos. `on conflict do nothing` evita erro se
-- o bucket já existir (por exemplo, se você criou manualmente antes).
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "comprovantes_select_authenticated" on storage.objects;
create policy "comprovantes_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'comprovantes');

drop policy if exists "comprovantes_insert_authenticated" on storage.objects;
create policy "comprovantes_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'comprovantes');

drop policy if exists "comprovantes_delete_own_or_admin" on storage.objects;
create policy "comprovantes_delete_own_or_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'comprovantes' and (owner = auth.uid() or is_admin(auth.uid())));

-- Coluna que guarda o caminho do arquivo dentro do bucket, associada à
-- conclusão correspondente.
alter table completions add column if not exists attachment_path text;

-- Torna o comprovante OBRIGATÓRIO daqui em diante. Usamos "not valid" de
-- propósito: isso aplica a regra só para gravações NOVAS a partir de agora
-- — conclusões antigas (registradas antes dessa mudança, sem comprovante)
-- continuam existindo normalmente, sem serem invalidadas retroativamente.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'completions_attachment_required'
  ) then
    alter table completions
      add constraint completions_attachment_required
      check (attachment_path is not null)
      not valid;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 10) DIA ÚTIL FISCAL (Nº-ésimo dia útil do mês)
-- -----------------------------------------------------------------------------
-- day_type = 'fixo'        → day_of_month é o dia corrido de sempre (ex.: dia 20).
-- day_type = 'util_do_mes' → day_of_month passa a significar "o Nº-ésimo dia
--                             útil do mês" (ex.: 3 = terceiro dia útil),
--                             contando a partir do dia 1, pulando fins de
--                             semana e os feriados cadastrados em `holidays`.
alter table obligations add column if not exists day_type text not null default 'fixo';

-- -----------------------------------------------------------------------------
-- 11) CHECKLIST por obrigação
-- -----------------------------------------------------------------------------
-- Lista de passos (modelo) cadastrada pelo admin em cada obrigação. O
-- progresso de marcar/desmarcar item é conduzido dentro do próprio diálogo
-- de "concluir" (não fica salvo linha a linha no banco) — o checklist serve
-- para garantir que a pessoa não esqueça uma etapa antes de concluir, não
-- como um segundo histórico de auditoria por item.
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  description text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checklist_items_obligation_idx on checklist_items(obligation_id);

alter table checklist_items enable row level security;

drop policy if exists "checklist_items_select_authenticated" on checklist_items;
create policy "checklist_items_select_authenticated"
  on checklist_items for select
  to authenticated
  using (true);

drop policy if exists "checklist_items_insert_admin" on checklist_items;
create policy "checklist_items_insert_admin"
  on checklist_items for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "checklist_items_update_admin" on checklist_items;
create policy "checklist_items_update_admin"
  on checklist_items for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "checklist_items_delete_admin" on checklist_items;
create policy "checklist_items_delete_admin"
  on checklist_items for delete
  to authenticated
  using (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 12) PROGRESSO DO CHECKLIST na conclusão
-- -----------------------------------------------------------------------------
-- Guarda só a CONTAGEM de itens do checklist e quantos estavam marcados no
-- momento em que a conclusão foi registrada — o suficiente para mostrar
-- "3/3 itens" na listagem sem abrir o modal de edição. Não é um registro
-- item a item: isso manteria o checklist como um segundo histórico de
-- auditoria, papel que já é do audit_log e do comprovante anexado (ver
-- README, seção "Prioridade, checklist, comentários e histórico").
-- Conclusões registradas antes desta coluna existir ficam com os dois
-- campos nulos (não se aplica / não foi registrado).
alter table completions add column if not exists checklist_total int;
alter table completions add column if not exists checklist_checked int;

-- =============================================================================
-- Fim do schema. Próximo passo: veja o SETUP.md para criar o primeiro admin
-- e as contas da equipe.
-- =============================================================================
