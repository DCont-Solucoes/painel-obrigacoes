-- Restaura as permissões operacionais depois do isolamento por workspace.
-- O papel controla administração/edição, não o trabalho diário: qualquer
-- integrante ativo e vinculado ao workspace pode cadastrar obrigações e
-- enviar os respectivos comprovantes.
begin;

drop policy if exists obligations_tenant_insert on public.obligations;
create policy obligations_tenant_insert
  on public.obligations for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

-- O formulário de obrigação aceita cadastrar uma empresa ainda inexistente.
-- Sem esta policy, membros falham antes mesmo do INSERT da obrigação.
drop policy if exists companies_tenant_insert on public.companies;
create policy companies_tenant_insert
  on public.companies for insert
  to authenticated
  with check (public.can_access_workspace(workspace_id));

drop policy if exists comprovantes_tenant_insert on storage.objects;
create policy comprovantes_tenant_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'comprovantes'
    and public.current_workspace_id() is not null
    and (storage.foldername(name))[1] = public.current_workspace_id()::text
  );

commit;

notify pgrst, 'reload schema';
