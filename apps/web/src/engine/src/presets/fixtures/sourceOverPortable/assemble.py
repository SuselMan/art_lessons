from pathlib import Path
import argparse
a=argparse.ArgumentParser();a.add_argument('--source-dir',type=Path,required=True);a.add_argument('--output',type=Path,required=True);args=a.parse_args()
r=Path(__file__).parent;s=args.source_dir
def function(text,marker):
 a=text.index(marker);i=text.index('{',a)+1;depth=1
 while depth:
  if text[i]=='{':depth+=1
  if text[i]=='}':depth-=1
  i+=1
 return text[a:i]
math=(s/'KoStreamedMath.h').read_text();over=(s/'KoOptimizedCompositeOpOver32.h').read_text()
a=math.index('template<typename _impl, typename result_type>');b=math.index('#if !defined(XSIMD_NO_SUPPORTED_ARCHITECTURE)',a)
body=math[:math.index('#ifndef')]+over[:over.index('#ifndef')]+(r/'scalar-driver.cpp').read_text()
body=body.replace('// NATIVE_ROUND',math[a:b])
div='template<class _impl>struct OptiDiv{'+function(math,'ALWAYS_INLINE static float divScalar(')+'};\n'
stream='template<class _impl>struct KoStreamedMath{'+function(math,'static inline quint8 round_float_to_u8(')+'\n'+function(math,'static inline quint8 lerp_mixed_u8_float(')+'};\n'
mask='template<class channels_type,class pixel_type,bool alphaLocked,bool allChannelsFlag>struct NativeOver{struct ParamsWrapper{const QBitArray&channelFlags;};template<bool haveMask,class _impl>\n'+function(over,'static ALWAYS_INLINE void compositeOnePixelScalar(')+'};\n'
body=body.replace('// NATIVE_SCALAR',div+stream+mask)
args.output.write_text(body)
