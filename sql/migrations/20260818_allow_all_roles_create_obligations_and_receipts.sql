-- Restaura as permissões operacionais depois do isolamento por workspace.
-- O papel controla administração/edição, não o trabalho diário: qualquer
-- integrante ativo e vinculado ao workspace pode cadastrar obrigações e
-- enviar os respectivos comprovantes.
begin;

drop policy if exists obligations_tenant_insert on public.obligations;
drop policy if exists obligations_insert_all_roles on public.obligations;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'obligations' and column_name = 'workspace_id'
  ) then
    execute 'create policy obligations_insert_all_roles on public.obligations for insert to authenticated
      with check (public.can_access_workspace(workspace_id))';
  else
    -- Compatibilidade com instalações que ainda não receberam a migração de
    -- isolamento: não referencie uma coluna que ainda não existe.
    execute 'create policy obligations_insert_all_roles on public.obligations for insert to authenticated
      with check (auth.uid() is not null)';
  end if;
end $$;

-- O formulário de obrigação aceita cadastrar uma empresa ainda inexistente.
-- Sem esta policy, membros falham antes mesmo do INSERT da obrigação.
drop policy if exists companies_tenant_insert on public.companies;
drop policy if exists companies_insert_all_roles on public.companies;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'workspace_id'
  ) then
    execute 'create policy companies_insert_all_roles on public.companies for insert to authenticated
      with check (public.can_access_workspace(workspace_id))';
  else
    execute 'create policy companies_insert_all_roles on public.companies for insert to authenticated
      with check (auth.uid() is not null)';
  end if;
end $$;

drop policy if exists comprovantes_tenant_insert on storage.objects;
drop policy if exists comprovantes_insert_all_roles on storage.objects;
do $$
begin
  if to_regprocedure('public.current_workspace_id()') is not null then
    execute 'create policy comprovantes_insert_all_roles on storage.objects for insert to authenticated
      with check (
        bucket_id = ''comprovantes''
        and public.current_workspace_id() is not null
        and (storage.foldername(name))[1] = public.current_workspace_id()::text
      )';
  else
    execute 'create policy comprovantes_insert_all_roles on storage.objects for insert to authenticated
      with check (bucket_id = ''comprovantes'' and auth.uid() is not null)';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
