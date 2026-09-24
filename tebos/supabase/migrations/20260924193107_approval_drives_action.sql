-- Approvals drive their action's lifecycle (dossier §17/§23).
--
-- Requesting an approval moves a ready action to awaiting_approval; the
-- decision moves it on — approved -> approved, rejected -> back to ready for
-- revision. Approvers cannot edit actions directly (RLS), so without this an
-- approval would sit decided while the action waited for someone else to
-- notice. The transition is attributed to whoever made the request or the
-- decision, and every action guard still applies.

create function tebos_private.apply_approval_to_action() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      update public.actions set status = 'awaiting_approval' where id = new.action_id and status = 'ready';
    end if;
  elsif new.status is distinct from old.status then
    -- an approval that has already expired authorises nothing, so it moves nothing
    if new.status = 'approved' and (new.expires_at is null or new.expires_at > now()) then
      update public.actions set status = 'approved' where id = new.action_id and status = 'awaiting_approval';
    elsif new.status = 'rejected' then
      update public.actions set status = 'ready' where id = new.action_id and status = 'awaiting_approval';
    end if;
  end if;
  return null;
end $$;

create trigger apply_to_action after insert or update of status on public.approvals
  for each row execute function tebos_private.apply_approval_to_action();
