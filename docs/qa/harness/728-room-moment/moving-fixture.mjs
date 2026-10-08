/** Controlled PointerInput samples, not synthesized canonical dabs. */
export const movingFixture=[
 {label:'water400',preset:'normal:100:0:PB29:round',color:[.2,0,.6],points:[[400,400]]},
 {label:'purple400',preset:'normal:100:100:PB29:round',color:[.2,0,.6],points:[[350,400]]},
 {label:'yellow400',preset:'normal:100:100:PB29:round',color:[.8,.6,0],points:[[450,400]]},
 {label:'drag400',preset:'normal:100:100:PB29:round',color:[.2,0,.6],points:[[350,400],[368,400],[386,400],[404,400],[422,400],[440,400]]},
]
export function assertMovingFixture(fixture=movingFixture){
 if(fixture.length!==4||fixture.some(s=>s.points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<200||y<200||x>824||y>824)))throw Error('Bounded single1024 tile brush400 fixture required')
 const drag=fixture.at(-1).points
 if(drag.length>8||drag.length<2||drag.every(([x,y])=>x===drag[0][0]&&y===drag[0][1]))throw Error('Meaningful bounded nonzero direction required')
 return fixture
}
