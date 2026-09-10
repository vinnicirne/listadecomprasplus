-- ==========================================================
-- Schema de Banco de Dados para Lista de Compras Plus
-- Compatível com Supabase / PostgreSQL
-- ==========================================================

-- Tabela de Listas de Compras
create table if not exists public.listas (
  id text primary key,
  name text not null,
  category text not null,
  budget numeric(12, 2) not null default 0.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Itens da Lista de Compras
create table if not exists public.itens (
  id text primary key,
  lista_id text not null references public.listas(id) on delete cascade,
  name text not null,
  category text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0.00,
  checked boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Índices para alta performance
create index if not exists idx_itens_lista_id on public.itens(lista_id);
create index if not exists idx_listas_created_at on public.listas(created_at desc);

-- Políticas de Acesso RLS (Row Level Security) - Acesso Público Anônimo para o App
alter table public.listas enable row level security;
alter table public.itens enable row level security;

create policy "Permitir leitura pública de listas" on public.listas for select using (true);
create policy "Permitir inserção de listas" on public.listas for insert with check (true);
create policy "Permitir atualização de listas" on public.listas for update using (true);
create policy "Permitir exclusão de listas" on public.listas for delete using (true);

create policy "Permitir leitura pública de itens" on public.itens for select using (true);
create policy "Permitir inserção de itens" on public.itens for insert with check (true);
create policy "Permitir atualização de itens" on public.itens for update using (true);
create policy "Permitir exclusão de itens" on public.itens for delete using (true);
