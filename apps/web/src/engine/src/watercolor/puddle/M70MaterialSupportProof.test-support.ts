/** External proof aid only: support propagation of P/C donors, not coefficients. */
export class MaterialSupportGraph<Key>{
 private extents=new Map<Key,number>()
 private maximum=0
 private readonly linear:(key:Key)=>boolean
 constructor(linear:(key:Key)=>boolean){this.linear=linear}
 radius(key:Key):number{return this.extents.get(key)??0}
 clear(key:Key):void{this.extents.set(key,-Infinity)}
 auxiliary(key:Key):number{this.extents.set(key,-Infinity);return -Infinity}
 write(target:Key,reads:readonly {source:Key;radius:number}[],preserveOutside=false):number{
  let extent=preserveOutside?this.radius(target):-Infinity
  for(const {source,radius}of reads){if(!Number.isFinite(radius)||radius<0)throw Error('Unproved radius');extent=Math.max(extent,this.radius(source)+radius+(this.linear(source)?1:0))}
  this.extents.set(target,extent);this.maximum=Math.max(this.maximum,extent);return extent
 }
 get maxRadius():number{return this.maximum}
}
export function materialDonors<Key>(mode:number,a:Key,b:Key,opts:{c?:Key;dir?:readonly number[]}={}):Array<{source:Key;radius:number}>|null{
 const add=(source:Key,radius=0)=>({source,radius}),dir=Math.max(...(opts.dir??[0,0]).map(Math.abs))
 switch(mode){
 case 0:case 1:case 13:case 18:return [add(a),add(b)]
 case 2:case 7:case 9:case 17:return [add(a)]
 case 3:return [add(a),add(b),...(opts.c===undefined?[]:[add(opts.c)])]
 case 5:case 15:case 16:return [add(a,dir)]
 case 8:case 14:return [add(a),add(b)]
 case 4:case 6:case 10:case 11:case 12:case 19:case 20:return null // auxiliary output, not P/C
 default:throw Error('Unknown material operator '+mode)
 }
}

/** External planning proof aid only. Never infer this certificate from a bbox. */
export interface DryExteriorCertificate {
 scale:1;radius:40;water:1;standing:1;budget:96;costMax:100
 outwardDraws:25;dryCost:48;floor:.85
 pointGrid:true;foreignStencilAbsent:true;unchangedScheduleAndShaders:true
 /** Driver admission proofs; source SHA alone does not prove these. */
 unreachedCostFixedPoint:true;maxWriteErrorCodes:4;maxPackedUnderestimatePerUnit:1
}
export function certifiedMaterialRadius(certificate:DryExteriorCertificate|undefined):32|612 {
 if(!certificate)return 612
 const c=certificate
 if(c.scale!==1||c.radius!==40||c.water!==1||c.standing!==1||c.budget!==96||c.costMax!==100||c.outwardDraws!==25||c.dryCost!==48||c.floor!==.85||c.pointGrid!==true||c.foreignStencilAbsent!==true||c.unchangedScheduleAndShaders!==true||c.unreachedCostFixedPoint!==true||c.maxWriteErrorCodes!==4||c.maxPackedUnderestimatePerUnit!==1)return 612
 const dryUnit=c.floor*c.dryCost-c.maxPackedUnderestimatePerUnit
 const numericReach=Math.ceil((c.budget+1+c.outwardDraws*c.maxWriteErrorCodes*c.costMax/255)/dryUnit)
 return Number.isFinite(numericReach)&&numericReach+8<=32?32:612
}
