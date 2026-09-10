-- ==========================================================
-- Schema de Banco de Dados Oficial: Lista de Compras Plus
-- Execute este script no SQL Editor do seu painel Supabase
-- ==========================================================

-- 1. Criação da tabela de Listas com suporte completo a itens (JSONB)
create table if not exists public.listas (
  id text primary key,
  name text not null,
  category text not null,
  budget numeric(12, 2) not null default 0.00,
  items jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Índice para ordenação rápida por data
create index if not exists idx_listas_created_at on public.listas(created_at desc);

-- 3. Habilitação de Segurança por Linha (RLS)
alter table public.listas enable row level security;

-- 4. Políticas de Acesso Público para o Aplicativo
create policy "Permitir leitura pública de listas" 
  on public.listas for select 
  using (true);

create policy "Permitir inserção de listas" 
  on public.listas for insert 
  with check (true);

create policy "Permitir atualização de listas" 
  on public.listas for update 
  using (true);

create policy "Permitir exclusão de listas" 
  on public.listas for delete 
  using (true);

-- 5. Habilitar Realtime (Opcional - atualizações em tempo real)
alter publication supabase_realtime add table public.listas;
