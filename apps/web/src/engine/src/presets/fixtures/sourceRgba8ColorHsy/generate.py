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
mathcpp=r/'fixes-v46/spray-color/source/KoColorSpaceMaths.cpp';record=next(v for v in legacy if Path(v['path']).name=='KoColorSpaceMaths.cpp');assert sha(mathcpp.read_bytes())==record['sha256'];shutil.copyfile(mathcpp,build/mathcpp.name);inputs.append({'name':mathcpp.name,'sha256':record['sha256'],'source':str(mathcpp.relative_to(repo))})
def extract(marker):
 a=functions.index(marker);b=functions.index('{',a);n=1;i=b+1
 while n:
  if functions[i]=='{':n+=1
  if functions[i]=='}':n-=1
  i+=1
 if functions[i:i+1]==';':i+=1
 return functions[a:i]
parts=functions[:functions.index('#ifndef')]+ '\n#include "KoCompositeOpGenericFunctorBase.h"\n'
parts+='template<typename channels_type>\n'+extract('inline void possiblyFixNegativeValuesNearZeroPoint(')+'\n'
parts+='template<class HSXType,typename channels_type>\n'+extract('struct CFColor :')+'\n'
(build/'native-color.h').write_text(parts);shutil.copyfile(here/'oracle.cpp',build/'oracle.cpp')
cmd=['g++','-std=c++17','-O2','-fno-fast-math','-ffp-contract=off','-fno-operator-names','-I'+str(build),str(build/'oracle.cpp'),'-o',str(build/'oracle')]
subprocess.run(cmd,check=True)
rows=[];seed=0x3419cad1
colors=[[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255]]
for src in colors:
 for dst in colors:rows.append({'src':src+[255],'dst':dst+[255],'mask':-1,'opacity':1})
for i in range(192):
 def byte():
  global seed
  seed=(seed^(seed<<13))&0xffffffff;seed^=seed>>17;seed=(seed^(seed<<5))&0xffffffff;return seed&255
 rows.append({'src':[byte(),byte(),byte(),[0,1,127,254,255][i%5]],'dst':[byte(),byte(),byte(),[0,1,127,254,255][(i//5)%5]],'mask':[-1,0,1,127,255][i%5],'opacity':[0,.5,.5-1e-12,1][i%4]})
rows.extend([{'src':[255,0,0,0],'dst':[3,7,19,1],'mask':-1,'opacity':0},{'src':[3,7,19,1],'dst':[93,18,177,0],'mask':-1,'opacity':1}])
request=''.join(' '.join(map(str,[*v['src'],*v['dst'],v['mask'],v['opacity']]))+'\n' for v in rows).encode()
out=subprocess.check_output([str(build/'oracle')],input=request);assert len(out)==len(rows)*16
for i,row in enumerate(rows):row['expected']=list(out[i*16:i*16+4]);row['colorF32Bits']=list(struct.unpack('<III',out[i*16+4:i*16+16]))
proof={'scope':'Unchanged pinned GenericHSLFunctor/CFColor<HSYType,U8>/Maths with existing interface shims. Separate-F32 source C++ oracle (-ffp-contract=off), NOT original installed ARM/FMA/GUI.','commit':'bd6e8d061d2f0388c5b10278786cf0fe62e3135f','sources':inputs,'generatorSHA256':sha(Path(__file__).read_bytes()),'driverSHA256':sha((here/'oracle.cpp').read_bytes()),'extractedFunctionsSHA256':sha(parts.encode()),'compiler':subprocess.check_output(['g++','--version'],text=True).splitlines()[0],'flags':cmd[1:6],'inputSHA256':sha(request),'outputRGBAAndColorF32BitsSHA256':sha(out),'cases':rows}
(here/'source-law.native.json').write_text(json.dumps(proof,separators=(',',':'))+'\n');print(json.dumps({'pixelAndColorCases':len(rows),'fixtureBytes':(here/'source-law.native.json').stat().st_size}))
