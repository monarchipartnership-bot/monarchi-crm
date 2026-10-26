-- Registration is limited by the trigger enforce_corporate_email on auth.users: only @monarchi.agency and one named exception may be created.
-- «Add user» in Supabase failed for ke9001674@gmail.com with «Database error creating new user» because of exactly this check.
-- This adds that address as a second named exception (the owner's decision, 2026-10-26). Nothing else changes: the same domain rule, the same
-- trigger, the same grants. Run once in the Supabase SQL editor; safe to re-run.

create or replace function public.enforce_corporate_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.email is not null
     and lower(new.email) not in ('monarchi.partnership@gmail.com', 'ke9001674@gmail.com')
     and new.email !~* '@monarchi\.agency$'
  then
    raise exception 'Реєстрація дозволена лише для пошти @monarchi.agency';
  end if;
  return new;
end;
$function$;

-- the function is called by the trigger only, never through the public API
revoke execute on function public.enforce_corporate_email() from public, anon, authenticated;
