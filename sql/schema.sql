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

-- A interface já bloqueia o botão "Concluir" até todo o checklist ser
-- marcado (ui/completeDialog.js). Esta constraint é a mesma trava em
-- profundidade já usada para o comprovante obrigatório logo abaixo
-- (completions_attachment_required): garante a regra mesmo que alguém
-- tente burlar a interface chamando a API diretamente. "NOT VALID" de
-- propósito, para não invalidar retroativamente conclusões antigas.
-- Obrigações sem checklist (checklist_total nulo ou zero) não são afetadas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'completions_checklist_complete'
  ) then
    alter table completions
      add constraint completions_checklist_complete
      check (checklist_total is null or checklist_total = 0 or checklist_checked = checklist_total)
      not valid;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 13) CONFERÊNCIA DE COMPETÊNCIA do comprovante (OCR no navegador)
-- -----------------------------------------------------------------------------
-- O comprovante é lido por OCR direto no navegador (Tesseract.js, sem
-- serviço externo pago) ao anexar o arquivo, tentando achar a que
-- competência (mês/ano) o documento se refere e comparando com a
-- ocorrência sendo concluída. É uma conferência HEURÍSTICA (leitura de
-- texto de documento escaneado nunca é 100% confiável, e cada órgão
-- emite guia num layout diferente) — por isso não bloqueia a conclusão,
-- só avisa e pede uma confirmação extra da pessoa (ver ui/completeDialog.js
-- e js/ocr.js). Aqui só guardamos o resultado dessa conferência, para
-- aparecer na Visão Executiva e no e-mail diário para administradores.
alter table completions add column if not exists ocr_status text; -- 'ok' | 'mismatch' | 'not_checked'
alter table completions add column if not exists ocr_extracted_period text; -- ex.: "07/2026", ou nulo se não achou nada

-- -----------------------------------------------------------------------------
-- 14) REGRAS DE OBRIGAÇÕES (catálogo/modelos praticados pelo mercado)
-- -----------------------------------------------------------------------------
-- Um catálogo de obrigações-padrão (DCTFWeb, ECD, ICMS-ST etc.), mantido
-- pela gerência (admin), separado das obrigações reais de cada empresa
-- (tabela `obligations`). Serve como referência e como modelo de
-- preenchimento rápido ao cadastrar uma obrigação nova (ver
-- ui/ruleModal.js e o seletor "Usar modelo de mercado" em ui/modal.js) —
-- escolher uma regra só PRÉ-PREENCHE o formulário; não cria vínculo
-- permanente entre a obrigação e a regra, então editar ou excluir uma
-- regra depois nunca afeta obrigações já cadastradas a partir dela.
create table if not exists obligation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('federal','estadual','municipal','trabalhista','societaria')),
  frequency text not null check (frequency in ('mensal','trimestral','anual')),
  day_type text not null default 'fixo' check (day_type in ('fixo','util_do_mes')),
  day_of_month int not null check (day_of_month between 1 and 31),
  month int check (month between 1 and 12),
  months int[],
  adjust_business_day boolean not null default false,
  notes text not null default '',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligation_rules_frequency_fields_check check (
    (frequency = 'mensal') or
    (frequency = 'trimestral' and months is not null) or
    (frequency = 'anual' and month is not null)
  )
);

alter table obligation_rules enable row level security;

drop policy if exists "obligation_rules_select_authenticated" on obligation_rules;
create policy "obligation_rules_select_authenticated"
  on obligation_rules for select
  to authenticated
  using (true);

drop policy if exists "obligation_rules_insert_admin" on obligation_rules;
create policy "obligation_rules_insert_admin"
  on obligation_rules for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "obligation_rules_update_admin" on obligation_rules;
create policy "obligation_rules_update_admin"
  on obligation_rules for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "obligation_rules_delete_admin" on obligation_rules;
create policy "obligation_rules_delete_admin"
  on obligation_rules for delete
  to authenticated
  using (is_admin(auth.uid()));

create or replace function touch_obligation_rule()
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

drop trigger if exists trg_touch_obligation_rule on obligation_rules;
create trigger trg_touch_obligation_rule
  before update on obligation_rules
  for each row execute function touch_obligation_rule();

