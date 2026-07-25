-- PROMPT 47 performance audit: commitChunk() in src/features/imports/actions.ts
-- was updating one import_rows status per row (up to COMMIT_CHUNK_SIZE = 200
-- individual UPDATEs per chunk) since each row's status/error_message/
-- created_entity_id differs — a single blanket .update() can't express that.
-- This RPC batches an entire chunk's differently-valued updates into one
-- statement. SECURITY INVOKER (not DEFINER): runs as the calling user so the
-- existing "owners, admins, and editors can update import rows" RLS policy
-- still applies exactly as it would to the individual updates it replaces.
create or replace function public.bulk_update_import_row_status(p_updates jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  update public.import_rows ir
  set
    status = u.status,
    error_message = u.error_message,
    created_entity_table = u.created_entity_table,
    created_entity_id = u.created_entity_id
  from jsonb_to_recordset(p_updates) as u(
    id uuid,
    status text,
    error_message text,
    created_entity_table text,
    created_entity_id uuid
  )
  where ir.id = u.id;
end;
$$;

comment on function public.bulk_update_import_row_status(jsonb) is
  'Batched import_rows status update for one commit chunk — see docs/performance-audit.md, "CSV import".';
