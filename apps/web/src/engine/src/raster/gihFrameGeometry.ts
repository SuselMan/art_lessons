/** Original GIH frame geometry. Native algorithm pin bd6e8d061d2f0388c5b10278786cf0fe62e3135f. */
export interface GihFrameSize { readonly width:number; readonly height:number }
export interface GihGeometryInput {
 readonly reference:GihFrameSize; readonly selected:GihFrameSize;
 readonly cursor:readonly[number,number]; readonly scale:number; readonly ratio:number;
 readonly rotation:number; readonly brushAngle:number;
 readonly horizontalMirror:boolean; readonly verticalMirror:boolean;
 /** Native option flip excludes canvas mirror increments. Never infer from final mirror XOR. */
 readonly coordinateSystemFlipped:boolean; readonly subpixel:boolean;
}
function finite(n:number):number {if(!Number.isFinite(n))throw new RangeError('finite GIH geometry required');return n;}
function size(s:GihFrameSize):void {for(const n of [s.width,s.height])if(!Number.isSafeInteger(n)||n<1||n>2048)throw new RangeError('invalid original GIH frame size');}
function qRound(n:number):number{return n<0?-Math.floor(-n+.5):Math.floor(n+.5);}
function fraction(n:number):number{return n-Math.floor(n);}
function span(s:GihFrameSize,sx:number,sy:number,a:number):readonly[number,number]{
 const c=Math.abs(Math.cos(a)),t=Math.abs(Math.sin(a));
 return [s.width*sx*c+s.height*sy*t,s.width*sx*t+s.height*sy*c];
}
function rasterSpan(n:number,offset:number):number {
 const rounded=qRound(n);const width=Math.abs(n-rounded)<1e-6?rounded:n;
 // QImagePyramid returns aligned right/bottom, including subpixel translation.
 return Math.max(1,Math.ceil(offset+width));
}
export function planGihFrameGeometry(i:GihGeometryInput) {
 size(i.reference);size(i.selected);
 for(const n of [...i.cursor,i.scale,i.ratio,i.rotation,i.brushAngle])finite(n);
 if(i.scale<=0||i.ratio<=0)throw new RangeError('positive GIH scale/ratio required');
 const rotation=(i.coordinateSystemFlipped?-i.rotation:i.rotation)+i.brushAngle;
 const reference=span(i.reference,i.scale,i.scale*i.ratio,rotation);
 const selected=span(i.selected,i.scale,i.scale*i.ratio,rotation);
 const hotspot=[Math.max(1,reference[0])/2,Math.max(1,reference[1])/2] as const;
 let x=Math.floor(i.cursor[0]-hotspot[0]),y=Math.floor(i.cursor[1]-hotspot[1]);
 let subX=i.subpixel?fraction(i.cursor[0]-hotspot[0]):0;
 let subY=i.subpixel?fraction(i.cursor[1]-hotspot[1]):0;
 if(i.horizontalMirror)subX=fraction(-(i.cursor[0]+hotspot[0]));
 if(i.verticalMirror)subY=fraction(-(i.cursor[1]+hotspot[1]));
 const width=rasterSpan(selected[0],subX),height=rasterSpan(selected[1],subY);
 if(i.horizontalMirror)x=qRound(i.cursor[0]+subX+hotspot[0])-width;
 if(i.verticalMirror)y=qRound(i.cursor[1]+subY+hotspot[1])-height;
 for(const n of [x,y,x+width,y+height])if(!Number.isSafeInteger(n))throw new RangeError('unsafe GIH world extent');
 // Native spacing uses reference characteristicSize(scale, ratio=1, rotation=0), plus static angle.
 const spacing=span(i.reference,i.scale,i.scale,i.brushAngle);
 return Object.freeze({x,y,width,height,subX,subY,rotation,
  hotspot:Object.freeze(hotspot),spacing:Object.freeze(spacing),
  referenceSpan:Object.freeze(reference),selectedSpan:Object.freeze(selected)});
}
/** Artwork extents, not alpha-tight bounds. No resize/crop or pixel inspection. */
export function gihFrameMaskBounds(s:GihFrameSize,side:number){
 size(s);if(!Number.isSafeInteger(side)||side<2||side>2048||(side&(side-1))!==0||side<Math.max(s.width,s.height))throw new RangeError('invalid frame asset side');
 const longest=Math.max(s.width,s.height);
 const x=(Math.floor((side-s.width)/2)+(s.width-longest)/2)/side;
 const y=(Math.floor((side-s.height)/2)+(s.height-longest)/2)/side;
 const extent=longest/side;
 if(x<0||y<0||x+extent>1||y+extent>1)throw new RangeError('frame requires additional padding');
 return Object.freeze({x,y,width:extent,height:extent});
}

