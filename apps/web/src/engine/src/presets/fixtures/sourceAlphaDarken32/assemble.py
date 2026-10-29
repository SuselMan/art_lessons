"""Assemble unchanged pinned source functions; traits/IO only are authored shims."""
from pathlib import Path
import argparse,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
r=Path(__file__).parent;root=a.repo/'temp/device-runs/krita-stroke-20261024'
paths={'dark':root/'v21-sources/KoOptimizedCompositeOpAlphaDarken32.h','wrappers':root/'v20-sources/KoAlphaDarkenParamsWrapper.h','math':root/'fixes-v48/optimized-over-sources/KoStreamedMath.h','arithmetic':root/'fixes-v46/spray-color/source/KoColorSpaceMaths.h','painter':root/'fixes-v42/grid-sources/kis_painter.cc'}
upstream={'dark':'libs/pigment/compositeops/KoOptimizedCompositeOpAlphaDarken32.h','wrappers':'libs/pigment/compositeops/KoAlphaDarkenParamsWrapper.h','math':'libs/pigment/compositeops/KoStreamedMath.h','arithmetic':'libs/pigment/KoColorSpaceMaths.h','painter':'libs/image/kis_painter.cc'}
pin='bd6e8d061d2f0388c5b10278786cf0fe62e3135f'
lock=[{'path':upstream[k],'url':f'https://raw.githubusercontent.com/KDE/krita/{pin}/{upstream[k]}','sha256':hashlib.sha256(v.read_bytes()).hexdigest(),'bytes':v.stat().st_size}for k,v in paths.items()]
existing=r/'source-lock.json'
if existing.exists():
 old=json.loads(existing.read_text());assert old==lock,'Pinned input changed'
else:existing.write_text(json.dumps(lock,indent=2)+'\n')
s={k:v.read_text()for k,v in paths.items()}
def body(text,marker):
 start=text.index(marker);i=text.index('{',start)+1;depth=1
 while depth:
  depth+=(text[i]=='{')-(text[i]=='}');i+=1
 return text[start:i]
notices='\n'.join(t[:t.index('*/')+2]for t in s.values())
round_start=s['math'].index('template<typename _impl, typename result_type>');round_end=s['math'].index('#if !defined(XSIMD_NO_SUPPORTED_ARCHITECTURE)',round_start)
# Native bodies are not patched. Only enclosing class declarations and traits
# replace unavailable application/Qt/SIMD dependencies. No vector body is used.
source=notices+'\n'+(r/'scalar-driver.cpp').read_text()
wrap='\n'.join(body(s['wrappers'],'struct '+name)+';'for name in ['KoAlphaDarkenParamsWrapperHard','KoAlphaDarkenParamsWrapperCreamy'])
blend='template<class T>struct KoColorSpaceMaths{static T blend(T,T,T);};\ntemplate<>\n'+body(s['arithmetic'],'inline float KoColorSpaceMaths<float>::blend(')
lerp='namespace Arithmetic{template<class T> T unionShapeOpacity(T,T);template<class T>\n'+body(s['arithmetic'],'inline T lerp(T a, T b, T alpha)')+'}\n'
stream='template<class _impl>struct KoStreamedMath{'+body(s['math'],'static inline quint8 round_float_to_u8(')+'\n'+body(s['math'],'static inline quint8 lerp_mixed_u8_float(')+'};\n'
scalar='template<class channels_type,class pixel_type,class ParamsWrapper>struct NativeAlphaDarken{template<bool haveMask,class _impl>\n'+body(s['dark'],'static ALWAYS_INLINE void compositeOnePixelScalar(')+'};\n'
average='struct KisPainter{static qreal blendAverageOpacity(qreal opacity,qreal averageOpacity);};\n'+body(s['painter'],'qreal KisPainter::blendAverageOpacity(')+'\n'
source=source.replace('// NATIVE_BODIES',blend+lerp+wrap+s['math'][round_start:round_end]+stream+scalar+average)
a.output.write_text(source)