-- Seed com obrigações comuns no mercado brasileiro, só para dar um ponto de
-- partida — `on conflict (name) do nothing` faz rodar de novo sem duplicar
-- nem sobrescrever o que a gerência já tiver customizado. As datas abaixo
-- são referências de mercado amplamente praticadas, não aconselhamento
-- tributário: confirme sempre contra a legislação/calendário oficial
-- vigente antes de usar como modelo (prazos mudam por lei, prorrogação ou
-- particularidade de UF/município).
insert into obligation_rules (name, category, frequency, day_type, day_of_month, month, months, adjust_business_day, notes) values
  ('DCTFWeb', 'federal', 'mensal', 'util_do_mes', 15, null, null, false, 'Declaração de Débitos e Créditos Tributários Federais (substitui GFIP). Confira o calendário RFB do ano vigente.'),
  ('EFD Contribuições (PIS/COFINS)', 'federal', 'mensal', 'util_do_mes', 10, null, null, false, 'Escrituração Fiscal Digital de PIS/COFINS. Confira o calendário RFB do ano vigente.'),
  ('FGTS (GRF)', 'trabalhista', 'mensal', 'fixo', 7, null, null, true, 'Guia de Recolhimento do FGTS. Se dia 7 cair em fim de semana/feriado, antecipar (ajuste no painel empurra para frente — confirme se sua prática é antecipar em vez de adiar).'),
  ('DAS — Simples Nacional', 'federal', 'mensal', 'fixo', 20, null, null, true, 'Documento de Arrecadação do Simples Nacional. Empurra para o próximo dia útil quando cai em fim de semana/feriado.'),
  ('ICMS-ST (substituição tributária)', 'estadual', 'trimestral', 'fixo', 20, null, array[3,6,9,12], true, 'Regra geral de referência — varia por UF e por convênio/protocolo. Confira a legislação do estado da empresa.'),
  ('ISS — Município', 'municipal', 'mensal', 'fixo', 10, null, null, true, 'Prazo varia muito por município — confirme na legislação municipal específica antes de usar como modelo.'),
  ('ECD — Escrituração Contábil Digital', 'societaria', 'anual', 'fixo', 31, 5, null, true, 'SPED Contábil. Prazo costuma ser o último dia útil de maio — confira o calendário SPED do ano vigente.'),
  ('ECF — Escrituração Contábil Fiscal', 'federal', 'anual', 'fixo', 31, 7, null, true, 'SPED Fiscal (IRPJ/CSLL). Prazo costuma ser o último dia útil de julho — confira o calendário SPED do ano vigente.')
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- 15) EXCEÇÃO DE DATA por ocorrência (prorrogação pontual)
-- -----------------------------------------------------------------------------
-- Ajusta o vencimento de UMA ocorrência específica (ex.: "o prazo de maio
-- foi prorrogado para 30/06 esse ano"), sem tocar na regra de recorrência
-- da obrigação — as próximas ocorrências continuam seguindo
-- day_of_month/month/months normalmente. `original_date` é a data que o
-- painel teria calculado sozinho (chave natural da ocorrência sendo
-- ajustada); `override_date` é a data efetiva. A conclusão continua sendo
-- registrada com `original_date` como `completions.occurrence_date` — o
-- ajuste muda só o que aparece na tela (vencimento, status atrasada/no
-- prazo), não a identidade da ocorrência nem o histórico.
create table if not exists obligation_date_overrides (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references obligations(id) on delete cascade,
  original_date date not null,
  override_date date not null,
  reason text not null default '',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (obligation_id, original_date)
);

create index if not exists obligation_date_overrides_obligation_idx on obligation_date_overrides(obligation_id);

alter table obligation_date_overrides enable row level security;

drop policy if exists "obligation_date_overrides_select_authenticated" on obligation_date_overrides;
create policy "obligation_date_overrides_select_authenticated"
  on obligation_date_overrides for select
  to authenticated
  using (true);

drop policy if exists "obligation_date_overrides_insert_admin" on obligation_date_overrides;
create policy "obligation_date_overrides_insert_admin"
  on obligation_date_overrides for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "obligation_date_overrides_update_admin" on obligation_date_overrides;
create policy "obligation_date_overrides_update_admin"
  on obligation_date_overrides for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "obligation_date_overrides_delete_admin" on obligation_date_overrides;
create policy "obligation_date_overrides_delete_admin"
  on obligation_date_overrides for delete
  to authenticated
  using (is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- 16) REGIMES TRIBUTÁRIOS e suas obrigações-padrão
-- -----------------------------------------------------------------------------
-- Catálogo de regimes tributários (Simples Nacional, Lucro Presumido, Lucro
-- Real, MEI etc.), mantido pela gerência (perfil admin) — mesma lógica de
-- "catálogo de mercado" já usada em obligation_rules. Cada empresa fica
-- vinculada a NO MÁXIMO um regime por vez (é como funciona na prática:
-- uma empresa está enquadrada em um único regime tributário de cada vez).
create table if not exists tax_regimes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tax_regimes enable row level security;

drop policy if exists "tax_regimes_select_authenticated" on tax_regimes;
create policy "tax_regimes_select_authenticated"
  on tax_regimes for select
  to authenticated
  using (true);

drop policy if exists "tax_regimes_insert_admin" on tax_regimes;
create policy "tax_regimes_insert_admin"
  on tax_regimes for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "tax_regimes_update_admin" on tax_regimes;
create policy "tax_regimes_update_admin"
  on tax_regimes for update
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

drop policy if exists "tax_regimes_delete_admin" on tax_regimes;
create policy "tax_regimes_delete_admin"
  on tax_regimes for delete
  to authenticated
  using (is_admin(auth.uid()));

create or replace function touch_tax_regime()
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

drop trigger if exists trg_touch_tax_regime on tax_regimes;
create trigger trg_touch_tax_regime
  before update on tax_regimes
  for each row execute function touch_tax_regime();

-- Quais obrigações do catálogo (obligation_rules) são praticadas em cada
-- regime — M:N porque uma mesma obrigação (ex.: FGTS) costuma valer para
-- vários regimes ao mesmo tempo.
create table if not exists tax_regime_rules (
  tax_regime_id uuid not null references tax_regimes(id) on delete cascade,
  obligation_rule_id uuid not null references obligation_rules(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tax_regime_id, obligation_rule_id)
);

alter table tax_regime_rules enable row level security;

drop policy if exists "tax_regime_rules_select_authenticated" on tax_regime_rules;
create policy "tax_regime_rules_select_authenticated"
  on tax_regime_rules for select
  to authenticated
  using (true);

drop policy if exists "tax_regime_rules_insert_admin" on tax_regime_rules;
create policy "tax_regime_rules_insert_admin"
  on tax_regime_rules for insert
  to authenticated
  with check (is_admin(auth.uid()));

drop policy if exists "tax_regime_rules_delete_admin" on tax_regime_rules;
create policy "tax_regime_rules_delete_admin"
  on tax_regime_rules for delete
  to authenticated
  using (is_admin(auth.uid()));

-- Vínculo empresa → regime (nullable: empresa pode não ter regime definido
-- ainda). "on delete set null" para excluir um regime não apagar empresas.
alter table companies add column if not exists tax_regime_id uuid references tax_regimes(id) on delete set null;

-- Checklist-padrão de uma regra do catálogo (um passo por linha) — copiado
-- para checklist_items de cada obrigação criada a partir da regra (uso
-- manual "usar como modelo" ou automático ao "trazer obrigações do
-- regime"). Fica vazio por padrão; não é obrigatório preencher.
alter table obligation_rules add column if not exists checklist_template text[] not null default '{}';

-- Seed de regimes tributários comuns no Brasil. "on conflict (name) do
-- nothing" — roda de novo sem duplicar nem sobrescrever customização feita
-- pela gerência depois.
insert into tax_regimes (name, description) values
  ('Simples Nacional', 'Regime unificado para micro e pequenas empresas (Lei Complementar 123/2006) — tributos federais, estaduais e municipais recolhidos numa guia única (DAS).'),
  ('Lucro Presumido', 'IRPJ/CSLL calculados sobre uma margem de lucro presumida por lei conforme a atividade, em vez do lucro contábil real.'),
  ('Lucro Real', 'IRPJ/CSLL incidem sobre o lucro contábil efetivamente apurado, com ajustes fiscais — obrigatório acima de certo faturamento ou para setores específicos (ex.: instituições financeiras).'),
  ('MEI', 'Microempreendedor Individual — regime simplificado com tributos fixos mensais (DAS-MEI), limitado a um teto de faturamento anual e a até um empregado.')
on conflict (name) do nothing;

-- Vínculo inicial entre o seed de regimes acima e o seed de obligation_rules
-- já existente (seção 14). É uma referência SIMPLIFICADA e de uso geral —
-- não é aconselhamento tributário, nem uma integração com nenhuma base de
-- dados oficial do Governo (não existe hoje uma API pública estruturada e
-- gratuita com essa relação regime→obrigação pronta para consumo). Trata-se
-- de um ponto de partida curado manualmente a partir de prática de mercado;
-- CONFIRME sempre contra a legislação e o enquadramento fiscal específico
-- de cada empresa antes de usar como modelo (regras variam por UF,
-- município, atividade e faturamento).
insert into tax_regime_rules (tax_regime_id, obligation_rule_id)
select r.id, o.id
from tax_regimes r
join obligation_rules o on true
where (r.name, o.name) in (
  ('Simples Nacional', 'DAS — Simples Nacional'),
  ('Simples Nacional', 'FGTS (GRF)'),
  ('Lucro Presumido', 'DCTFWeb'),
  ('Lucro Presumido', 'EFD Contribuições (PIS/COFINS)'),
  ('Lucro Presumido', 'FGTS (GRF)'),
  ('Lucro Presumido', 'ICMS-ST (substituição tributária)'),
  ('Lucro Presumido', 'ISS — Município'),
  ('Lucro Presumido', 'ECF — Escrituração Contábil Fiscal'),
  ('Lucro Real', 'DCTFWeb'),
  ('Lucro Real', 'EFD Contribuições (PIS/COFINS)'),
  ('Lucro Real', 'FGTS (GRF)'),
  ('Lucro Real', 'ICMS-ST (substituição tributária)'),
  ('Lucro Real', 'ISS — Município'),
  ('Lucro Real', 'ECD — Escrituração Contábil Digital'),
  ('Lucro Real', 'ECF — Escrituração Contábil Fiscal'),
  ('MEI', 'FGTS (GRF)')
)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 17) CHECKLIST com progresso PERSISTENTE por item (ao vivo, entre sessões)
-- -----------------------------------------------------------------------------
-- Além da contagem final gravada em completions (seção 12), agora cada item
-- do checklist guarda seu próprio estado "marcado" — para o painel mostrar
-- o percentual de conclusão em tempo real (ex.: "2/5 — 40%") enquanto a
-- equipe vai resolvendo os passos ao longo do período, não só no instante
-- da conclusão final.
alter table checklist_items add column if not exists completed boolean not null default false;
alter table checklist_items add column if not exists completed_by uuid references profiles(id) on delete set null;
alter table checklist_items add column if not exists completed_at timestamptz;

-- Qualquer pessoa autenticada pode marcar/desmarcar um passo do checklist
-- (o mesmo modelo permissivo já usado para "Marcar concluído" — qualquer
-- membro da equipe pode concluir qualquer obrigação, não só o responsável).
-- A política de UPDATE da tabela continua admin-only (protege descrição e
-- posição dos passos, que são o "modelo" definido pela gerência); esta
-- função roda como "security definer" e só toca os três campos de estado
-- de conclusão, nunca descrição/posição/obligation_id — por isso pode ser
-- liberada para todo mundo sem abrir brecha para editar o checklist em si.
create or replace function set_checklist_item_done(p_item_id uuid, p_done boolean)
returns checklist_items
language plpgsql
security definer
set search_path = public
as $$
declare
  result checklist_items;
begin
  update checklist_items
    set completed = p_done,
        completed_by = case when p_done then auth.uid() else null end,
        completed_at = case when p_done then now() else null end
    where id = p_item_id
    returning * into result;
  return result;
end;
$$;

grant execute on function set_checklist_item_done(uuid, boolean) to authenticated;

-- Reinicia todos os itens do checklist de uma obrigação para "não
-- marcado" — chamado pelo app depois de registrar uma conclusão, para o
-- próximo ciclo começar do zero. Mesmo raciocínio de permissão da função
-- acima: qualquer pessoa autenticada pode concluir uma obrigação (não só
-- admin), então esta função também precisa rodar para todo mundo, mas só
-- toca o estado de conclusão dos itens — nunca descrição/posição.
create or replace function reset_checklist_items(p_obligation_id uuid)
returns setof checklist_items
language sql
security definer
set search_path = public
as $$
  update checklist_items
    set completed = false, completed_by = null, completed_at = null
    where obligation_id = p_obligation_id
    returning *;
$$;

grant execute on function reset_checklist_items(uuid) to authenticated;

-- =============================================================================
-- Fim do schema. Próximo passo: veja o SETUP.md para criar o primeiro admin
-- e as contas da equipe.
-- =============================================================================
