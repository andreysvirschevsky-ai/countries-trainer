'use strict';
const $=id=>document.getElementById(id), app=$('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={name:'Название страны',capital:'Столица',flag:'Флаг',map:'Страна на карте'};
const instructions={name:'Как называется страна?',capital:'Назовите столицу',flag:'Выберите флаг',map:'Покажите страну на карте'};
const modes=t=>labels[t.ask]+' → '+replyKinds(t).map(k=>labels[k]).join(' + ')+(replyKinds(t).some(textKind)?(t.method==='type'?' · ввод':' · 4 варианта'):'');
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function assignmentInfo(data={}){
 const date=data.date||today();
 datedTitle(date);
 return {date,comment:String(data.comment??data.title??'').slice(0,160)};
}
let selected=defaultTask(), round=null, tick=null, toastTimer=null, assignment=assignmentInfo(), serial=0;
function toast(msg){$('notice').textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('notice').textContent='',4500);}
function display(html){serial++;clearInterval(tick);app.innerHTML=html;$('logout').hidden=!session;window.scrollTo(0,0);}
const errorMsg=e=>e instanceof Error?e.message:'Возникла ошибка. Повторите попытку.';
function act(fn,errorId='error'){return async function(e){e?.preventDefault();const b=e?.submitter||e?.currentTarget;if(b?.tagName==='BUTTON')b.disabled=true;try{const node=$(errorId);if(node)node.textContent='';await fn(e);}catch(err){const node=$(errorId);if(node)node.textContent=errorMsg(err);else toast(errorMsg(err));}finally{if(b?.tagName==='BUTTON')b.disabled=false;}};}
function applyLink(){
  if(!location.hash.startsWith('#task='))return false;
  try{const data=JSON.parse(decodeURIComponent(location.hash.slice(6)));selected=cleanTask(data.task);if(!selected.ids.length)throw Error();assignment=assignmentInfo(data);return true;}
  catch{toast('Ссылка на задание повреждена.');return false;}
}
function setLink(info,task){const hash='#task='+encodeURIComponent(JSON.stringify({...info,task}));if(location.protocol==='file:')throw Error('Ссылкой можно поделиться после публикации игры на сайте.');history.replaceState(null,'',hash);return location.href;}
function persistSelection(){if(session)save('selection:'+session.id,{task:selected,...assignment});}
function enter(){
  if(!applyLink()){const prev=read('selection:'+session.id,null);if(prev){selected=cleanTask(prev.task);assignment=assignmentInfo(prev);}else{selected=defaultTask();assignment=assignmentInfo();}}
  setup();
}
function safeLeave(){
 if(!round||round.done||round.answers.length===round.order.length)return Promise.resolve(true);
 const dialog=$('exitDialog');
 return new Promise(resolve=>{
   dialog.returnValue='stay';
   dialog.addEventListener('close',()=>resolve(dialog.returnValue==='leave'),{once:true});
   dialog.showModal();
 });
}
$('home').onclick=async e=>{e.preventDefault();if(await safeLeave()){round=null;session?setup():welcome(false);}};
$('logout').onclick=async()=>{if(!await safeLeave())return;const old=session;if(cloud&&old){api('/auth/v1/logout',{},old.token).catch(()=>{});}remember(null);round=null;selected=defaultTask();assignment=assignmentInfo();welcome(false);};
window.addEventListener('hashchange',()=>{if(applyLink()&&session){round=null;setup();}});
function welcome(create){
 display('<div class="cover"><section class="atlas"><h1>Атлас стран</h1><p>Флаги, столицы и страны на карте</p><div id="coverMap"></div><span class="compass" aria-hidden="true">✥</span></section><section class="login"><div class="tabs"><button id="signin" class="'+(!create?'active':'')+'">Вход</button><button id="signup" class="'+(create?'active':'')+'">Первый вход</button></div><h2>'+(create?'Создать игрока':'Войти в игру')+'</h2><form id="loginform"><label for="nick">Имя игрока</label><input id="nick" minlength="2" maxlength="24" autocomplete="username" placeholder="Имя или псевдоним" required><label for="pin">PIN-код</label><input id="pin" type="password" inputmode="numeric" pattern="[0-9]{4,12}" autocomplete="'+(create?'new-password':'current-password')+'" placeholder="От 4 до 12 цифр" required>'+(create?'<label for="repeat">Повторите PIN-код</label><input id="repeat" type="password" inputmode="numeric" required autocomplete="new-password">':'')+'<p id="error" class="error" role="alert"></p><button class="primary wide">'+(create?'Создать игрока':'Войти')+' →</button></form><p class="muted">'+(cloud?'Профиль и прогресс доступны с любого устройства.':'Локальная игра · прогресс и рекорды сохраняются в этом браузере.')+'</p></section></div>');
 drawMap($('coverMap'),{cover:true});$('signin').onclick=()=>welcome(false);$('signup').onclick=()=>welcome(true);
 $('loginform').onsubmit=act(async()=>{if(create&&$('pin').value!==$('repeat').value)throw Error('PIN-коды различаются.');await login($('nick').value,$('pin').value,create);enter();});
}
const nameIndex=new Map();
for(const c of catalog)for(const name of [c.name,...c.aliases])nameIndex.set(normalize(name),c.id);
function parseNames(raw){
 const ids=new Set(),unknown=[];let congo=false;
 for(const part of raw.split(/[,;\n\t/|:!?()[\]{}•]+/)){
  const words=normalize(part.replace(/\b\d+[.)]/g,' ')).split(/\s+/).filter(Boolean);
  for(let i=0;i<words.length;){
   let found=false;
   for(let end=Math.min(i+8,words.length);end>i;end--){const key=words.slice(i,end).join(' ');if(nameIndex.has(key)){ids.add(nameIndex.get(key));i=end;found=true;break;}}
   if(!found){if(words[i]==='конго')congo=true;else unknown.push(words[i]);i++;}
  }
 }
 return {ids:[...ids],unknown,congo};
}
function setup(){
 round=null;display('<div class="row between"><h1>Настройка игры</h1><button id="records">Доска рекордов ↗</button></div><div class="grid setup-grid"><section class="panel countries-panel"><h2>Какие страны учим?</h2><div class="chips" id="regions"></div><label class="field" for="search">Список стран</label><input id="search" placeholder="Найти страну" type="search"><div class="list" id="list"></div><details><summary>Вставить список из задания</summary><div><label class="field" for="paste">Названия стран</label><textarea id="paste" placeholder="Италия, Франция, Южная Корея…"></textarea><button id="parse">Добавить страны</button><p id="parsed" role="status"></p></div></details></section><div><section class="panel"><h2>Правила раунда</h2><label class="field" for="ask">Что показывает компьютер?</label><select id="ask"></select><fieldset class="reply-options"><legend>Что отвечает игрок?</legend><div id="reply" class="chips"></div></fieldset><div id="methodBox"><label class="field" id="methodLabel" for="method"></label><select id="method"><option value="choice">Выбор из 4 вариантов</option><option value="type">Ввод с клавиатуры</option></select></div><p class="muted" id="fixedMethods"></p><p class="count" id="count"></p><details id="selectedBox"><summary>Посмотреть выбранные страны</summary><div class="chips" id="chosen"></div></details><p class="field-hint" id="startHint"></p><p class="error action-error" id="startError" role="alert"></p><button id="start" aria-describedby="startHint startError" class="primary wide">Начать раунд →</button></section><section class="panel"><h2>Общие задания</h2><div id="savedList">Загрузка…</div><label class="field" for="taskDate">На какую дату задание</label><input type="date" id="taskDate" required><p id="datePreview" class="muted"></p><label class="field" for="comment">Комментарий (по желанию)</label><input id="comment" maxlength="160" placeholder="Например, Европа — флаги"><div class="controls" style="margin-top:10px"><button id="saveTask" aria-describedby="saveHint saveError">Сохранить задание</button><button id="link">Скопировать ссылку</button></div><p class="field-hint" id="saveHint"></p><p class="error action-error" id="saveError" role="alert"></p><div id="shareFallback"></div></section></div></div><p class="muted">Игрок · '+esc(session.name)+(cloud?'':' · локальная игра')+'</p><p class="error" id="error" role="alert"></p>');
 function setFields(){ $('taskDate').value=assignment.date;$('comment').value=assignment.comment;preview(); }
 const countryHint='Отметьте хотя бы одну страну в списке, выберите часть света или нажмите «Все страны».';
 function preview(){
   const date=$('taskDate').value;
   let dateHint='';
   try{$('datePreview').textContent=datedTitle(date);}
   catch{$('datePreview').textContent='Пример: Задание на 25.11.2026';dateHint='Выберите дату в календаре, например 25 ноября 2026 года.';}
   const empty=!selected.ids.length;
   $('start').disabled=empty;
   $('startHint').textContent=empty?countryHint:'';
   $('saveHint').textContent=[empty?'Для сохранения и ссылки сначала выберите страны.':'',dateHint].filter(Boolean).join(' ');
   for(const id of ['link','saveTask'])$(id).disabled=empty||Boolean(dateHint);
 }
 function readFields(){const date=$('taskDate').value;datedTitle(date);return {date,comment:$('comment').value.trim()};}
 $('taskDate').oninput=()=>{preview();$('saveError').textContent='';if(!$('saveTask').disabled){assignment=readFields();persistSelection();}};
 $('comment').oninput=()=>{assignment.comment=$('comment').value.trim();persistSelection();};setFields();
 function update(){
   selected=cleanTask(selected);persistSelection();
   $('count').textContent='Выбрано стран: '+selected.ids.length+' из '+catalog.length;
   preview();$('startError').textContent='';$('saveError').textContent='';
   $('selectedBox').hidden=!selected.ids.length;
   $('chosen').replaceChildren();
   for(const c of catalog.filter(c=>selected.ids.includes(c.id))){const b=document.createElement('button');b.textContent=c.name+' ×';b.title='Убрать страну';b.onclick=()=>toggle([c.id],false);$('chosen').append(b);}
   const flags=new Set(selected.ids);$('list').replaceChildren();
   for(const c of catalog.filter(c=>[c.name,...c.aliases].some(n=>normalize(n).includes(normalize($('search').value))))){
     const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=flags.has(c.id);box.onchange=()=>{toggle([c.id],box.checked);};label.append(box,c.name);$('list').append(label);
   }
   const reg=$('regions');reg.replaceChildren();
   for(const [i,name] of ['Все страны',...regions].entries()){
     const ids=catalog.filter(c=>!i||c.regions.includes(i-1)).map(c=>c.id),on=ids.every(id=>flags.has(id));
     const b=document.createElement('button');b.textContent=name;b.className=on?'on':'';b.setAttribute('aria-pressed',on);b.onclick=()=>toggle(ids,!on);reg.append(b);
   }
   if(flags.size){const b=document.createElement('button');b.textContent='Очистить';b.onclick=()=>toggle([...flags],false);reg.append(b);}
   $('ask').innerHTML=Object.entries(labels).map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('');$('ask').value=selected.ask;
   const replies=replyKinds(selected);$('reply').replaceChildren();
   for(const [kind,name] of Object.entries(labels)){
     if(kind===selected.ask)continue;
     const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';
     box.checked=replies.includes(kind);box.disabled=box.checked&&replies.length===1;
     box.onchange=()=>{selected.reply=(box.checked?[...replies,kind]:replies.filter(k=>k!==kind)).join('+');update();};
     label.append(box,name);$('reply').append(label);
   }
   const textParts=replies.filter(textKind);
   $('methodBox').hidden=!textParts.length;$('method').value=selected.method;
   $('methodLabel').textContent=textParts.length===2?'Как отвечать на название страны и столицу?':textParts[0]==='name'?'Как отвечать на название страны?':'Как отвечать на столицу?';
   const fixed=[];
   if(replies.includes('flag'))fixed.push('Флаг — выбрать из четырёх изображений.');
   if(replies.includes('map'))fixed.push('Карта — нажать на страну.');
   $('fixedMethods').textContent=fixed.join(' ');$('fixedMethods').hidden=!fixed.length;
 }
 function toggle(ids,add){const set=new Set(selected.ids);for(const id of ids)add?set.add(id):set.delete(id);selected.ids=[...set];update();}
 $('search').oninput=update;
 $('parse').onclick=()=>{const result=parseNames($('paste').value);toggle(result.ids,true);const node=$('parsed');node.textContent='Распознано: '+result.ids.length+'. '+(result.unknown.length?'Уточните: '+result.unknown.join(', ')+'. ':'');if(result.congo){node.append('Какое Конго? ');for(const id of ['CG','CD']){const b=document.createElement('button');b.textContent=countries[id].name;b.onclick=()=>{toggle([id],true);b.disabled=true;};node.append(b);}}};
 $('ask').onchange=()=>{const previous=selected.ask;selected.ask=$('ask').value;const rest=replyKinds(selected).filter(k=>k!==selected.ask);selected.reply=rest.length?rest.join('+'):previous;update();};
 $('method').onchange=()=>{selected.method=$('method').value;update();};
 async function refreshTasks(){
  const host=$('savedList');try{const list=await getTasks();if(!host.isConnected)return;host.replaceChildren();
  if(!list.length){host.textContent='Пока нет сохранённых заданий.';return;}
  const sel=document.createElement('select');sel.setAttribute('aria-label','Выберите сохранённое задание');sel.append(new Option('Выберите сохранённое задание…',''));
  list.forEach((x,i)=>sel.append(new Option(x.title+(x.comment?' · '+x.comment:'')+' · '+x.task.ids.length+' стран · '+x.author,i)));sel.onchange=()=>{if(sel.value==='')return;const v=list[+sel.value];selected=cleanTask(v.task);assignment=assignmentInfo(v);setFields();update();};host.append(sel);
  }catch(e){host.textContent=errorMsg(e);}}
 $('saveTask').onclick=act(async()=>{assignment=readFields();await putTask(assignment.date,assignment.comment,cleanTask(selected));persistSelection();await refreshTasks();toast('Задание сохранено.');},'saveError');
 $('link').onclick=act(async()=>{const url=setLink(readFields(),cleanTask(selected));try{await navigator.clipboard.writeText(url);toast('Ссылка скопирована.');}catch{const field=document.createElement('input');field.value=url;field.readOnly=true;field.setAttribute('aria-label','Ссылка на задание');$('shareFallback').replaceChildren(field);field.select();}},'saveError');
 $('records').onclick=act(()=>board(selected));$('start').onclick=act(()=>begin(selected,false),'startError');update();refreshTasks();
}
const clock=ms=>{const seconds=Math.floor(ms/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+'.'+Math.floor((ms%1000)/100);};
const flagEmoji=id=>String.fromCodePoint(...[...id].map(ch=>127397+ch.charCodeAt(0)));
function flag(id){
 const wrap=document.createElement('span'),sym=document.createElement('span'),img=new Image();wrap.className='flag';
 sym.textContent=flagEmoji(id);sym.setAttribute('aria-label','Флаг');sym.style.fontSize='2.8em';wrap.append(sym);
 img.className='flag-img';img.alt='Флаг';img.onload=()=>wrap.replaceChildren(img);img.src='https://flagcdn.com/w320/'+id.toLowerCase()+'.png';return wrap;
}
function showValue(host,kind,id){if(kind==='flag')host.append(flag(id));else if(kind==='map')drawMap(host,{highlight:id});else host.textContent=countries[id][kind];}
async function begin(task,practice){
 const t=cleanTask(task);if(!t.ids.length)throw Error('Для старта отметьте хотя бы одну страну в списке или выберите часть света.');
 const v=await startRound(t,practice);round={...v,task:t,answers:[],practice,done:false,base:0};await question();
}
async function question(){
 const r=round,i=r.answers.length,id=r.order[i],t=r.task,parts=replyKinds(t);
 const multi=parts.length>1,hasMap=t.ask==='map'||parts.includes('map');
 display('<section class="quiz '+(hasMap?'map-quiz':'')+'"><div class="row between"><span>'+(r.practice?'Повтор ошибок':'Раунд')+' · Страна '+(i+1)+' из '+r.order.length+'</span><b class="timer" id="timer"></b></div><progress value="'+i+'" max="'+r.order.length+'"></progress><div class="panel"><h2>'+(multi?'Ответьте на все части':instructions[parts[0]])+'</h2><div class="prompt" id="prompt"></div><div id="answerArea"></div><div class="controls round-actions"><button class="primary" id="check" hidden>Проверить ответы</button><button id="skip">Не знаю</button><button id="exit">Выйти из раунда</button></div><div id="feedback" aria-live="polite"></div><p id="error" class="error" role="alert"></p></div></section>');
 $('exit').onclick=async()=>{if(await safeLeave())setup();};
 showValue($('prompt'),t.ask,id);
 const area=$('answerArea'),check=$('check'),choices={};
 area.inert=true;$('skip').disabled=true;check.hidden=!multi;check.disabled=true;
 let ready=false,busy=false,answered=false,started=0;
 $('timer').textContent=clock(r.base);
 function capture(kind,value){
   choices[kind]=value;
   if(multi)check.disabled=!parts.every(k=>Object.hasOwn(choices,k));
   else return submit();
 }
 for(const kind of parts){
   const block=document.createElement('section');area.append(block);
   if(multi){const heading=document.createElement('h3');heading.textContent=instructions[kind];block.append(heading);}
   if(kind==='map'){
     const map=document.createElement('div');block.append(map);drawMap(map,{answer:code=>capture(kind,code)});
   }else if(textKind(kind)&&t.method==='type'){
     const form=document.createElement('form'),input=document.createElement('input');
     input.autocomplete='off';input.required=true;input.id='typed-'+kind;input.setAttribute('aria-label',labels[kind]);input.placeholder=kind==='name'?'Введите название страны':'Введите столицу';
     if(!multi){const label=document.createElement('label');label.className='field';label.htmlFor=input.id;label.textContent='Ответ игрока';block.append(label);}
     form.append(input);block.append(form);
     function readText(){
       const typed=normalize(input.value),c=countries[id],accepted=kind==='name'?[c.name,...c.aliases]:c.capitals;
       if(typed)choices[kind]=accepted.some(n=>normalize(n)===typed)?id:null;
       else delete choices[kind];
       check.disabled=!parts.every(k=>Object.hasOwn(choices,k));
     }
     input.oninput=readText;form.onsubmit=e=>{e.preventDefault();readText();if(parts.every(k=>Object.hasOwn(choices,k)))return submit();};
     if(!multi){const b=document.createElement('button');b.className='primary';b.textContent='Ответить';form.append(b);}
   }else{
     const group=document.createElement('div');group.className='answers';block.append(group);
     const nearby=shuffle(catalog.filter(c=>c.id!==id&&c.regions.some(g=>countries[id].regions.includes(g))).map(c=>c.id)).slice(0,2);
     const others=shuffle(catalog.filter(c=>c.id!==id&&!nearby.includes(c.id)).map(c=>c.id));
     for(const code of shuffle([id,...nearby,...others.slice(0,3-nearby.length)])){
       const b=document.createElement('button');b.setAttribute('aria-pressed','false');showValue(b,kind,code);
       b.onclick=()=>{for(const item of group.children)item.setAttribute('aria-pressed',String(item===b));return capture(kind,code);};group.append(b);
     }
   }
 }
 check.onclick=()=>submit();
 $('skip').onclick=()=>{for(const k of parts)if(!Object.hasOwn(choices,k))choices[k]=null;return submit();};
 async function arm(){
   if(cloud)await rpc('show',{id:r.id,index:i});
   if(round!==r||!area.isConnected)return;
   ready=true;area.inert=false;$('skip').disabled=false;started=performance.now();
   tick=setInterval(()=>$('timer').textContent=clock(r.base+performance.now()-started),80);
 }
 async function submit(){
   if(!ready||busy||answered||!parts.every(k=>Object.hasOwn(choices,k)))return;
   busy=true;area.inert=true;check.disabled=true;$('skip').disabled=true;
   const localMs=Math.round(performance.now()-started);clearInterval(tick);
   try{
     const a=cloud?await rpc('answer',{id:r.id,index:i,choices,choice:choices[parts[0]]}):{id,ok:parts.every(k=>choices[k]===id),ms:localMs};
     if(round!==r||!area.isConnected)return;
     answered=true;r.answers.push(a);r.base+=a.ms;
     if(i+1===r.order.length&&!cloud)await finishLocal(r);
     $('timer').textContent=clock(r.base);$('skip').hidden=true;check.hidden=true;area.replaceChildren();$('error').textContent='';
     const fb=$('feedback');fb.className='feedback'+(a.ok?'':' wrong');
     const missed=parts.filter(k=>choices[k]!==id);
     fb.innerHTML='<strong>'+(a.ok?'Верно!':'Неверно!')+'</strong>'+(multi&&missed.length?' <span>('+missed.map(k=>labels[k].toLowerCase()).join(', ')+')</span>':'')+'<p>'+esc(countries[id].name)+' · '+esc(countries[id].capital)+'</p>';
     const next=document.createElement('button');next.className='primary';next.textContent=i+1===r.order.length?'Посмотреть результат':'Следующий вопрос →';fb.append(next);
     next.onclick=act(async()=>{if(i+1===r.order.length){r.done=true;await results();}else await question();});next.focus();
   }catch(e){if(area.isConnected){$('error').textContent=errorMsg(e);busy=false;area.inert=false;check.disabled=false;$('skip').disabled=false;}}
 }
 try{await arm();}catch(e){if(area.isConnected){$('error').textContent=errorMsg(e);const retry=document.createElement('button');retry.textContent='Открыть вопрос повторно';retry.onclick=act(question);$('error').append(retry);}}
}
async function results(){
 const r=round,n=r.answers.filter(a=>a.ok).length,miss=r.answers.filter(a=>!a.ok);
 display('<section class="quiz panel"><h1>Раунд завершён</h1><p>'+esc(modes(r.task))+'</p><div class="metrics"><div><b>'+n+' / '+r.order.length+'</b>верно</div><div><b>'+Math.round(100*n/r.order.length)+'%</b>точность</div><div><b>'+clock(r.base)+'</b>время ответов</div><div><b>'+(r.base/1000/r.order.length).toFixed(1)+'</b>секунд на страну</div></div><p id="progressInfo"></p><div id="mistakes"></div><div class="controls"><button class="primary" id="again">Сыграть ещё раз</button>'+(miss.length?'<button id="retry">Повторить ошибки</button>':'')+'<button id="settings">К настройкам</button><button id="scores">Рекорды</button></div><p class="error" id="error"></p></section>');
 if(miss.length){$('mistakes').innerHTML='<h2>Страны для повторения</h2>';for(const a of miss){const p=document.createElement('p');p.textContent=countries[a.id].name+' · '+countries[a.id].capital;if(replyKinds(r.task).includes('flag'))p.append(' ',flag(a.id));$('mistakes').append(p);}}
 $('again').onclick=act(()=>begin(r.task,r.practice));if(miss.length)$('retry').onclick=act(()=>begin({...r.task,ids:miss.map(a=>a.id)},true));
 $('settings').onclick=setup;$('scores').onclick=act(()=>board(selected));
 const node=$('progressInfo');try{const me=(await boardData(r.task)).find(x=>x.id===session.id);node.textContent='Верно хотя бы раз: '+(me?.once||0)+' · Выучено стран (2 верных ответа): '+(me?.learned||0)+' из 195.'+(r.practice?' Повтор ошибок — тренировочный раунд.':'');}catch(e){node.textContent=errorMsg(e);}
}
async function board(task){
 const t=cleanTask(task),rows=await boardData(t);let scope=t.ids.length?'task':'all',sort=scope==='task'?'n':'learned',asc=false;
 display('<div class="row between"><h1>Доска рекордов</h1><button id="settings">К настройкам</button></div><section class="panel board"><div class="controls"><button id="byTask">Это задание</button><button id="overall">Все задания</button></div><p class="muted" id="boardHint"></p><div id="ranks"></div></section>');
 $('settings').onclick=setup;$('byTask').disabled=!t.ids.length;
 function render(){
 const filtered=scope==='task'?rows.filter(x=>x.n!==null):[...rows];
 $('byTask').className=scope==='task'?'on':'';$('overall').className=scope==='all'?'on':'';
 $('boardHint').textContent=scope==='task'?modes(t)+' · Стран в задании: '+t.ids.length+'. Лучший полный раунд каждого игрока.':'Каждая страна засчитывается после двух верных ответов в разных полных раундах. Все направления учитываются вместе.';
 filtered.sort((a,b)=>(sort==='name'?a.name.localeCompare(b.name,'ru'):a[sort]-b[sort])*(asc?1:-1)||(scope==='task'?a.ms-b.ms:0)||a.name.localeCompare(b.name,'ru'));
 const cols=scope==='task'?[['name','Игрок'],['n','Точность'],['ms','Время'],['learned','Выучено стран (2 верных ответа)']]:[['name','Игрок'],['once','Верно хотя бы раз'],['learned','Выучено стран (2 верных ответа)']];
 const ranks=$('ranks');if(!filtered.length){ranks.innerHTML='<p>Пока нет завершённых раундов'+(scope==='task'?' по этому заданию':'')+'.</p>';return;}
 ranks.innerHTML='<table><thead><tr>'+cols.map(([k,s])=>'<th><button data-sort="'+k+'">'+s+(sort===k?(asc?' ↑':' ↓'):'')+'</button></th>').join('')+'</tr></thead><tbody>'+filtered.map(r=>'<tr>'+cols.map(([k])=>'<td>'+esc(k==='ms'?clock(r.ms):k==='n'?r.n+' / '+t.ids.length+' · '+Math.round(100*r.n/t.ids.length)+'%':r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 ranks.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{const k=b.dataset.sort;asc=k===sort?!asc:['ms','name'].includes(k);sort=k;render();});
 }
 $('byTask').onclick=()=>{scope='task';sort='n';asc=false;render();};$('overall').onclick=()=>{scope='all';sort='learned';asc=false;render();};render();
}
if(session)enter();else welcome(!cloud&&!Object.keys(localStorage).some(k=>k.startsWith(prefix+'player:')));
