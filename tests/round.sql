-- Запускается только в пустой тестовой базе.
create schema auth;
create role anon;
create role authenticated;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
insert into auth.users values(auth.uid(),'{"nickname":"Тест"}');
\ir ../supabase/setup.sql
\ir ../supabase/setup.sql
set role authenticated;
do $$
declare
 t jsonb:='{"ids":["FR"],"ask":"name","reply":"map+flag","method":"choice"}';
 d jsonb; result jsonb; choices jsonb; i integer;
begin
 perform public.atlas_play('save',jsonb_build_object('task',t,'date','2026-11-25','comment','Европа — флаги'));
 result=public.atlas_play('tasks')->0;
 assert result->>'title'='Задание на 25.11.2026' and result->>'comment'='Европа — флаги';
 for i in 1..3 loop
   d=public.atlas_play('start',jsonb_build_object('task',t,'practice',false));
   perform public.atlas_play('show',jsonb_build_object('id',d->'id','index',0));
   choices=jsonb_build_object('flag','FR','map',case when i=1 then 'IT' else 'FR' end);
   result=public.atlas_play('answer',jsonb_build_object('id',d->'id','index',0,'choices',choices));
   assert (result->>'ok')::boolean=(i>1);
   result=public.atlas_play('board',jsonb_build_object('task',t))->0;
   assert (result->>'learned')::int=(case when i=3 then 1 else 0 end);
 end loop;
 t=jsonb_set(t,'{reply}','"flag"');
 d=public.atlas_play('start',jsonb_build_object('task',t,'practice',false));
 perform public.atlas_play('show',jsonb_build_object('id',d->'id','index',0));
 result=public.atlas_play('answer',jsonb_build_object('id',d->'id','index',0,'choice','FR'));
 assert (result->>'ok')::boolean;
end $$;