export interface GihFrameMetadata {readonly sourceWidth:number;readonly sourceHeight:number;readonly maskBounds:Readonly<{x:number;y:number;width:number;height:number}>}
/** Preparation-only checked metadata, not a render capability or mutable caller alias. */
export function captureGihFrameMetadata(rows:readonly GihFrameMetadata[],assetSides:readonly number[]):readonly GihFrameMetadata[]{
 if(rows.length<2||rows.length>256||rows.length!==assetSides.length)throw new RangeError('invalid GIH geometry inventory');
 return Object.freeze(rows.map((r,index)=>{
  if(!r||Object.keys(r).sort().join(',')!=='maskBounds,sourceHeight,sourceWidth')throw new RangeError('invalid GIH geometry fields');
  const sourceWidth=r.sourceWidth,sourceHeight=r.sourceHeight;
  const b=r.maskBounds,expected=gihFrameMaskBounds({width:sourceWidth,height:sourceHeight},assetSides[index]);
  if(!b||Object.keys(b).sort().join(',')!=='height,width,x,y'||(['x','y','width','height'] as const).some(k=>!Object.is(b[k],expected[k])))throw new RangeError('GIH geometry differs from original padding');
  return Object.freeze({sourceWidth,sourceHeight,maskBounds:expected});
 }));
}

/** Pixel-center inverse of the selected image's normalized transform, followed by world-axis raster mirror. */
export function gihFrameSampleTransform(i:GihGeometryInput){
 const p=planGihFrameGeometry(i),a=-p.rotation,c=Math.cos(a),s=Math.sin(a),sx=i.scale,sy=i.scale*i.ratio;
 const w=i.selected.width,h=i.selected.height,L=Math.max(w,h);
 const xs=[0,w*sx*c,-h*sy*s,w*sx*c-h*sy*s],ys=[0,w*sx*s,h*sy*c,w*sx*s+h*sy*c];
 const minX=Math.min(...xs),minY=Math.min(...ys);
 // v_localUV is axis-aligned output rectangle [-1,1]. Mirrors act on raster edges, before inverse source transform.
 const mx=i.horizontalMirror?-1:1,my=i.verticalMirror?-1:1;
 const ox=p.width/2-p.subX+minX,oy=p.height/2-p.subY+minY;
 const x=Object.freeze([c*mx*p.width/(2*sx),s*my*p.height/(2*sx),(c*ox+s*oy)/sx,0]as const);
 const y=Object.freeze([-s*mx*p.width/(2*sy),c*my*p.height/(2*sy),(-s*ox+c*oy)/sy,0]as const);
 return Object.freeze({...p,frame:Object.freeze([1,w,h,L]as const),sampleX:x,sampleY:y});
}
export const GIH_FRAME_SAMPLING_GLSL=`
uniform vec4 u_gihFrame;
uniform vec4 u_gihSampleX;
uniform vec4 u_gihSampleY;
vec4 brushGihFrameSample(sampler2D tip,vec2 localUV) {
 vec3 point=vec3(localUV,1.0);
 vec2 original=vec2(dot(u_gihSampleX.xyz,point),dot(u_gihSampleY.xyz,point));
 vec2 squareUV=(original+(vec2(u_gihFrame.w)-u_gihFrame.yz)*0.5)/u_gihFrame.w;
 // Keep implicit mip derivatives defined across edge quads before clipping.
 vec4 sampled=brushTipSample(tip,u_tipBounds.xy+squareUV*u_tipBounds.zw,u_tipPacking);
 vec2 inside=step(vec2(0.0),original)*step(original,u_gihFrame.yz);
 return sampled*(inside.x*inside.y);
}
`;
