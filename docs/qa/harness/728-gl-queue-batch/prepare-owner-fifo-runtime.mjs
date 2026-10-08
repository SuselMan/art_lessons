import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
const root=process.cwd(),out=path.join(root,'temp/owner-fifo-runtime');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('apps/web/src/engine/src/dabs/canonicalStrokeChunk.ts','utf8');
const start=source.indexOf(' const combs=ribbonBristleCombs('),end=source.indexOf(' return {drawable,commands}',start);
if(start<0||end<0)throw Error('Canonical source command extraction anchors missing');
const extracted=source.slice(start,end).replace(/ if\(!input.waterOnly\)state.landedWet=landedWet\n$/, '')
if(createHash('sha256').update(extracted).digest('hex')!=='f65c2c254cb9d202c8b109e245607ccbd00e0821a2ea83b5881c629a318e163e')throw Error('Canonical command tail changed: review corpus before regenerating owner runtime')
if(extracted.includes('state.')||extracted.includes('prepareRibbonDelivery(')||extracted.includes('prepareCanonicalRibbonBands('))throw Error('Command-only extraction contains preparation/state mutation')
let body=extracted.replace(' const combs=ribbonBristleCombs(profile,scalars.bristleRadiusPx),tau=pigmentAbsorption(input.color),sourceDelivery=ribbonWaterDelivery(profile)',' const {combs,tau}=input,sourceDelivery=ribbonWaterDelivery(profile)');
const base=path.join(root,'apps/web/src/engine/src/dabs');const rel=p=>'./'+path.relative(out,p).split(path.sep).join('/');
const header=`import type {Dab} from '@grafetto/shared'\nimport type {PencilPreset} from '${rel(path.join(base,'../presets/pencilPresets'))}'\nimport type {RibbonProfile} from '${rel(path.join(base,'ribbonProfile'))}'\nimport type {CanonicalDrawCommand,CanonicalDrawPhase,CanonicalPreparedUniforms} from '${rel(path.join(base,'canonicalStrokeChunk'))}'\nimport type {prepareRibbonDelivery} from '${rel(path.join(base,'ribbonDelivery'))}'\nimport {ribbonDabTouchesTile} from '${rel(path.join(base,'dabWorldHalfExtents'))}'\nimport {ribbonWaterDelivery} from '${rel(path.join(base,'ribbonStrokeMath'))}'\n`;
const definition=`
/** Generated from original command-only tail; no delivery, geometry or GPU work is invoked. */
export interface PreparedSourceInput {
 drawable:Dab[];preset:PencilPreset;profile:RibbonProfile
 tile:{originX:number;originY:number;buffer:{width:number;height:number}}
 delivery:Pick<ReturnType<typeof prepareRibbonDelivery>,'deposits'|'waterByDab'|'acrossByDab'|'paperWetByDab'|'puddleByDab'|'pigmentPoolByDab'|'movingByDab'>
 bands:{bands:Float32Array;waterBands:Float32Array;solventBands:Float32Array}
 haloDabs:Dab[];haloDose:Map<Dab,number>;haloShed:Map<Dab,number>
 combs:number;tau:readonly[number,number,number];strokeSeed?:[number,number];film:boolean
 segmentMode:false|'combined'|'explicit';waterOnly:boolean;hasInk?:boolean;hasColor?:boolean
 options:{diagnosticSolventField:boolean;diagnosticSharedFluid:boolean;diagnosticPigmentRecord:boolean}
 wetOf:(dab:Dab)=>number
}
export function recordPreparedSource(input:PreparedSourceInput):CanonicalDrawCommand[]{
 const {drawable,preset,profile,tile,delivery,bands,haloDabs,haloDose,haloShed,film,segmentMode,options,wetOf}=input
 const commands:CanonicalDrawCommand[]=[]
`;
fs.writeFileSync(path.join(out,'PreparedSourceCommands.ts'),header+definition+body+' return structuredClone(commands)\n}\n');
// Only a source-sized generated clone; existing review source/defaults remain unchanged.
const originalPath=path.join(root,'apps/web/src/engine/src/dabs/RibbonStrokePainter.ts');let painter=fs.readFileSync(originalPath,'utf8');
painter=painter.replace(/from '([.][^']+)'/g,(_m,p)=>`from '${rel(path.resolve(path.dirname(originalPath),p))}'`);
painter=`import {recordPreparedSource} from './PreparedSourceCommands'\nimport type {CanonicalDrawCommand} from '${rel(path.join(base,'canonicalStrokeChunk'))}'\n`+painter;
painter=painter.replace('  readonly presentationDabs: readonly Dab[]','  readonly typedSource?: {readonly commands:readonly CanonicalDrawCommand[];readonly rect:readonly[number,number,number,number]|null;readonly composite:Readonly<Record<string,unknown>>;readonly foreignImport:{readonly enabled:boolean;readonly dabs:readonly Dab[];readonly wetProfile?:string}}\n  readonly presentationDabs: readonly Dab[]');
const anchor='        metadata: captured,\n        presentationDabs:';
if(!painter.includes(anchor))throw Error('Prepared material metadata anchor missing');
painter=painter.replace(anchor,`        metadata: captured,
        typedSource: (()=>{
          const page=this.ctx.pageSize();if(this.ctx.infinite()||page.w!==1024||page.h!==1024)throw Error('Owned source QA requires bounded1024 single tile')
          const tile={originX:0,originY:0,buffer:{width:1024,height:1024}}
          const x0=Math.max(0,Math.floor(compositeBounds.minX)),y0=Math.max(0,Math.floor(compositeBounds.minY)),x1=Math.min(1024,Math.ceil(compositeBounds.maxX)),y1=Math.min(1024,Math.ceil(compositeBounds.maxY))
          const rect=x1>x0&&y1>y0?[x0,1024-y1,x1-x0,y1-y0]as const:null
          return {foreignImport:structuredClone({enabled:!!importForeign,dabs,wetProfile}),commands:recordPreparedSource({drawable,preset,profile,tile,delivery:{deposits,waterByDab,acrossByDab,paperWetByDab,puddleByDab,pigmentPoolByDab,movingByDab},bands:{bands,waterBands,solventBands},haloDabs,haloDose:haloDoseByDab,haloShed:haloShedByDab,combs,tau,strokeSeed,film,segmentMode,waterOnly:mode.waterOnly,options:{diagnosticSolventField:this.diagnosticSolventField,diagnosticSharedFluid:this.diagnosticSharedFluid,diagnosticPigmentRecord:this.diagnosticPigmentRecord},wetOf}),rect,composite:structuredClone({bounds:compositeBounds,preset,profile,color,opacity:drawable[0].opacity,fieldSeed,spreadPx,fringeWater,migratePx,dabSpacing,strokeDir,bristleRadiusPx,previewSourceGeometry:{firstGap,tipDiameter:drawable.reduce((m,d)=>Math.max(m,d.size*preset.sizeMultiplier),0)}})}
        })(),
        presentationDabs:`);
fs.writeFileSync(path.join(out,'OwnerRibbonStrokePainter.ts'),painter);
const hashes=Object.fromEntries(['apps/web/src/engine/src/dabs/RibbonStrokePainter.ts','apps/web/src/engine/src/dabs/canonicalStrokeChunk.ts'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync(path.join(out,'source-passport.json'),JSON.stringify({source:hashes,generated:Object.fromEntries(['PreparedSourceCommands.ts','OwnerRibbonStrokePainter.ts'].map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(out,p))).digest('hex')]))},null,2));
