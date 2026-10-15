import {installMiniPuddle as installBase} from './controller-v25'
import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {RibbonStrokeScratch} from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import {watercolorPresetString,withWatercolorModel} from '../../../../apps/web/src/engine/src/presets/watercolorPresets'
/** Compile cold generator bodies using empty input, without painting or journal events. */
export function installMiniPuddle(engine:any,size:number,mode:'morph'|'material',onStatus=(_message:string)=>{}){const name=withWatercolorModel(watercolorPresetString('normal',{water:1,pigment:.69},'PB15'),engine._watercolorModel),preset=engine._resolvePreset('watercolor',name),profile=ribbonProfileFor('watercolor',name),scratch=new RibbonStrokeScratch(engine._ribbonScratchPool,true,true),empty=new AccumulationBuffer(engine.gl,8,8);try{engine._paintRibbonDabs(empty,[],'watercolor',name,[.2,.5,.8]);const work=engine._ribbonPainter.paint(null,[],preset,name,profile,[.2,.5,.8],scratch,undefined);work.next();work.return()}finally{scratch.destroy();empty.destroy()}return installBase(engine,size,mode,onStatus)}
