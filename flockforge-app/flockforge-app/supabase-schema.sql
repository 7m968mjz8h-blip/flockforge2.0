-- Run this once in your Supabase project's SQL Editor (Supabase dashboard -> SQL Editor -> New query -> paste -> Run).
-- This creates one table that stores all of FlockForge's data, scoped per logged-in user.

create table if not exists user_data (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table user_data enable row level security;

create policy "Users can read their own data"
  on user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on user_data for update
  using (auth.uid() = user_id);

create policy "Users can delete their own data"
  on user_data for delete
  using (auth.uid() = user_id);
