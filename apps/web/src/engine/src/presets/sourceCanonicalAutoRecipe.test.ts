import { expect, it } from 'vitest'
import { buildCanonicalMaterial, canonicalDefaultAutoSourceBinding, unpackCanonicalMaterial,
  type BrushDescriptor, type CanonicalDefaultAutoRecipe, type CanonicalMaterialContextV2 } from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import { sourceStrokeAuthorDescriptor } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket } from './sourceStrokeAuthor'

it('transports real seven descriptor generations through v2 with no CAS and no runtime-scale authority substitution', () => {
  let count = 0
  for (const row of stock.rows) {
    const descriptor = row.descriptor as unknown as BrushDescriptor
    const profile = 'neon64-f32-fma-v1' as const
    const compiled = sourceStrokeAuthorDescriptor(descriptor, {colorIdentity:'native-black',lodScale:1,coverageProfile:profile})
    if (!compiled.supported) throw new Error(compiled.reasons.join(','))
    const pin = canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),profile)
    const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,
      budget:{workUnits:64*1024*1024,outputBytes:16*1024*1024,drawPixels:16*1024*1024}}
    const author = new SourceStrokeAuthor(compiled.program)
    let state = author.createState(4321,7654,.3)
    for (let i=0;i<30;i++) {
      const packet:SourceAuthorPacket={x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,
        tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,
        mirroredH:i>=12&&i<22,mirroredV:false,tiltDirectionOffset:0,hover:false}
      const iterator=author.plan(state,packet)
      while(true){const next=iterator.next();if(next.done){state=next.value;break}
        const material=next.value.result?.material
        if(!material)continue
        const {opacity,flow}=next.value.result!
        if(typeof opacity!=='number'||typeof flow!=='number')throw Error('Missing resolved author strengths')
        const saved=material.resolvedSource,g=saved.geometry
        if(g?.kind!=='defaultAuto')throw Error('Missing saved auto geometry')
        const recipe:CanonicalDefaultAutoRecipe={kind:'defaultAuto',source:g.source,coverageProfile:g.coverageProfile,
          brushScale:saved.brush.scale,brushAngle:saved.brush.angle,scale:saved.shape.scale,ratio:saved.shape.ratio,rotation:saved.shape.rotation,
          subX:saved.key.subPixelX,subY:saved.key.subPixelY,width:saved.width,height:saved.height,
          mirrorH:saved.mirror.horizontal,mirrorV:saved.mirror.vertical}
        const result=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:1},draws:[{recipe,role:'primary',
          x:material.resolvedRect.x,y:material.resolvedRect.y,opacity,flow}],fences:[]},context)
        expect(atob(result.packed.slice(2)).charCodeAt(6)).toBe(0)
        const decoded=unpackCanonicalMaterial(JSON.parse(JSON.stringify(result.packed)),context)
        expect(decoded.definitions[0]).toEqual(recipe)
        expect(decoded.draws[0]!.x).toBe(material.resolvedRect.x)
        count++
      }
    }
  }
  expect(count).toBeGreaterThan(7*30)
})
