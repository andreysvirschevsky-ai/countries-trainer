// Робинсон. Параллели и меридианы служат только для проекции, карта не содержит подписей.
function drawMap(host,{highlight=null,answer=null,cover=false,wrong=null}={}){
  const ns='http://www.w3.org/2000/svg';
  const el=(tag,attrs,parent)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;};
  host.replaceChildren();host.className='map-box'+(answer?' map-active':'');
  const svg=el('svg',{viewBox:'0 0 1000 500',role:'img','aria-label':'Цветная политическая карта мира без подписей'},host);
  const group=el('g',{},svg),palette=['#cfaf8d','#c8cc94','#e6c079','#94beb3','#d99d86','#b1b9ce','#b1c990'];
  const fill=id=>id===highlight?'#df602d':id===wrong?'#985566':null;
  const ys=cover?'#214e4c':'#526f68';
  for(const [id,path,col] of WORLD.shapes){
    el('path',{d:path,fill:fill(id)||palette[col%7],stroke:id===highlight?'#4b241a':ys,'stroke-width':id===highlight?1.4:0.45,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke','data-id':id},group);
  }
  const pins=[];
  if(!cover){
    for(const [id,x,y] of WORLD.pins){
      pins.push(el('circle',{cx:x,cy:y,r:2.25,fill:fill(id)||'#e2c887',stroke:'#46605b','stroke-width':0.6,'vector-effect':'non-scaling-stroke','data-id':id},group));
    }
    if(highlight){for(const node of group.querySelectorAll('[data-id="'+highlight+'"]')) group.append(node);}
  }
  if(cover)return;
  let x=0,y=0,w=1000,drag=null,moved=false;
  function viewport(){x=Math.max(-5,Math.min(1005-w,x));y=Math.max(-5,Math.min(505-w/2,y));svg.setAttribute('viewBox',[x,y,w,w/2].join(' '));pins.forEach(p=>p.setAttribute('r',Math.min(2.25,w/270)));}
  function point(ev){const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  function zoom(f,p={x:x+w/2,y:y+w/4}){const nw=Math.max(1.4,Math.min(1000,w*f));x=p.x-(p.x-x)*nw/w;y=p.y-(p.y-y)*nw/w;w=nw;viewport();}
  const controls=document.createElement('div');controls.className='map-controls';host.append(controls);
  for(const [label,fn,title] of [['+',()=>zoom(.5),'Приблизить'],['−',()=>zoom(2),'Отдалить'],['↺',()=>{x=y=0;w=1000;viewport();},'Вся карта']]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;controls.append(b);
  }
  const expand=document.createElement('button');expand.type='button';expand.textContent='Развернуть карту';controls.append(expand);
  function expandMap(open){
    host.classList.toggle('expanded-map',open);expand.textContent=open?'Свернуть карту':'Развернуть карту';
    expand.setAttribute('aria-expanded',String(open));
  }
  expand.onclick=()=>expandMap(!host.classList.contains('expanded-map'));
  host.onkeydown=e=>{if(e.key==='Escape')expandMap(false);};
  let selectedId=null;
  function choose(id){
    if(selectedId)for(const node of group.querySelectorAll('[data-id="'+selectedId+'"]'))node.classList.remove('picked-country');
    for(const node of group.querySelectorAll('[data-id="'+id+'"]'))node.classList.add('picked-country');
    selectedId=id;expandMap(false);answer(id);
  }
  svg.onwheel=e=>{e.preventDefault();zoom(e.deltaY>0?1.3:1/1.3,point(e));};
  svg.onpointerdown=e=>{if(!e.isPrimary)return;drag={x:e.clientX,y:e.clientY,ox:x,oy:y,unit:1/svg.getScreenCTM().a,start:e.target.dataset.id};moved=false;svg.setPointerCapture(e.pointerId);};
  svg.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)moved=true;if(moved){x=drag.ox-dx*drag.unit;y=drag.oy-dy*drag.unit;viewport();}};
  svg.onpointerup=e=>{if(!drag)return;const id=drag.start;drag=null;if(!moved&&answer&&countries[id])choose(id);};
  svg.onpointercancel=()=>{drag=null;};
  const pin=highlight&&WORLD.pins.find(p=>p[0]===highlight);
  if(pin){x=pin[1]-35;y=pin[2]-17.5;w=70;viewport();}
}
