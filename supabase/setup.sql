-- Выполняется один раз целиком. Повторный запуск сохраняет результаты.
begin;
create schema if not exists atlas_private;
revoke all on schema atlas_private from public, anon, authenticated;
create table if not exists atlas_private.players (
 id uuid primary key references auth.users on delete cascade,
 name text not null check(length(name) between 2 and 24)
);
create unique index if not exists atlas_player_name on atlas_private.players(lower(name));
create table if not exists atlas_private.tasks (
 id bigint generated always as identity primary key,
 owner uuid not null references atlas_private.players on delete cascade,
 title text not null check(length(title) between 1 and 80), task jsonb not null,
 unique(owner,title,task)
);
alter table atlas_private.tasks add column if not exists due_date date;
alter table atlas_private.tasks add column if not exists comment text not null default '';
create table if not exists atlas_private.rounds (
 id uuid primary key default gen_random_uuid(), owner uuid not null references atlas_private.players on delete cascade,
 task jsonb not null, practice boolean not null, deck text[] not null, answers jsonb not null default '[]',
 shown timestamptz, finished boolean not null default false
);
alter table atlas_private.players enable row level security;
alter table atlas_private.tasks enable row level security;
alter table atlas_private.rounds enable row level security;
create index if not exists atlas_round_owner on atlas_private.rounds(owner,finished);
create or replace function public.atlas_play(action text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); t jsonb:=payload->'task'; deck text[]; valid_ids text[]:=string_to_array('AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW',' ');
 r atlas_private.rounds; p integer; ix integer; a jsonb; v jsonb; nick text; kinds text[]; due date; note text; correct boolean;
begin
 if uid is null then raise exception 'Войдите в игру.'; end if;
 if not exists(select 1 from atlas_private.players where id=uid) then
   select trim(raw_user_meta_data->>'nickname') into nick from auth.users where id=uid;
   insert into atlas_private.players values(uid,nick) on conflict(id) do nothing;
 end if;
 if action in ('start','save','board') then
   if jsonb_typeof(t->'ids') is distinct from 'array' then raise exception 'Неверный список стран.'; end if;
   select array_agg(distinct s order by s) into deck from jsonb_array_elements_text(t->'ids') as x(s);
   select array_agg(distinct k order by k) into kinds from unnest(string_to_array(t->>'reply','+')) as replies(k);
   if (action<>'board' and deck is null) or not coalesce(deck,'{}') <@ valid_ids or
      not coalesce((t->>'ask') in ('name','map','flag','capital') and cardinality(kinds) between 1 and 3
        and kinds <@ array['name','map','flag','capital'] and (t->>'ask')<>all(kinds)
        and ((t->>'method')='choice' or ((t->>'method')='type' and kinds && array['name','capital'])),false)
      then raise exception 'Некорректное задание.'; end if;
   t=jsonb_build_object('ids',coalesce(deck,'{}'),'ask',t->>'ask','reply',array_to_string(kinds,'+'),'method',t->>'method');
 end if;
 if action='save' then
   if not coalesce(payload->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Выберите дату задания.'; end if;
   due=(payload->>'date')::date;
   note=trim(coalesce(payload->>'comment',''));
   if length(note)>160 then raise exception 'Комментарий слишком длинный.'; end if;
   insert into atlas_private.tasks(owner,title,task,due_date,comment) values(uid,'Задание на '||to_char(due,'DD.MM.YYYY'),t,due,note)
     on conflict(owner,title,task) do update set due_date=excluded.due_date,comment=excluded.comment;
   return 'true';
 elsif action='tasks' then
   select coalesce(jsonb_agg(jsonb_build_object('title',s.title,'task',s.task,'author',u.name,'date',to_char(s.due_date,'YYYY-MM-DD'),'comment',s.comment) order by s.id desc),'[]') into v
   from atlas_private.tasks s join atlas_private.players u on u.id=s.owner; return v;
 elsif action='start' then
   select array_agg(s order by random()) into deck from unnest(deck) as x(s);
   insert into atlas_private.rounds(owner,task,practice,deck) values(uid,t,(payload->>'practice')::boolean,deck) returning * into r;
   return jsonb_build_object('id',r.id,'order',r.deck);
 elsif action in ('show','answer') then
   select * into strict r from atlas_private.rounds where id=(payload->>'id')::uuid and owner=uid for update;
   p=jsonb_array_length(r.answers); ix=(payload->>'index')::integer;
   if ix is null or ix<0 or ix>p or ix>=cardinality(r.deck) then raise exception 'Проверьте номер вопроса.'; end if;
   if ix<p then return r.answers->ix; end if;
   if action='show' then
     update atlas_private.rounds set shown=coalesce(shown,clock_timestamp()) where id=r.id;return 'true';
   end if;
   if r.shown is null then raise exception 'Сначала откройте вопрос.'; end if;
   kinds=string_to_array(r.task->>'reply','+');
   if payload ? 'choices' then
     select bool_and(coalesce((payload->'choices'->>k)=r.deck[p+1],false)) into correct from unnest(kinds) as parts(k);
   else
     correct=cardinality(kinds)=1 and coalesce(payload->>'choice'=r.deck[p+1],false);
   end if;
   a=jsonb_build_object('id',r.deck[p+1],'ok',correct,
   'ms',greatest(0,round(extract(epoch from clock_timestamp()-r.shown)*1000)));
   update atlas_private.rounds set answers=answers||jsonb_build_array(a),shown=null,finished=(p+1=cardinality(r.deck)) where id=r.id;
   return a;
 elsif action='board' then
   with full_rounds as (select * from atlas_private.rounds where finished and not practice),
   hits as (select owner,ans->>'id' as country,count(*) as times from full_rounds cross join lateral jsonb_array_elements(answers) ans
            where (ans->>'ok')::boolean group by owner,ans->>'id'),
   mastery as (select owner,count(*) as once,count(*) filter(where times>=2) as learned from hits group by owner),
   scores as (select r1.owner,r1.id,count(*) filter(where (ans->>'ok')::boolean) as n,sum((ans->>'ms')::bigint) as ms
              from full_rounds r1 cross join lateral jsonb_array_elements(r1.answers) ans where r1.task=t group by r1.owner,r1.id),
   best as (select distinct on(owner) owner,n,ms from scores order by owner,n desc,ms,id)
   select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'once',coalesce(m.once,0),'learned',coalesce(m.learned,0),'n',b.n,'ms',b.ms)),'[]') into v
   from atlas_private.players u left join mastery m on m.owner=u.id left join best b on b.owner=u.id
   where exists(select 1 from full_rounds f where f.owner=u.id);return v;
 end if;
 raise exception 'Неизвестное действие.';
end $$;
revoke all on function public.atlas_play(text,jsonb) from public,anon;
grant execute on function public.atlas_play(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
