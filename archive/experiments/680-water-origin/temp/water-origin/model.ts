import { writeFileSync } from 'node:fs'
import { watercolorWaterClock, watercolorWaterLoad, watercolorPigmentLoad, watercolorPigmentRate, watercolorWetPull, watercolorExcessFromSurplus, watercolorStandingWater, watercolorPuddleFromSurplus } from '../../apps/web/src/engine/src/presets/watercolorPresets'
import { ribbonProfileFor } from '../../apps/web/src/engine/src/dabs/ribbonProfile'
import { ribbonWaterDelivery } from '../../apps/web/src/engine/src/dabs/ribbonStrokeMath'
const rows: unknown[] = []
for (const priorWet of [0, 1]) {
 const profile = ribbonProfileFor('watercolor','normal:100:100:PB29:round',priorWet)
 const delivery = ribbonWaterDelivery(profile)
 let used=0
 const samples=[]
 for (let i=0;i<=200;i++) {
  const pigUsed=i/10
  if(i>0)used=watercolorWaterClock(used,.1,priorWet)
  const load=watercolorWaterLoad(used)
  const pigmentLeft=watercolorPigmentLoad(pigUsed,1)*watercolorPigmentRate(1)*watercolorWetPull(priorWet)
  const excess=watercolorExcessFromSurplus(pigUsed,priorWet,0)
  if(i%10===0)samples.push({radii:pigUsed,waterClock:used,load,standing:watercolorStandingWater(1,delivery.retain,priorWet,load),pigmentLeft,excess,pigmentDose:profile.depositPerRadius*pigmentLeft*excess,pigmentGate:.45+.55*(1-priorWet),puddle:watercolorPuddleFromSurplus((1-priorWet)*Math.exp(-pigUsed/1.2),priorWet),compositeWetGain:1+.7*priorWet,compositeWetPush:.5*priorWet})
 }
 rows.push({priorWet,delivery,profile:{depositPerRadius:profile.depositPerRadius,spreadPx:profile.spreadPx,spreadOfRadius:profile.spreadOfRadius,granulation:profile.granulation,edgeSoft:profile.edgeSoft,edgeWander:profile.edgeWander},samples})
}
writeFileSync('temp/water-origin/model.json',JSON.stringify(rows,null,2))
console.log(JSON.stringify(rows))
