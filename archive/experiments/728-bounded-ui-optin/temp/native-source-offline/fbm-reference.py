import base64,struct,math,json
f=lambda x:struct.unpack('f',struct.pack('f',x))[0];a=base64.b64decode(open('apps/web/src/engine/src/raster/watercolorNoise.txt').read());mix=lambda a,b,t:f(f(a*f(1-t))+f(b*t))
def noise(p):
 i=[math.floor(x) for x in p];v=[f(p[k]-i[k]) for k in range(2)];u=[f(f(x*x)*f(3-f(2*x))) for x in v];l=lambda x,y:f(a[((i[1]+y)%251)*251+(i[0]+x)%251]/255)
 return mix(mix(l(0,0),l(1,0),u[0]),mix(l(0,1),l(1,1),u[0]),u[1])
p=[-4.666445255279541,29.47861099243164];seq=[f(f(x*f(2.7))+f(c)) for x,c in zip(p,[31.4,17.9])];fused=[f(x*f(2.7)+f(c)) for x,c in zip(p,[31.4,17.9])];first=noise(p);nseq=noise(seq);nfused=noise(fused);combine=lambda x:f(f(f(.63)*first)+f(f(.37)*x));r={'scope':'CPU separateF32 scalar lattice reference; no compiler/FMA or native GPU claim','p':p,'seq':seq,'fused':fused,'firstNoise':first,'secondNoiseSequential':nseq,'secondNoiseFused':nfused,'fbmSequential':combine(nseq),'fbmFused':combine(nfused)};print(json.dumps(r));open('temp/native-source-offline/fbm-reference.json','w').write(json.dumps(r,indent=2))
