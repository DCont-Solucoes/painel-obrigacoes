-- Correção para bancos que já executaram a migração de 17/08. O título
-- importado pode conter espaços não separáveis ou outra composição Unicode;
-- por isso a comparação exata anterior não localizou algumas linhas.
-- A categoria não participa deste reparo: o título identifica esta rotina e
-- todas as ocorrências dela devem aceitar conclusão sem comprovante.
update public.obligations
set requires_attachment = false
where trim(regexp_replace(
  translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc'),
  '[^a-z0-9]+', ' ', 'g'
)) like 'parametrizacao do novo plano de contas nas regras de contabilizacao%';

-- Faz o PostgREST atualizar imediatamente os metadados da coluna após a
-- aplicação manual da migração no Supabase.
notify pgrst, 'reload schema';

-- A fonte de verdade também reconhece diretamente a rotina pelo título. Isso
-- evita que um valor legado `true` volte a bloquear a conclusão caso a linha
-- seja recriada por importação depois deste UPDATE.
create or replace function public.enforce_completion_attachment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  attachment_required boolean;
begin
  select o.requires_attachment and not (
    trim(regexp_replace(
      translate(lower(o.name), 'áàâãéêíóôõúç', 'aaaaeeiooouc'),
      '[^a-z0-9]+', ' ', 'g'
    )) like 'parametrizacao do novo plano de contas nas regras de contabilizacao%'
  )
  into attachment_required
  from public.obligations o
  where o.id = new.obligation_id;

  if new.attachment_path is null and coalesce(attachment_required, true) then
    raise exception 'Comprovante obrigatório para esta obrigação'
      using errcode = '23514', constraint = 'completions_attachment_required';
  end if;
  return new;
end;
$$;
