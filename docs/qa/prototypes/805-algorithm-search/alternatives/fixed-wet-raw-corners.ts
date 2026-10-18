/** Three full-resolution terrain families already gate centerline raw water.
 * Add the missing orthogonal corner cells without changing coefficients. */
export function guardRawWetCorners(source:string){
 const anchor='gate*=share*.125;'
 if(source.includes('fwRawCorner')||source.split(anchor).length!==2||!source.includes('uniform sampler2D mobile,aux;')||!source.includes('uniform float share,stride,paperBias;'))throw Error('Raw wet corner source drift')
 return source.replace(anchor,`/*fixed-initial-raw-corner*/if(abs(d.x)>.5&&abs(d.y)>.5){for(int fwRawCorner=0;fwRawCorner<8;fwRawCorner++){if(float(fwRawCorner)>=stride)break;vec2 corner=uv+d*float(fwRawCorner)/n;float wx=floor(texture2D(aux,corner+vec2(d.x,0.)/n).r*255.+.5)/255.,wy=floor(texture2D(aux,corner+vec2(0.,d.y)/n).r*255.+.5)/255.;gate=min(gate,min(wet(wx),wet(wy)));}}`+anchor)
}
