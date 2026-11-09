-- ================================================================
-- REAPRENDER | BANCO DE DADOS SUPABASE
-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- Ele cria perfis, progresso e regras de acesso por usuário.
-- ================================================================

-- 1. Tabela de perfis vinculada às contas de autenticação do Supabase.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Estudante',
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

-- 2. Tabela de progresso: cada estudante possui um registro por aula.
create table if not exists public.lesson_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  read_confirmed boolean not null default false,
  quiz_passed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

-- 3. Cria automaticamente um perfil de estudante após o cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Estudante'),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recria o gatilho para evitar duplicidade em execuções posteriores do script.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4. Função segura usada pelas políticas para identificar a professora.
-- SECURITY DEFINER evita recursão nas políticas da tabela profiles.
create or replace function public.is_reaprender_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

-- 5. Ativa a segurança em nível de linha (RLS).
alter table public.profiles enable row level security;
alter table public.lesson_progress enable row level security;

-- 6. Remove políticas antigas com os mesmos nomes, para permitir reexecutar o script.
drop policy if exists "profile_read_own_or_teacher" on public.profiles;
drop policy if exists "profile_update_own" on public.profiles;
drop policy if exists "progress_read_own_or_teacher" on public.lesson_progress;
drop policy if exists "progress_insert_own" on public.lesson_progress;
drop policy if exists "progress_update_own" on public.lesson_progress;

-- Estudantes consultam o próprio perfil. Professora pode consultar perfis para acompanhamento.
create policy "profile_read_own_or_teacher"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_reaprender_teacher());

-- Estudantes podem atualizar apenas o próprio nome. A coluna role não recebe permissão de update.
create policy "profile_update_own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Cada estudante lê o próprio progresso; a professora pode ler o progresso de todos.
create policy "progress_read_own_or_teacher"
on public.lesson_progress for select to authenticated
using (user_id = auth.uid() or public.is_reaprender_teacher());

-- Um estudante só pode criar registros vinculados à própria conta.
create policy "progress_insert_own"
on public.lesson_progress for insert to authenticated
with check (user_id = auth.uid());

-- Um estudante só pode alterar registros vinculados à própria conta.
create policy "progress_update_own"
on public.lesson_progress for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 7. Permissões mínimas necessárias para o front-end.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert on public.lesson_progress to authenticated;
grant update (elapsed_seconds, read_confirmed, quiz_passed, completed_at, updated_at) on public.lesson_progress to authenticated;

-- 8. Atualiza a data de modificação do progresso automaticamente.
create or replace function public.set_progress_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lesson_progress_updated_at on public.lesson_progress;
create trigger lesson_progress_updated_at
before update on public.lesson_progress
for each row execute procedure public.set_progress_updated_at();

-- ================================================================
-- COMO PROMOVER A CONTA DA PROFESSORA
-- 1. Crie sua conta normalmente pela tela de cadastro do REAPRENDER.
-- 2. Substitua o e-mail abaixo pelo e-mail utilizado no cadastro.
-- 3. Execute este comando no SQL Editor do Supabase.
-- Não existe cadastro público de professora por segurança.
-- ================================================================
-- update public.profiles
-- set role = 'teacher'
-- where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI');


-- ================================================================
-- MURAL E CONTEÚDOS PERSONALIZADOS (professora e estudantes)
-- ================================================================

-- 1. Módulos criados pela professora (ou por estudantes, se permitido)
create table if not exists public.custom_modules (
  id bigint generated always as identity primary key,
  subject_id text not null,              -- ex.: 'portugues', 'matematica'
  title text not null,
  description text default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Aulas/materiais vinculados a um módulo personalizado
create table if not exists public.custom_lessons (
  id bigint generated always as identity primary key,
  module_id bigint not null references public.custom_modules(id) on delete cascade,
  title text not null,
  content text default '',               -- texto da aula
  video_url text default '',             -- link de vídeo (YouTube, etc.)
  extra_link text default '',            -- material complementar
  position integer not null default 1,
  created_at timestamptz not null default now()
);

-- 3. Publicações do mural (professora e estudantes)
create table if not exists public.wall_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  attachment_url text default '',        -- vídeo/link sugerido
  attachment_label text default '',
  created_at timestamptz not null default now()
);

-- 4. Comentários nas publicações
create table if not exists public.wall_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.wall_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- 5. Curtidas (opcional, mas o layout do mural mostra ♡ Curtir)
create table if not exists public.wall_likes (
  post_id bigint not null references public.wall_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

-- 6. RLS
alter table public.custom_modules  enable row level security;
alter table public.custom_lessons  enable row level security;
alter table public.wall_posts      enable row level security;
alter table public.wall_comments   enable row level security;
alter table public.wall_likes      enable row level security;

-- Módulos: todos autenticados leem os publicados; só a professora cria/edita.
create policy "modules_read" on public.custom_modules
  for select to authenticated using (is_published or public.is_reaprender_teacher());

create policy "modules_write_teacher" on public.custom_modules
  for all to authenticated
  using (public.is_reaprender_teacher())
  with check (public.is_reaprender_teacher());

-- Aulas: seguem a visibilidade do módulo.
create policy "lessons_read" on public.custom_lessons
  for select to authenticated
  using (exists (
    select 1 from public.custom_modules m
    where m.id = module_id and (m.is_published or public.is_reaprender_teacher())
  ));

create policy "lessons_write_teacher" on public.custom_lessons
  for all to authenticated
  using (public.is_reaprender_teacher())
  with check (public.is_reaprender_teacher());

-- Mural: todos autenticados leem; cada um cria como si mesmo; autor/professora remove.
create policy "posts_read" on public.wall_posts
  for select to authenticated using (true);

create policy "posts_insert_own" on public.wall_posts
  for insert to authenticated with check (author_id = auth.uid());

create policy "posts_delete_own_or_teacher" on public.wall_posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_reaprender_teacher());

-- Comentários: mesma lógica.
create policy "comments_read" on public.wall_comments
  for select to authenticated using (true);

create policy "comments_insert_own" on public.wall_comments
  for insert to authenticated with check (author_id = auth.uid());

create policy "comments_delete_own_or_teacher" on public.wall_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_reaprender_teacher());

-- Curtidas.
create policy "likes_read" on public.wall_likes
  for select to authenticated using (true);

create policy "likes_toggle_own" on public.wall_likes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 7. Grants
grant select, insert, update, delete on public.custom_modules to authenticated;
grant select, insert, update, delete on public.custom_lessons to authenticated;
grant select, insert, delete on public.wall_posts to authenticated;
grant select, insert, delete on public.wall_comments to authenticated;
grant select, insert, delete on public.wall_likes to authenticated;