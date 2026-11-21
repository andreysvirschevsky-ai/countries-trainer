// Сквозная проверка интерфейса в отдельном профиле, без записи в школьную базу.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   await page.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:'window.ATLAS_CONFIG={url:"",key:""};'}));
   await page.route(/^https:\/\//,r=>r.abort());
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8080');
   for(const width of [390,1440]){
     await page.setViewportSize({width,height:900});
     const fox=await page.locator('.brand-fox').boundingBox(),cat=await page.locator('#cat').boundingBox();
     assert.equal(fox.width,36);assert.equal(fox.height,36);assert.ok(fox.height<=cat.height);
   }
   const headerPlayer=page.locator('header #headerPlayer');
   assert.ok(await headerPlayer.isHidden());
   const testName='Тест-'+require('node:crypto').randomUUID().slice(0,8);
   const testPin=String(require('node:crypto').randomInt(10000)).padStart(4,'0');
   await page.locator('#nick').fill(testName);
   await page.locator('#pin').fill(testPin);await page.locator('#repeat').fill(testPin);
   await page.getByRole('button',{name:'Создать игрока'}).click();
   await page.locator('#startHint').waitFor();
   assert.equal(await headerPlayer.textContent(),'Игрок · '+testName+' · локальная игра');
   assert.ok(!(await page.locator('main').innerText()).includes(testName));
   for(const width of [390,1440]){
     await page.setViewportSize({width,height:900});
     const player=await headerPlayer.boundingBox();
     assert.ok(Math.abs(player.x+player.width/2-width/2)<1);
   }
   assert.match(await page.locator('#startHint').innerText(),/Отметьте хотя бы одну страну/);
   assert.ok(await page.locator('#saveTask').isDisabled());
   assert.ok((await page.locator('#list').boundingBox()).height>300);
   await page.locator('#search').fill('Франция');await page.getByLabel('Франция',{exact:true}).check();
   await page.locator('#ask').selectOption('name');
   await page.locator('#reply').getByText('Страна на карте').click();
   assert.match(await page.locator('#fixedMethods').innerText(),/Карта — нажать на страну/);
   await page.getByLabel('На какую дату задание').fill('');
   assert.match(await page.locator('#saveHint').innerText(),/дату в календаре/);
   assert.ok(await page.locator('#saveTask').isDisabled());assert.ok(await page.locator('#start').isEnabled());
   await page.locator('#taskDate').fill('2026-11-25');await page.locator('#comment').fill('Европа — флаги');
   // Воспроизводим отказ прежней SQL-функции без обращения к рабочей базе.
   await page.evaluate(()=>{
     const original={api,startRound,putTask};
     window.restoreApi=()=>{api=original.api;startRound=original.startRound;putTask=original.putTask;};
     api=async()=>{throw Error('Некорректное задание.');};
     startRound=task=>rpc('start',{task});putTask=(date,comment,task)=>rpc('save',{task,date,comment});
   });
   await page.locator('#start').click();assert.match(await page.locator('#startError').innerText(),/setup.sql/);
   await page.locator('#saveTask').click();assert.match(await page.locator('#saveError').innerText(),/setup.sql/);
   await page.evaluate(()=>window.restoreApi());
   await page.locator('#saveTask').click();
   const saved=page.locator('#savedList option').filter({hasText:'Задание на 25.11.2026'});
   await saved.waitFor({state:'attached'});assert.match(await saved.textContent(),/Европа — флаги/);
   await page.locator('#start').click();
   await page.locator('#exit').click();await page.getByRole('button',{name:'Остаться',exact:true}).click();
   assert.ok(await page.locator('#timer').isVisible());
   const map=page.locator('.map-active');
   await map.getByRole('button',{name:'Развернуть карту'}).click();
   assert.equal(Math.round((await map.boundingBox()).width),1440);
   await map.getByRole('button',{name:'Свернуть карту'}).click();
   const choose=async id=>{
     const point=await map.evaluate((host,id)=>{
       const path=host.querySelector('path[data-id="'+id+'"]');
       const box=path.getBoundingClientRect(),svg=host.querySelector('svg');
       for(let y=box.top+1;y<box.bottom;y+=2)for(let x=box.left+1;x<box.right;x+=2){
         if(document.elementFromPoint(x,y)===path&&svg.contains(path))return {x,y};
       }
       throw Error('Нет доступной области '+id);
     },id);await page.mouse.click(point.x,point.y);
   };
   await choose('IT');await page.locator('#answerArea .answers button').filter({hasText:'🇫🇷'}).click();
   await page.locator('#check').click();assert.match(await page.locator('#feedback').innerText(),/Неверно!.*страна на карте/s);
   await page.locator('#feedback > button.primary').click();assert.match(await page.locator('.metrics').innerText(),/0 \/ 1/);
   for(let i=0;i<2;i++){
     await page.locator('#again').click();await choose('FR');
     await page.locator('#answerArea .answers button').filter({hasText:'🇫🇷'}).click();
     await page.locator('#check').click();await page.locator('#feedback > button.primary').click();
   }
   assert.match(await page.locator('#progressInfo').innerText(),/2 верных ответа\): 1/);
   await page.locator('#scores').click();await page.getByRole('button',{name:'Все задания'}).click();
   assert.ok((await page.locator('#ranks').innerText()).includes(testName));
   await page.locator('#settings').click();await page.locator('#start').click();await page.locator('#exit').click();
   await page.locator('#exitDialog').getByRole('button',{name:'Выйти',exact:true}).click();
   await page.getByRole('heading',{name:'Настройка игры'}).waitFor();await page.locator('#ask').selectOption('flag');
   await page.locator('#reply').getByText('Название страны').click();
   await page.locator('#reply').getByText('Страна на карте').click();
   await page.locator('#method').selectOption('type');
   await page.locator('#start').click();
   assert.equal(await page.locator('#prompt').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(198, 214, 222)');
   const input=await page.locator('#typed-name').boundingBox(),actions=await page.locator('.round-actions').boundingBox();
   assert.ok(actions.y>input.y+input.height+10);
   await page.locator('#typed-name').fill('Моя догадка');
   await page.getByRole('button',{name:'Ответить',exact:true}).click();
   assert.match(await page.locator('#feedback').innerText(),/Моя догадка/);
   assert.equal(await page.locator('#prompt .flag').count(),1);
   for(const ask of ['flag','name','capital','map']){
     for(const reply of ['flag','name','capital','map'].filter(k=>k!==ask)){
       await page.evaluate(({ask,reply})=>begin({ids:['FR'],ask,reply,method:'choice'},false),{ask,reply});
       if(reply==='map')await choose('IT');
       else{
         const wrong=page.locator('#answerArea .answers button').filter({hasNotText:reply==='flag'?'🇫🇷':reply==='capital'?'Париж':'Франция'}).first();
         await wrong.click();
       }
       const review=page.locator('#feedback .answer-review');
       assert.equal(await review.getAttribute('data-kind'),reply);
       assert.ok(await review.locator('.review-picked').isVisible());
       assert.match(await review.locator('.review-correct').innerText(),reply==='capital'?/Париж/:/Франция/);
       if(reply==='flag'){
         assert.equal(await review.locator('.flag').count(),2);
         await page.locator('#feedback > button.primary').click();
         for(const width of [390,1440]){
           await page.setViewportSize({width,height:900});
           const lastCountry=page.locator('#mistakes details').last();
           for(const open of [false,true]){
             if(open)await lastCountry.locator('summary').click();
             if(open)await lastCountry.locator('.review-correct .flag').waitFor();
             const row=await lastCountry.boundingBox();
             const button=await page.locator('#again').boundingBox();
             assert.ok(button.y-(row.y+row.height)>=24);
           }
           await lastCountry.locator('summary').click();
         }
       }
       if(reply==='map')assert.ok(await review.locator('.map-box svg').isVisible());
     }
   }
   await page.evaluate(()=>begin({ids:['FR'],ask:'name',reply:'flag',method:'choice'},false));
   await page.locator('#skip').click();
   assert.match(await page.locator('#feedback .review-picked').innerText(),/Нет ответа/);
   assert.equal(await page.locator('#feedback .review-correct .flag').count(),1);
   assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
