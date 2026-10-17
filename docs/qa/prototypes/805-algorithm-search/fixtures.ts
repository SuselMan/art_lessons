import type {AlgorithmInput,PigmentEncoding} from './protocol'
export const fixtureIds=['dot','wave','water-only','water-stroke','two-colors','crosses','blue-yellow','fine-detail','border','wave-open','dry-stroke','isolated-pools','variable-wash'] as const
export type FixtureId=typeof fixtureIds[number]
export const fixtureInfo:Record<FixtureId,{label:string;description:string}>={
 dot:{label:'Точка',description:'Один широкий отпечаток синей кисти'},
 wave:{label:'Широкая волна',description:'Кисть320 через значительную часть листа'},
 'water-only':{label:'Только вода',description:'Мокрая область без пигмента: краска не должна появляться'},
 'water-stroke':{label:'Мазок через лужу',description:'Узкая синяя линия пересекает широкую мокрую область'},
 'two-colors':{label:'Два цвета',description:'Пересечение синего и розового пигмента в общей мокрой области'},
 'blue-yellow':{label:'Синий и жёлтый',description:'Проверка смешения пигментов, а не только размытияRGB'},
 'fine-detail':{label:'Тонкий след',description:'Мелкие детали на мокрой и почти сухой бумаге'},
 'wave-open':{label:'Волна с открытыми изгибами',description:'Два крупных изгиба широкой кисти вместо многократного наложения'},
 border:{label:'У края листа',description:'След касается границы расчётного поля'},
 crosses:{label:'Повторные пересечения',description:'Три перекрывающихся следа с разным количеством пигмента'},
 'dry-stroke':{label:'Сухой контроль',description:'Тот же пигмент, что в мазке через лужу, но воды нет: перенос запрещён'},
 'isolated-pools':{label:'Две отдельные лужи',description:'Синий пигмент только в левой луже; правая отделена сухим промежутком'},
 'variable-wash':{label:'Неравномерная заливка',description:'Перекрывающиеся отпечатки с разным количеством краски на предварительно смоченной бумаге'},
}
function hash(x:number,y:number,seed:number){let h=Math.imul(x^seed,374761393)^Math.imul(y,668265263);h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0}
export function paperBytes(size:number,seed=805){const out=new Uint8Array(size*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const fine=(hash(x,y,seed)&255)-128,coarse=(hash(x>>3,y>>3,seed+1)&255)-128,fibre=(hash(x>>1,y>>5,seed+2)&255)-128
 out[y*size+x]=Math.round(128+fine*.18+coarse*.13+fibre*.08)
}return out}
export function createFixture(id:FixtureId,size=1024,encoding:PigmentEncoding='premultiplied-rgb'):AlgorithmInput{
 if(!fixtureIds.includes(id))throw Error('Unknown fixture '+id)
 const rgba=new Uint8Array(size*size*4),water=new Uint8Array(size*size),paper=paperBytes(size),scale=size/1024
 const dot=(points:readonly (readonly number[])[],radius:number,color:readonly number[],opacity:number,wet:number)=>{
  const mask=new Uint8Array(size*size),r=radius*scale
  for(const point of points){const cx=point[0]*scale,cy=point[1]*scale
   for(let y=Math.max(0,Math.floor(cy-r-1));y<Math.min(size,Math.ceil(cy+r+1));y++)for(let x=Math.max(0,Math.floor(cx-r-1));x<Math.min(size,Math.ceil(cx+r+1));x++){
    const coverage=Math.max(0,Math.min(1,r+.5-Math.hypot(x+.5-cx,y+.5-cy))),i=y*size+x
    mask[i]=Math.max(mask[i],Math.round(coverage*255))
   }
  }
  for(let i=0;i<mask.length;i++){if(!mask[i])continue;water[i]=Math.max(water[i],Math.round(mask[i]*wet));const a=Math.round(mask[i]*opacity*(.85+.30*paper[i]/255)),inv=255-a,p=i*4
   for(let c=0;c<3;c++)rgba[p+c]=encoding==='optical-density'?Math.min(255,rgba[p+c]+Math.round(a*Math.min(4,-Math.log(Math.max(color[c]/255,.02)))/4)):Math.min(255,Math.round(color[c]*a/255+rgba[p+c]*inv/255))
   rgba[p+3]=encoding==='optical-density'?Math.min(255,a+rgba[p+3]):Math.min(255,a+Math.round(rgba[p+3]*inv/255))
  }
 }
 const blue=[38,136,211],rose=[206,38,124],yellow=[231,190,40],wave=Array.from({length:101},(_,i)=>{const t=i/100;return[200+624*t,700-376*t+65*Math.sin(12*Math.PI*t)]})
 const line=(x0:number,y0:number,x1:number,y1:number)=>Array.from({length:65},(_,i)=>[x0+(x1-x0)*i/64,y0+(y1-y0)*i/64])
 if(id==='dot')dot([[512,512]],150,blue,.34,.95)
 if(id==='wave')dot(wave,160,blue,.34,.95)
 if(id==='water-only')dot([[430,500],[510,520],[590,500]],160,blue,0,.95)
 if(id==='water-stroke'){dot([[430,500],[510,520],[590,500]],180,blue,0,.95);dot(line(180,700,830,330),45,blue,.5,.6)}
 if(id==='two-colors'){dot(line(240,660,780,360),125,blue,.4,.95);dot(line(290,320,750,720),110,rose,.4,.95)}
 if(id==='crosses'){dot(wave,95,blue,.34,.9);dot(line(250,260,730,780),105,rose,.3,.8);dot(line(180,530,850,530),70,yellow,.25,.7)}
 if(id==='blue-yellow'){dot(line(240,660,780,360),125,blue,.4,.95);dot(line(290,320,750,720),110,yellow,.4,.95)}
 if(id==='fine-detail'){dot([[500,500]],230,blue,0,.95);dot(line(200,430,830,570),6,blue,.5,.05);dot(line(220,600,790,350),12,rose,.4,.05)}
 if(id==='wave-open')dot(Array.from({length:101},(_,i)=>{const t=i/100;return[180+664*t,512+240*Math.sin(4*Math.PI*t)]}),160,blue,.34,.95)
 if(id==='border')dot(line(5,80,980,18),80,blue,.4,.9)
 if(id==='dry-stroke')dot(line(180,700,830,330),45,blue,.5,0)
 if(id==='isolated-pools'){dot([[320,512],[704,512]],140,blue,0,.95);dot([[320,512]],70,blue,.5,.95)}
 if(id==='variable-wash'){
  const path=Array.from({length:25},(_,i)=>{const t=i/24;return[180+664*t,512+140*Math.sin(2*Math.PI*t)]})
  dot(path,100,blue,0,.95)
  for(let i=0;i<path.length;i++)dot([path[i]],42+12*Math.sin(i*.5),blue,.10+.08*(.5+.5*Math.cos(i*.7)),.65)
 }
 return{size,rgba,water,paper,seed:805,encoding}
}
