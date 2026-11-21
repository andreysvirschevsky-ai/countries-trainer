const cloud = Boolean(ATLAS_CONFIG.url && ATLAS_CONFIG.key);
const prefix = 'ng-atlas-v1:';
const read = (key,fallback) => JSON.parse(localStorage.getItem(prefix+key) || JSON.stringify(fallback));
const save = (key,value) => localStorage.setItem(prefix+key,JSON.stringify(value));
const shuffle = list => {
  const a=[...list];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
};
const hex = bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const bytes = s=>new TextEncoder().encode(s);
const identity = s=>s.normalize('NFKC').toLocaleLowerCase('ru').trim().replace(/\s+/g,' ');
const sessionKey=prefix+(cloud?'cloud':'local');
let session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
function remember(s){session=s;if(s)sessionStorage.setItem(sessionKey,JSON.stringify(s));else sessionStorage.removeItem(sessionKey);}
async function api(path,data,token){
  let response;
  try{response=await fetch(ATLAS_CONFIG.url.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:ATLAS_CONFIG.key,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});}
  catch{throw Error('Нет связи с Supabase. Проверьте интернет и повторите.');}
  const result=await response.json();
  if(!response.ok){
    const msg=result.msg||result.message||result.error_description||'Ошибка запроса';
    if(/invalid login|invalid credentials/i.test(msg))throw Error('Проверьте имя и PIN.');
    if(/already registered|already exists/i.test(msg))throw Error('Имя уже занято. Выберите другое или войдите.');
    if(response.status===429)throw Error('Слишком много попыток. Подождите немного.');
    throw Error(msg);
  }
  return result;
}
async function rpc(action,payload={}){
  if(session.expires<Date.now()+30000){
    const fresh=await api('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh});
    remember({...session,token:fresh.access_token,refresh:fresh.refresh_token,expires:Date.now()+fresh.expires_in*1000});
  }
  try{return await api('/rest/v1/rpc/atlas_play',{action,payload},session.token);}
  catch(err){
    const msg=err.message;
    const rejected=msg.includes('Некорректное задание');
    const oldSave=action==='save'&&/null value in column "title"/i.test(msg);
    if(oldSave||(rejected&&payload.task?.reply.includes('+'))){
      throw Error('Supabase отклонил настройки. Проверьте версию базы: для нескольких ответов и сохранения задания по дате откройте SQL Editor в проекте игры, выполните актуальный supabase/setup.sql и повторите попытку. Менять выбранные страны или формат даты не требуется.');
    }
    if(rejected&&payload.task){
      const t=payload.task;
      throw Error('Supabase отклонил задание. Выбрано стран: '+t.ids.length+'. Компьютер показывает: '+labels[t.ask]+'. Игрок отвечает: '+replyKinds(t).map(k=>labels[k]).join(', ')+'. Проверьте, что config.js указывает на проект, в котором выполнен актуальный supabase/setup.sql.');
    }
    throw err;
  }
}
async function pinHash(pin,salt){
  const key=await crypto.subtle.importKey('raw',bytes(pin),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:150000},key,256));
}
async function login(name,pin,create){
  name=name.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>24||!/^\d{4,12}$/.test(pin))throw Error('Имя должно содержать от 2 до 24 знаков, PIN — от 4 до 12 цифр.');
  const nick=identity(name);
  if(cloud){
    const email=hex(await crypto.subtle.digest('SHA-256',bytes(nick)))+'@players.example.com';
    // Старые профили используют PIN как пароль. Для коротких PIN создаём пароль нужной длины.
    const password=pin.length<6 ? await pinHash(pin,'atlas-short-pin:'+nick) : pin;
    const result=await api(create?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{email,password,...(create?{data:{nickname:name}}:{})});
    if(!result.access_token)throw Error('Администратору нужно отключить Confirm email в Supabase для входа по имени.');
    remember({id:result.user.id,name:result.user.user_metadata.nickname,token:result.access_token,refresh:result.refresh_token,expires:Date.now()+result.expires_in*1000});
  }else{
    const key='player:'+nick;let player=read(key,null);
    if(create){
      if(player)throw Error('Это имя уже занято.');
      const salt=crypto.randomUUID();player={id:crypto.randomUUID(),name,salt,hash:await pinHash(pin,salt)};save(key,player);
    }else if(!player||await pinHash(pin,player.salt)!==player.hash)throw Error('Проверьте имя и PIN.');
    remember({id:player.id,name:player.name});
  }
}
const defaultTask=()=>({ids:[],ask:'flag',reply:'name',method:'choice'});
const replyKinds=t=>String(t.reply).split('+');
const textKind=k=>k==='name'||k==='capital';
function cleanTask(t){
  const kinds=['name','capital','flag','map'];
  if(!t||!Array.isArray(t.ids))throw Error('В задании отсутствует список стран. Выберите страны заново.');
  if(t.ids.some(id=>!Object.hasOwn(countries,id)))throw Error('В задании есть страна вне справочника. Создайте набор из стран, доступных в списке.');
  if(!kinds.includes(t.ask))throw Error('Выберите подсказку в поле «Что показывает компьютер?».');
  const replies=[...new Set(replyKinds(t))].sort();
  if(replies.some(k=>!kinds.includes(k)||k===t.ask))throw Error('Выберите, что отвечает игрок.');
  const method=replies.some(textKind)&&t.method==='type'?'type':'choice';
  return {ids:[...new Set(t.ids)].sort(),ask:t.ask,reply:replies.join('+'),method};
}
const taskKey=t=>JSON.stringify(cleanTask(t));
function datedTitle(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.startsWith('0000'))throw Error('Выберите дату задания.');
  const d=new Date(date+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('Проверьте дату задания.');
  return 'Задание на '+date.split('-').reverse().join('.');
}
async function getTasks(){return cloud?await rpc('tasks'):read('tasks',[]);}
async function putTask(date,comment,task){
  task=cleanTask(task);if(!task.ids.length)throw Error('Для сохранения выберите хотя бы одну страну.');
  const title=datedTitle(date);comment=comment.trim();
  if(comment.length>160)throw Error('Комментарий должен быть не длиннее 160 знаков.');
  if(cloud)return rpc('save',{date,comment,task});
  const list=read('tasks',[]);
  const same=list.find(x=>x.title===title&&x.author===session.name&&taskKey(x.task)===taskKey(task));
  if(same)Object.assign(same,{date,comment});else list.unshift({title,date,comment,task,author:session.name});
  save('tasks',list);
}
async function startRound(task,practice){
  return cloud?rpc('start',{task,practice}):{id:crypto.randomUUID(),order:shuffle(task.ids)};
}
async function finishLocal(r){
  const key='round:'+r.id;
  if(!read(key,null))save(key,{player:session.id,name:session.name,task:r.task,answers:r.answers,practice:r.practice});
}
function localBoard(task){
  const rows=new Map(),key=taskKey(task);
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);if(!k.startsWith(prefix+'round:'))continue;
    const r=JSON.parse(localStorage.getItem(k));if(r.practice)continue;
    let row=rows.get(r.player)||{id:r.player,name:r.name,hits:{},best:null};rows.set(r.player,row);
    const correct=r.answers.filter(a=>a.ok);
    correct.forEach(a=>row.hits[a.id]=(row.hits[a.id]||0)+1);
    if(taskKey(r.task)!==key)continue;
    const n=correct.length,ms=r.answers.reduce((s,a)=>s+a.ms,0);
    if(!row.best||n>row.best.n||(n===row.best.n&&ms<row.best.ms))row.best={n,ms};
  }
  return [...rows.values()].map(r=>({id:r.id,name:r.name,learned:Object.values(r.hits).filter(n=>n>=2).length,once:Object.keys(r.hits).length,n:r.best?.n??null,ms:r.best?.ms??null}));
}
const boardData=task=>cloud?rpc('board',{task}):Promise.resolve(localBoard(task));
