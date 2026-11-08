/** Revision142 ordinary no-ink AA. World-space truncation is intentional:
 * native int(-.2)==0 folds two trajectory points onto pixel origin0.
 * Seven unique major-axis indices bound that fold without per-point GL work.
 * This reference is a functional U8 alpha law, not native colourspace identity. */
export function bristleNativeAA142Alpha(start:readonly[number,number],end:readonly[number,number],pixel:readonly[number,number],alpha:number):number {
 const dx=end[0]-start[0],dy=end[1]-start[1],axis=Math.abs(dy)>Math.abs(dx)?1:0,delta=axis?dy:dx,direction=delta>0?1:-1,steps=Math.abs(Math.trunc(end[axis])-Math.trunc(start[axis])),base=Math.floor((pixel[axis]-start[axis])*direction),den=Math.abs(delta),step=den?[dx/den,dy/den]:[0,0]
 let result=0
 for(let j=-3;j<=3;j++){
  const k=base+j;if(k<0||k>steps)continue
  const x=start[0]+step[0]*k,y=start[1]+step[1]*k,ix=Math.trunc(x),iy=Math.trunc(y),fx=Math.abs(x-ix),fy=Math.abs(y-iy),ox=pixel[0]-ix,oy=pixel[1]-iy
  if((ox!==0&&ox!==1)||(oy!==0&&oy!==1))continue
  const a=Math.floor((ox?fx:1-fx)*(oy?fy:1-fy)*alpha+.5)
  result=Math.floor(a+result*(255-a)/255+.5)
 }
 return result
}
/** Three pixels include native negative truncation's forward splat, e.g.
 * -.9 deposits at integer pixel1 (centre1.5), 2.4 away from the point. */
export function bristleNativeAA142Bounds(line:{start:readonly[number,number];end:readonly[number,number]},pad=0){
 return {minX:Math.min(line.start[0],line.end[0])-3-pad,minY:Math.min(line.start[1],line.end[1])-3-pad,maxX:Math.max(line.start[0],line.end[0])+3+pad,maxY:Math.max(line.start[1],line.end[1])+3+pad}
}
export const BRISTLE_NATIVE_AA142_VERT=`attribute vec2 a_position;attribute vec2 a_local;attribute vec4 a_color;attribute vec2 a_extent;
uniform vec2 u_resolution;varying vec2 v_start;varying vec2 v_end;varying vec4 v_color;
void main(){v_start=a_local;v_end=a_extent;v_color=a_color;vec2 p=a_position/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
export const BRISTLE_NATIVE_AA142_FRAG=`precision highp float;
uniform vec2 u_resolution;uniform vec2 u_worldOrigin;varying vec2 v_start;varying vec2 v_end;varying vec4 v_color;
float nativeTrunc(float x){return x<0.?ceil(x):floor(x);}
void main(){
 vec2 start=v_start+u_worldOrigin,end=v_end+u_worldOrigin,d=end-start;
 vec2 pixel=vec2(floor(gl_FragCoord.x),floor(u_resolution.y-gl_FragCoord.y))+u_worldOrigin;
 bool yMajor=abs(d.y)>abs(d.x);float major=yMajor?d.y:d.x,s=yMajor?start.y:start.x,e=yMajor?end.y:end.x,p=yMajor?pixel.y:pixel.x;
 float direction=major>0.?1.:-1.,steps=abs(nativeTrunc(e)-nativeTrunc(s)),base=floor((p-s)*direction);
 vec2 stepVector=abs(major)>0.?d/abs(major):vec2(0.);float result=0.,sourceAlpha=floor(v_color.a*255.+.5);
 for(int j=0;j<7;j++){
  float k=base+float(j)-3.;if(k<0.||k>steps)continue;
  vec2 pos=start+stepVector*k,origin=vec2(nativeTrunc(pos.x),nativeTrunc(pos.y)),fraction=abs(pos-origin),offset=pixel-origin;
  if((offset.x!=0.&&offset.x!=1.)||(offset.y!=0.&&offset.y!=1.))continue;
  vec2 weight=mix(vec2(1.)-fraction,fraction,offset);float a=floor(weight.x*weight.y*sourceAlpha+.5);
  result=floor(a+result*(255.-a)/255.+.5);
 }
 if(result<=0.)discard;float a=result/255.;gl_FragColor=vec4(v_color.rgb*a,a);
}`
