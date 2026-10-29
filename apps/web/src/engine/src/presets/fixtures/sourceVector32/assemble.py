"""Unchanged pinned bodies, authored typed IO/ARM semantic shims. No SDK."""
from pathlib import Path
import argparse,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=Path(__file__).parent;b=a.repo/'temp/device-runs/krita-stroke-20261024'
paths={'math':b/'fixes-v48/optimized-over-sources/KoStreamedMath.h','over':b/'fixes-v48/optimized-over-sources/KoOptimizedCompositeOpOver32.h','alpha':b/'v21-sources/KoOptimizedCompositeOpAlphaDarken32.h','wrappers':b/'v20-sources/KoAlphaDarkenParamsWrapper.h','arithmetic':b/'fixes-v46/spray-color/source/KoColorSpaceMaths.h','params':b/'fixes-v52/param-info-sources/KoCompositeOp.cpp','qt':b/'fixes-v46/material-sources/qt5.15.7-qglobal.h'}
s={k:v.read_text()for k,v in paths.items()}
def fun(t,m):
 start=t.index(m);i=t.index('{',start)+1;d=1
 while d:d+=(t[i]=='{')-(t[i]=='}');i+=1
 return t[start:i]
lock={k:{'sha256':hashlib.sha256(v.read_bytes()).hexdigest(),'bytes':v.stat().st_size}for k,v in paths.items()};lp=r/'source-lock.json'
if lp.exists():assert json.loads(lp.read_text())==lock,'Pinned source changed'
else:lp.write_text(json.dumps(lock,indent=2)+'\n')
body=(r/'shim.cpp').read_text()
arm=(r.parent/'sourceOverPortable/neon-semantic-shim.h').read_text();body=body.replace('// ARM_SHIM',arm)
qt='template<class T>\n'+fun(s['qt'],'Q_DECL_CONSTEXPR inline T qAbs(')+'\ntemplate<class T>\n'+fun(s['qt'],'constexpr inline const T &qMin(')+'\n'+fun(s['qt'],'Q_REQUIRED_RESULT Q_DECL_CONSTEXPR static inline Q_DECL_UNUSED bool qFuzzyCompare(float')
body=body.replace('// QT_PARAMS','#define Q_DECL_CONSTEXPR constexpr\n#define Q_REQUIRED_RESULT\n#define Q_DECL_UNUSED\n'+qt+'\n'+fun(s['params'],'void KoCompositeOp::ParameterInfo::setOpacityAndAverage('))
start=s['math'].index('template<typename _impl, typename result_type>');end=s['math'].index('#if !defined(XSIMD_NO_SUPPORTED_ARCHITECTURE)',start)
body=body.replace('// ROUND',s['math'][start:end])
body=body.replace('// DIV','template<class _impl>struct OptiDiv{using float_v=V;'+fun(s['math'],'ALWAYS_INLINE static float divScalar(')+fun(s['math'],'ALWAYS_INLINE static float_v divVector(')+'};')
body=body.replace('// ARITHMETIC','template<class T>struct KoColorSpaceMaths{static T blend(T,T,T);};template<>\n'+fun(s['arithmetic'],'inline float KoColorSpaceMaths<float>::blend(')+'\nnamespace Arithmetic{template<class T>T unionShapeOpacity(T,T);template<class T>\n'+fun(s['arithmetic'],'inline T lerp(T a, T b, T alpha)')+'}\n')
body=body.replace('// STREAM','template<class _impl>struct KoStreamedMath:StreamIO{using float_v=V;using uint_v=U;'+fun(s['math'],'static inline quint8 round_float_to_u8(')+fun(s['math'],'static inline quint8 lerp_mixed_u8_float(')+'template<bool useMask,bool useFlow,class Compositor,int pixelSize>\n'+fun(s['math'],'static void genericComposite(')+'};')
body=body.replace('// OVER','template<class channels_type,class pixel_type,bool alphaLocked,bool allChannelsFlag>struct Over{struct ParamsWrapper{const QBitArray&channelFlags;ParamsWrapper(const KoCompositeOp::ParameterInfo&p):channelFlags(p.channelFlags){}};template<bool haveMask,bool src_aligned,class _impl>\n'+fun(s['over'],'static ALWAYS_INLINE void compositeVector(')+'template<bool haveMask,class _impl>\n'+fun(s['over'],'static ALWAYS_INLINE void compositeOnePixelScalar(')+'};')
wrap='\n'.join(fun(s['wrappers'],'struct '+n)+';'for n in ['KoAlphaDarkenParamsWrapperHard','KoAlphaDarkenParamsWrapperCreamy'])
body=body.replace('// ALPHA',wrap+'template<class channels_type,class pixel_type,class P>struct Alpha{using ParamsWrapper=P;template<bool haveMask,bool src_aligned,class _impl>\n'+fun(s['alpha'],'static ALWAYS_INLINE void compositeVector(')+'template<bool haveMask,class _impl>\n'+fun(s['alpha'],'static ALWAYS_INLINE void compositeOnePixelScalar(')+'};')
notices='\n'.join(t[:t.index('*/')+2]for t in s.values());a.output.write_text(notices+'\n'+body)
