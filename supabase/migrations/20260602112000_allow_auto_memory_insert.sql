-- Allow the browser app to insert safe AI memory notes using the Supabase publishable/anon key.
-- Do NOT store API keys, provider settings, passwords, or full chat history here.

alter table public.ai_memory enable row level security;

create policy if not exists "App can insert auto ai memory"
on public.ai_memory
for insert
to anon, authenticated
with check (
  category = 'auto'
  and priority <= 20
  and array['auto','chat'] <@ tags
  and char_length(title) <= 140
  and char_length(content) <= 2000
  and is_active = true
);
