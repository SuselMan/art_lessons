"""Compile pinned unchanged source/header byte laws, not original ARM code.
Run from repo root: python3 <this file> <registered-disposable-build-directory>.
No network/dependency install; exact input hashes checked before compilation.
"""
from pathlib import Path
import sys,json,hashlib,shutil,subprocess,struct
here=Path(__file__).parent;repo=here.parents[7];build=Path(sys.argv[1]);build.mkdir(parents=True,exist_ok=True)
r=repo/'temp/device-runs/krita-stroke-20261024';primary=r/'fixes-v52/outer-composite-source'
sha=lambda b:hashlib.sha256(b).hexdigest()
records=json.loads((primary/'manifest.json').read_text())['files']
legacy=json.loads((here.parent/'sourceColorRgba8/scalar.native.json').read_text())['provenance']['sources']
inputs=[]
for name,path in [('KoColorSpaceMaths.h',primary/'KoColorSpaceMaths.h'),('KoCompositeOpGeneric.h',primary/'KoCompositeOpGeneric.h'),('KoCompositeOpGenericFunctorBase.h',primary/'KoCompositeOpGenericFunctorBase.h'),('KoIntegerMaths.h',r/'fixes-v29/packed-u16-sources/KoIntegerMaths.h'),('KoCompositeOpBase.h',r/'fixes-v29/packed-u16-sources/KoCompositeOpBase.h'),('KoCompositeOpClampPolicy.h',r/'fixes-v46/spray-color/source/KoCompositeOpClampPolicy.h')]:
 b=path.read_bytes();record=next((v for v in records+legacy if Path(v['path']).name==name),None)
 if name=='KoCompositeOpClampPolicy.h' and sha(b)!='0692d4d9fd640909e5fe38d9934be678fcf014a047e9fcc07c3ca761390930fb':raise ValueError('Pinned clamp policy hash mismatch')
 if record and sha(b)!=record['sha256']:raise ValueError('Pinned hash mismatch '+name)
 inputs.append({'name':name,'sha256':sha(b),'source':str(path.relative_to(repo))});shutil.copyfile(path,build/name)
for p in (here.parent/'sourceColorRgba8/shims').iterdir():shutil.copyfile(p,build/p.name)
functions=(primary/'KoCompositeOpFunctions.h').read_text();assert sha(functions.encode())==next(v['sha256'] for v in records if Path(v['path']).name=='KoCompositeOpFunctions.h');inputs.append({'name':'KoCompositeOpFunctions.h','sha256':sha(functions.encode()),'source':str((primary/'KoCompositeOpFunctions.h').relative_to(repo))})
def extract(marker):
 a=functions.index(marker);b=functions.index('{',a);n=1;i=b+1
 while n:
  if functions[i]=='{':n+=1
  if functions[i]=='}':n-=1
  i+=1
 if functions[i:i+1]==';':i+=1
 return functions[a:i]
parts=functions[:functions.index('#ifndef')]+ '\n#include "KoCompositeOpClampPolicy.h"\n'
parts+='template<class T>\n'+extract('inline T cfMultiply(')+'\n'
parts+='template<class T>\n'+extract('inline T cfLightenOnly(')+'\n'
parts+='template<class T>\n'+extract('struct CFHardLight :')+'\n'
parts+='template<class T>\n'+extract('struct CFOverlay :')+'\n'
parts+='template<typename T, template<typename> typename ClampPolicy>\n'+extract('struct CFColorDodge :')+'\n'
(build/'native-functions.h').write_text(parts);shutil.copyfile(here/'oracle.cpp',build/'oracle.cpp')
cmd=['g++','-std=c++17','-O2','-fno-fast-math','-ffp-contract=off','-fno-operator-names','-I'+str(build),str(build/'oracle.cpp'),'-o',str(build/'oracle')]
subprocess.run(cmd,check=True)
raw=subprocess.check_output([str(build/'oracle'),'channels']);assert len(raw)==4*65536
rows=[];seed=0x91c47b23
for op in range(4):
 for i in range(64):
  def byte():
   global seed
   seed=(seed^(seed<<13))&0xffffffff;seed^=seed>>17;seed=(seed^(seed<<5))&0xffffffff;return seed&255
  src=[byte(),byte(),byte(),[0,1,91,127,254,255][i%6]];dst=[byte(),byte(),byte(),[0,1,127,254,255][i%5]]
  mask=[-1,0,1,127,255][i%5];opacity=[0,.5,248/255,1][i%4]
  if i>=48:
   # Adjacent F32 controls around half-byte thresholds plus qreal controls
   # which become a different byte if incorrectly quantized before float cast.
   n=[0,1,127,254][i%4];v=struct.unpack('<I',struct.pack('<f',(n+.5)/255))[0]+[-1,0,1][i%3];opacity=struct.unpack('<f',struct.pack('<I',v))[0]
  rows.append({'mode':['multiply','lighten','colorDodge','overlay'][op],'src':src,'dst':dst,'mask':mask,'opacity':opacity})
for mode in ['multiply','lighten','colorDodge','overlay']:
 rows.append({'mode':mode,'src':[17,129,254,255],'dst':[93,1,252,0],'mask':-1,'opacity':.5-1e-12})
request=''.join(' '.join(map(str,[['multiply','lighten','colorDodge','overlay'].index(v['mode']),*v['src'],*v['dst'],v['mask'],v['opacity']]))+'\n' for v in rows).encode()
out=subprocess.check_output([str(build/'oracle')],input=request);assert len(out)==len(rows)*4
for i,row in enumerate(rows):row['expected']=list(out[i*4:i*4+4])
proof={'scope':'Unchanged pinned GenericSC/Base/Maths/IntegerMaths and extracted native functor bodies, existing interface shims, additive RGBA8 all channels/unlocked. Native C++ source-law oracle, not original installed ARM/GUI.','commit':'bd6e8d061d2f0388c5b10278786cf0fe62e3135f','sources':inputs,'generatorSHA256':sha(Path(__file__).read_bytes()),'driverSHA256':sha((here/'oracle.cpp').read_bytes()),'extractedFunctionsSHA256':sha(parts.encode()),'compiler':subprocess.check_output(['g++','--version'],text=True).splitlines()[0],'flags':cmd[1:6],'channelCasesPerMode':65536,'channelInputOrder':'source0..255 outer, destination0..255 inner; two raw bytes per pair','channelInputSHA256':sha(bytes(v for s in range(256) for d in range(256) for v in (s,d))),'channelOutputSHA256':{mode:sha(raw[i*65536:(i+1)*65536]) for i,mode in enumerate(['multiply','lighten','colorDodge','overlay'])},'pixelInputSHA256':sha(request),'pixelOutputSHA256':sha(out),'cases':rows}
(here/'source-law.native.json').write_text(json.dumps(proof,separators=(',',':'))+'\n');print(json.dumps({'channelCases':len(raw),'pixelCases':len(rows),'fixtureBytes':(here/'source-law.native.json').stat().st_size}))
