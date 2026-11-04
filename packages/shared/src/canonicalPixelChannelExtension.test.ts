import {it,expect} from 'vitest'
import fixture from './fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json'
import type {BrushDescriptor} from './brushes.js'
import {canonicalPixelSourceComposition} from './canonicalBrushCapability.js'
import {canonicalSourceMaterialContext,buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {CANONICAL_PIXEL_BROWSER_CHANNEL_OUTER_BLENDS as modes,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_RASTER_PROFILE as A,canonicalStrokeCompositionExtensions,isCanonicalStrokeComposition,decodeCanonicalStrokeFrame} from './canonicalStrokeFrame.js'
const raws=['equivalence','additive_subtractive','arc_tangent','negation','inverse_subtract','grain_merge','grain_extract','allanon','geometric_mean','parallel','reflect','glow','freeze','heat','glow_heat','heat_glow','reflect_freeze','freeze_reflect','heat_glow_freeze_reflect_hybrid','hard_mix_softer_photoshop','penumbra a','penumbra b','penumbra c','penumbra d','flat_light','xor','or','and','nand','nor','xnor','implication','not_implication','converse','not_converse','tint','inc_saturation','dec_saturation','inc_luminosity','dec_luminosity','color_hsl','hue_hsl','saturation_hsl','inc_saturation_hsl','dec_saturation_hsl','lightness','inc_lightness','dec_lightness','color_hsv','hue_hsv','saturation_hsv','inc_saturation_hsv','dec_saturation_hsv','value','inc_value','dec_value','color_hsi','hue_hsi','saturation_hsi','inc_saturation_hsi','dec_saturation_hsi','intensity','inc_intensity','dec_intensity','gamma_dark','gamma_light','gamma_illumination','easy dodge','easy burn','pnorm_a','pnorm_b','super_light','soft_light_ifs_illusions','soft_light_pegtop_delphi','tint_ifs_illusions','shade_ifs_illusions','fog_lighten_ifs_illusions','fog_darken_ifs_illusions','modulo','modulo_continuous','divisive_modulo','divisive_modulo_continuous','modulo_shift','modulo_shift_continuous','hard overlay','interpolation','interpolation 2x','lambert_lighting','lambert_lighting_gamma2.2','combine_normal','tangent_normalmap','copy_red','copy_green','copy_blue','behind','luminosity_sai','greater','copy','destination-in','destination-atop','alphadarken','marker','dissolve'] as const
function original(raw:string,mode:string):BrushDescriptor{
 const d=JSON.parse(JSON.stringify(fixture.descriptor));d.sourceStamp.settings.CompositeOp=raw;d.behavior.rendering.blendMode=mode;return d
}
it('binds exact registered native raw aliases and rejects unknown or conflicting raw source without opening G',()=>{
 for(const [i,mode]of modes.entries()){
  const d=original(raws[i],mode)
  expect(canonicalPixelSourceComposition(d,B)?.outerBlend).toBe(mode)
  expect(canonicalPixelSourceComposition(d,G)).toBeUndefined()
  expect(canonicalPixelSourceComposition(original(raws[i]+'-unknown',mode),B)).toBeUndefined()
  expect(canonicalPixelSourceComposition(original(raws[i],'normal'),B)).toBeUndefined()
 }
 expect(canonicalPixelSourceComposition(original('luminize','luminosity'),B)?.outerBlend).toBe('luminosity')
 expect(canonicalPixelSourceComposition(original('luminosity_sai','luminosity'),B)).toBeUndefined()
})
it('round trips recorded WASH/direct frame grammar per role with exact law (not an author grant) and refuses historical profile or altered marker',()=>{
 const asset='asset:'+'1'.repeat(64),source={kind:'image',asset,brushScale:1,brushAngle:0} as const
 for(const blend of modes)for(const mode of ['wash','buildup'] as const)for(const masked of [false,true]){
  const law=mode==='wash'?'generic-separable-u8-v1':'pixel-direct-composite-browser-v1'
  const material=canonicalSourceMaterialContext({version:2,outerCompositionLaw:law,assets:[{id:asset,size:1,x:0,y:0,width:1,height:1}],primarySource:source,...masked?{maskSource:source,maskingBlend:'multiply'}:{},budget:{workUnits:10000,outputBytes:10000,drawPixels:10000}})
  const composition={mode,outerBlend:blend,alphaDarken:'hard' as const,outerResourceOpacity:.8}
  expect(isCanonicalStrokeComposition(composition,B,canonicalStrokeCompositionExtensions(law))).toBe(true)
  for(const profile of [G,A])expect(isCanonicalStrokeComposition(composition,profile,canonicalStrokeCompositionExtensions(law))).toBe(false)
  const recipe={kind:'image' as const,asset,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:1,height:1,mirrorH:false,mirrorV:false}
  const draws=[{recipe,role:'primary' as const,x:0,y:0,opacity:.7,flow:.8},...masked?[{recipe,role:'mask' as const,x:0,y:0,opacity:.4,flow:.5}]:[]]
  const built=buildCanonicalMaterial({masked,entry:{phase:'between'},draws,fences:[{kind:'segmentBegin',group:0,at:0},{kind:'primaryEnd',group:0,at:1},{kind:'segmentEnd',group:0,at:draws.length},{kind:'gestureEnd',at:draws.length}]},material)
  const trusted={materialVersion:2 as const,rasterProfile:B,material,brush:'brush:authored@1',strokeId:'test',frameOrdinal:0,pigmentRgb8:[1,2,3] as const,composition}
  const envelope={version:2,rasterProfile:B,brush:trusted.brush,strokeId:'test',frameOrdinal:0,pigmentRgb8:[1,2,3],composition,materialPacked:built.packed}
  expect(decodeCanonicalStrokeFrame(envelope,trusted).frame.masked).toBe(masked)
  expect(()=>decodeCanonicalStrokeFrame(envelope,{...trusted,rasterProfile:G})).toThrow()
  expect(()=>decodeCanonicalStrokeFrame(envelope,{...trusted,material:{...material,outerCompositionLaw:mode==='wash'?'pixel-direct-composite-browser-v1':'generic-separable-u8-v1'}})).toThrow()
 }
})
