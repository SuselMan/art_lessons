from pathlib import Path
import sys, json, hashlib, shutil
here = Path(__file__).parent
s, r = map(Path, sys.argv[1:])
r.mkdir(parents=True, exist_ok=True)
metadata = json.loads((here / 'scalar.native.json').read_text())['provenance']['sources']
required = [
    'KoColorSpaceMaths.h', 'KoColorSpaceMaths.cpp', 'KoIntegerMaths.h',
    'KoColorSpaceConstants.h', 'KoCompositeOpAlphaBase.h', 'KoCompositeOpBase.h',
    'KoCompositeOpOver.h', 'KoCompositeOpGeneric.h', 'KoCompositeOpGenericFunctorBase.h',
    'KoAlphaDarkenParamsWrapper.h', 'KoCompositeOpAlphaDarken.h',
    'KoColorConversions.cpp', 'kis_hsv_adjustment.cpp', 'kis_global.h',
    'KoColorSpaceTraits.h', 'KoCompositeOpFunctions.h',
]
for name in required:
    record = next(row for row in metadata if Path(row['path']).name == name)
    if hashlib.sha256((s / name).read_bytes()).hexdigest() != record['sha256']:
        raise ValueError(f'Unexpected pinned source: {name}')
for p in (here / 'shims').iterdir():
    shutil.copyfile(p, r / p.name)
for name in required[:11]:
    shutil.copyfile(s / name, r / name)
shutil.copyfile(here / 'oracle.cpp', r / 'oracle.cpp')
def function(text, marker):
 a=text.index(marker);b=text.index('{',a);depth=1;i=b+1
 while depth:
  if text[i]=='{':depth+=1
  if text[i]=='}':depth-=1
  i+=1
 return text[a:i]
def notice(t):return t[:t.index('#include')]
conv=(s/'KoColorConversions.cpp').read_text();hsv=(s/'kis_hsv_adjustment.cpp').read_text();glob=(s/'kis_global.h').read_text();traits=(s/'KoColorSpaceTraits.h').read_text();funcs=(s/'KoCompositeOpFunctions.h').read_text()
part=notice(conv)+notice(hsv)
part+='#define UNDEFINED_HUE -1\n'+function(conv,'void RGBToHSL(')+'\n'+function(conv,'void HSLToRGB(')+'\n'
part+='template<typename T>\n'+function(glob,'typename std::enable_if<std::is_floating_point<T>::value, T>::type\nnormalizeAngleDegrees(')+'\n'
part+='#define SCALE_TO_FLOAT(v) KoColorSpaceMaths<quint8,float>::scaleToA(v)\n#define SCALE_FROM_FLOAT(v) KoColorSpaceMaths<float,quint8>::scaleToA(v)\n'
part+='template<class T>void clamp(float*,float*,float*);\n#define FLOAT_CLAMP(v) *v=(*v<0.0)?0.0:((*v>1.0)?1.0:*v)\ntemplate<>\n'+function(hsv,'void clamp<quint8>(')+'\n'
part+='template<class T>T pow2(T value){return value*value;}\n'
part+=hsv[hsv.index('static inline void writeRGBSimple'):hsv.index('template<typename _channel_type_,typename traits>')]

for name in ['RGBToHSV','HSVToRGB','RGBToHCI','HCIToRGB','RGBToHCY','HCYToRGB','RGBToYUV','YUVToRGB']:
 part+=f'template<class...A>void {name}(A...){{assert(false&&"non-selected transform path excluded");}}\n'
part+='struct RGBTrait{struct Pixel{quint8 red,green,blue,alpha;};};struct ColorTransform{virtual void transform(const quint8*,quint8*,qint32)const=0;};\nstruct NativeHSL:ColorTransform{using _channel_type_=quint8;using RGBPixel=RGBTrait::Pixel;double m_adj_h=0,m_adj_s=0,m_adj_v=0,m_lumaRed=0,m_lumaGreen=0,m_lumaBlue=0;int m_type=1;bool m_colorize=false,m_compatibilityMode=true;\n'
part+=function(hsv,'void transform(const quint8 *srcU8, quint8 *dstU8, qint32 nPixels) const override')+'\n};\n'
part+='struct NativeAlpha{using channels_type=quint8;static constexpr int alpha_pos=3,pixelSize=4;static quint8*nativeArray(quint8*p){return p;}\n'+function(traits,'inline static void setOpacity(quint8 * pixels, qreal alpha, qint32 nPixels)')+'\n};\n'
part+='template<class T>\n'+function(funcs,'inline T cfAddition(')+'\n'
(r/'native-parts.h').write_text(part)
