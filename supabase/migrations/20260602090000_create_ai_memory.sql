-- AI app memory only.
-- Do NOT store user API keys, provider settings, or chat history here.

create extension if not exists pgcrypto;

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null default 'general',
  tags text[] not null default '{}',
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repo_index (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  summary text not null default '',
  file_type text not null default 'code',
  tags text[] not null default '{}',
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ai_memory_updated_at on public.ai_memory;
create trigger set_ai_memory_updated_at
before update on public.ai_memory
for each row execute function public.set_updated_at();

drop trigger if exists set_repo_index_updated_at on public.repo_index;
create trigger set_repo_index_updated_at
before update on public.repo_index
for each row execute function public.set_updated_at();

alter table public.ai_memory enable row level security;
alter table public.repo_index enable row level security;

-- App users may read active public AI memory with the anon key.
-- There are intentionally no insert/update/delete policies, so browser clients cannot write.
drop policy if exists "Public can read active ai memory" on public.ai_memory;
create policy "Public can read active ai memory"
on public.ai_memory
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read active repo index" on public.repo_index;
create policy "Public can read active repo index"
on public.repo_index
for select
to anon, authenticated
using (is_active = true);

insert into public.ai_memory (title, content, category, tags, priority)
values
  (
    'Privacy rule',
    'Do not store user API keys, provider settings, or chat history in Supabase. Keep those private in each user browser/localStorage only.',
    'security',
    array['privacy', 'security'],
    100
  ),
  (
    'GitHub edit rule',
    'Before committing code changes to GitHub, show a summary and preview first. Only commit after the user types PUSH.',
    'github-agent',
    array['github', 'push', 'safety'],
    90
  ),
  (
    'App stack',
    'This app is a React, Vite, TanStack Router AI chat app with local provider settings, GitHub integration, Outlook integration, image/video pages, and local chat history.',
    'project',
    array['stack', 'project'],
    80
  )
on conflict do nothing;

insert into public.repo_index (path, summary, file_type, tags, priority)
values
  ('src/lib/chat/api.ts', 'OpenAI-compatible Chat API request logic, streaming, text/image fallback, and provider errors.', 'code', array['chat', 'api'], 100),
  ('src/lib/github/chatCommand.ts', 'GitHub AI agent command router, repo index, planner, preview diff, push, and build check logic.', 'code', array['github', 'agent'], 95),
  ('src/lib/github/api.ts', 'GitHub REST helpers for repo files, tree index, commits, status, and check runs.', 'code', array['github', 'api'], 90),
  ('src/routes/settings.tsx', 'Settings page for chat, image, video, GitHub Connect, and Outlook Connect.', 'code', array['settings'], 85),
  ('src/components/chat/ChatInput.tsx', 'Chat input, send button, file upload, image/file attachment handling.', 'code', array['chat', 'upload'], 80),
  ('src/components/chat/ChatMessageBubble.tsx', 'Chat bubble UI and attachment preview display.', 'code', array['chat', 'ui'], 75),
  ('src/routes/video.tsx', 'Video generation page and photo-to-video workflow.', 'code', array['video'], 70),
  ('src/routes/image.tsx', 'Image generation/edit page.', 'code', array['image'], 70)
on conflict (path) do update set
  summary = excluded.summary,
  file_type = excluded.file_type,
  tags = excluded.tags,
  priority = excluded.priority,
  is_active = true,
  updated_at = now();
