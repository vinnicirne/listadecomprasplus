-- ==========================================================
-- Schema SaaS Oficial: Lista de Compras Plus
-- Suporte Multi-inquilino com Supabase Auth & Row Level Security (RLS)
-- Execute este script no SQL Editor do seu painel Supabase
-- ==========================================================

-- 1. Criação ou Migração da tabela 'listas' com coluna 'user_id'
create table if not exists public.listas (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  category text not null,
  budget numeric(12, 2) not null default 0.00,
  items jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Adiciona a coluna 'user_id' caso a tabela já tenha sido criada anteriormente sem ela
alter table public.listas add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

-- 2. Índices de performance para consultas ultra-rápidas por usuário e data
create index if not exists idx_listas_user_id on public.listas(user_id);
create index if not exists idx_listas_created_at on public.listas(created_at desc);

-- 3. Habilitação de Segurança por Linha (RLS - Row Level Security)
alter table public.listas enable row level security;

-- 4. Remoção de políticas legadas caso existam
drop policy if exists "Permitir leitura pública de listas" on public.listas;
drop policy if exists "Permitir inserção de listas" on public.listas;
drop policy if exists "Permitir atualização de listas" on public.listas;
drop policy if exists "Permitir exclusão de listas" on public.listas;
drop policy if exists "SaaS: Usuários veem suas próprias listas" on public.listas;
drop policy if exists "SaaS: Usuários criam suas próprias listas" on public.listas;
drop policy if exists "SaaS: Usuários atualizam suas próprias listas" on public.listas;
drop policy if exists "SaaS: Usuários excluem suas próprias listas" on public.listas;

-- 5. Políticas SaaS de Isolamento Estrito por Usuário
-- Usuários autenticados têm acesso total APENAS às listas onde user_id coincide com o ID do login.
-- Listas criadas em modo visitante (sem login) têm user_id nulo e podem ser acessadas temporariamente.
create policy "SaaS: Usuários veem suas próprias listas" 
  on public.listas for select 
  using (
    auth.uid() = user_id 
    or (auth.uid() is null and user_id is null)
  );

create policy "SaaS: Usuários criam suas próprias listas" 
  on public.listas for insert 
  with check (
    auth.uid() = user_id 
    or (auth.uid() is null and user_id is null)
  );

create policy "SaaS: Usuários atualizam suas próprias listas" 
  on public.listas for update 
  using (
    auth.uid() = user_id 
    or (auth.uid() is null and user_id is null)
  );

create policy "SaaS: Usuários excluem suas próprias listas" 
  on public.listas for delete 
  using (
    auth.uid() = user_id 
    or (auth.uid() is null and user_id is null)
  );

-- 6. Habilitar Realtime para atualizações imediatas
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listas'
  ) then
    alter publication supabase_realtime add table public.listas;
  end if;
end $$;
