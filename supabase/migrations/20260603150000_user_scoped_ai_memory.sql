-- Private AI memory per Supabase Auth user.
-- Run this migration in Supabase before using email/password memory login.
-- Do NOT store API keys, provider settings, passwords, uploaded files, images, videos, or large attachments in ai_memory.

alter table public.ai_memory
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists ai_memory_user_id_created_at_idx
on public.ai_memory (user_id, created_at desc);

alter table public.ai_memory enable row level security;

-- Remove older public/shared policies so memory cannot be read across users.
drop policy if exists "Public can read active ai memory" on public.ai_memory;
drop policy if exists "App can insert auto ai memory" on public.ai_memory;
drop policy if exists "Users can read own active ai memory" on public.ai_memory;
drop policy if exists "Users can insert own auto ai memory" on public.ai_memory;
drop policy if exists "Users can update own ai memory" on public.ai_memory;
drop policy if exists "Users can delete own ai memory" on public.ai_memory;

create policy "Users can read own active ai memory"
on public.ai_memory
for select
to authenticated
using (
  auth.uid() = user_id
  and is_active = true
);

create policy "Users can insert own auto ai memory"
on public.ai_memory
for insert
to authenticated
with check (
  auth.uid() = user_id
  and category in ('auto', 'user_preference', 'privacy_rule', 'project_workflow', 'app_feature', 'ui_decision')
  and priority <= 40
  and array['auto','chat'] <@ tags
  and char_length(title) <= 140
  and char_length(content) <= 2000
  and content !~* '(api key|apikey|secret key|password|token|data:image|data:video|base64,|blob:|attachment:|uploaded file|file upload)'
  and is_active = true
);

-- App has no UI to edit/delete memory. These policies allow future account tools without exposing other users' rows.
create policy "Users can update own ai memory"
on public.ai_memory
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own ai memory"
on public.ai_memory
for delete
to authenticated
using (auth.uid() = user_id);

-- repo_index remains public project context, not user memory.
alter table public.repo_index enable row level security;
drop policy if exists "Public can read active repo index" on public.repo_index;
create policy "Public can read active repo index"
on public.repo_index
for select
to anon, authenticated
using (is_active = true);
