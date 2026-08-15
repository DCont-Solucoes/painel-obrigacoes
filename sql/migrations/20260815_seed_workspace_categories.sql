-- Garante que todo workspace possua as categorias básicas antes que regras ou
-- obrigações sejam criadas. Sem essas linhas, a FK composta por
-- (workspace_id, category) rejeita, por exemplo, uma regra da categoria
-- "federal" em workspaces criados depois da migração de isolamento.
begin;

create or replace function public.assign_and_validate_workspace() returns trigger
language plpgsql security definer set search_path=public as $$
declare expected uuid;
begin
  -- A criação de um workspace dispara o provisionamento das categorias. Essa
  -- é a única gravação operacional entre workspaces permitida pelo guard: ela
  -- precisa estar aninhada em outro trigger e apontar para um workspace real.
  if tg_table_name = 'categories'
     and pg_trigger_depth() > 1
     and exists (select 1 from public.workspaces where id = new.workspace_id) then
    return new;
  end if;

  expected := public.current_workspace_id();
  if expected is null then raise exception 'Usuário sem espaço de empresa vinculado.' using errcode='42501'; end if;
  if new.workspace_id is null then new.workspace_id := expected; end if;
  if new.workspace_id <> expected then raise exception 'Não é permitido gravar dados em outra empresa.' using errcode='42501'; end if;
  return new;
end $$;

create or replace function public.provision_workspace_categories() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.categories (workspace_id, name, cor, ordem, sistema)
  values
    (new.id, 'federal', '#2563eb', 10, true),
    (new.id, 'estadual', '#0891b2', 20, true),
    (new.id, 'municipal', '#0d9488', 30, true),
    (new.id, 'trabalhista', '#ca8a04', 40, true),
    (new.id, 'societaria', '#9333ea', 50, true)
  on conflict (workspace_id, name) do nothing;
  return new;
end $$;

revoke all on function public.provision_workspace_categories() from public;

drop trigger if exists trg_provision_workspace_categories on public.workspaces;
create trigger trg_provision_workspace_categories
after insert on public.workspaces
for each row execute function public.provision_workspace_categories();

-- Repara também os workspaces que já existiam quando esta correção entrou. O
-- trigger de guarda é suspenso somente dentro desta transação administrativa;
-- as políticas RLS e a guarda voltam a valer antes do commit.
alter table public.categories disable trigger trg_workspace_guard;
insert into public.categories (workspace_id, name, cor, ordem, sistema)
select w.id, seed.name, seed.cor, seed.ordem, true
from public.workspaces w
cross join (values
  ('federal', '#2563eb', 10),
  ('estadual', '#0891b2', 20),
  ('municipal', '#0d9488', 30),
  ('trabalhista', '#ca8a04', 40),
  ('societaria', '#9333ea', 50)
) as seed(name, cor, ordem)
on conflict (workspace_id, name) do nothing;
alter table public.categories enable trigger trg_workspace_guard;

notify pgrst, 'reload schema';
commit;
