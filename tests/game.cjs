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
   const testName='Тест-'+require('node:crypto').randomUUID().slice(0,8);
   const testPin=String(require('node:crypto').randomInt(10000)).padStart(4,'0');
   await page.locator('#nick').fill(testName);
   await page.locator('#pin').fill(testPin);await page.locator('#repeat').fill(testPin);
   await page.getByRole('button',{name:'Создать игрока'}).click();
   await page.locator('#search').fill('Франция');await page.getByLabel('Франция',{exact:true}).check();
   await page.locator('#ask').selectOption('name');
   await page.locator('#reply').getByText('Страна на карте').click();
   await page.locator('#taskDate').fill('2026-11-25');await page.locator('#comment').fill('Европа — флаги');
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
   await page.locator('#feedback button').click();assert.match(await page.locator('.metrics').innerText(),/0 \/ 1/);
   for(let i=0;i<2;i++){
     await page.locator('#again').click();await choose('FR');
     await page.locator('#answerArea .answers button').filter({hasText:'🇫🇷'}).click();
     await page.locator('#check').click();await page.locator('#feedback button').click();
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
   assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
