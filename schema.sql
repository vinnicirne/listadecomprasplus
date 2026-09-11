-- ==========================================================
-- Schema SaaS Oficial: Lista de Compras Plus
-- Suporte Multi-inquilino com Supabase Auth & Row Level Security (RLS)
-- Tabela de Perfis & Telefones para Marketing Futuro
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

-- 7. Tabela de Perfis de Usuários (Telefone/WhatsApp para Marketing Futuro & Gestão de Funções)
create table if not exists public.user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text,
  email text,
  phone text,
  marketing_consent boolean default true,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Adiciona a coluna 'role' caso a tabela já tenha sido criada anteriormente
alter table public.user_profiles add column if not exists role text not null default 'user';

alter table public.user_profiles enable row level security;

-- Política de RLS para o próprio usuário
drop policy if exists "Usuários podem gerenciar seu próprio perfil" on public.user_profiles;
create policy "Usuários podem gerenciar seu próprio perfil" 
  on public.user_profiles for all 
  using (auth.uid() = id) 
  with check (auth.uid() = id);

-- Política de RLS para o Administrador visualizar todos os perfis e leads cadastrados
drop policy if exists "Admins podem visualizar todos os perfis" on public.user_profiles;
create policy "Admins podem visualizar todos os perfis" 
  on public.user_profiles for select 
  using (
    lower(trim(auth.jwt()->>'email')) = 'viniciuscirne@gmail.com'
    or exists (
      select 1 from public.user_profiles p 
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 8. Trigger automática: copia Nome, Telefone, E-mail e define 'admin' para viniciuscirne@gmail.com
create or replace function public.handle_new_user()
returns trigger as $$
declare
  assigned_role text;
begin
  -- Se o e-mail for viniciuscirne@gmail.com, atribui privilégio de ADMIN automaticamente
  if lower(trim(new.email)) = 'viniciuscirne@gmail.com' then
    assigned_role := 'admin';
  else
    assigned_role := coalesce(new.raw_user_meta_data->>'role', 'user');
  end if;

  insert into public.user_profiles (id, name, email, phone, marketing_consent, role)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, true),
    assigned_role
  )
  on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    marketing_consent = excluded.marketing_consent,
    role = case 
      when lower(trim(excluded.email)) = 'viniciuscirne@gmail.com' then 'admin' 
      else user_profiles.role 
    end;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute procedure public.handle_new_user();

-- 9. Elevação Imediata: Transforma viniciuscirne@gmail.com em ADMIN no banco
update public.user_profiles
set role = 'admin'
where lower(trim(email)) = 'viniciuscirne@gmail.com';

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where lower(trim(email)) = 'viniciuscirne@gmail.com';

