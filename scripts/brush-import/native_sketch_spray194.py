"""Native-only194 lowering, preserving actual KPP identity and mask primitives."""
from native_timing195 import clock_enabled
import copy,io,xml.etree.ElementTree as ET
from collections import ChainMap
from PIL import Image
from native_mask190 import png_preset,text_resource
from sketch_spray194 import COMPONENT194,NATIVE_MODES,validate194

def lower194(data,root,params,name,catalog,external,resource):
 from krita_import import enabled,xml,preset_preview
 from independent_mask190 import COMPONENT190
 from texture_combinations191 import COMPONENT191
 from brush_contract import compatibility,finalize_identity
 engine=root.get('paintopid')
 if engine not in('sketchbrush','spraybrush'):raise ValueError('194 requires genuine native Sketch/Spray origin')
 if any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Expanded194 stationary timers are a separate item')
 raw=params.get('CompositeOp','normal');composite=NATIVE_MODES.get(raw)
 if composite is None:raise ValueError('Unknown native194 composite: '+raw)
 erase=composite=='erase'or any(clock_enabled(params, k)for k in('EraserMode','Krita/erase'))
 if erase:composite='normal'
 action=params.get('PaintOpAction','1')
 if action not in('1','2'):raise ValueError('Unknown native194 PaintingMode')
 values={**params,'CompositeOp':'normal','EraserMode':'false','Krita/erase':'false','PaintOpAction':'1','FlowValue':'1','PressureFlow':'false','SoftnessValue':'1','PressureSoftness':'false','PressureSharpness':'false','Texture/Pattern/Enabled':'false','MaskingBrush/Enabled':'false','PressureScatter':'false','PressureRatio':'false','PressureMirror':'false'}
 kept={'Size','Opacity','Rotation'}|({'Line width','Offset scale','Density'}if engine=='sketchbrush'else set())
 ignored=[]
 unused={'Flow','Softness','Sharpness','Scatter','Ratio','Mirror','Texture/Strength/','LightnessStrength','PaintThickness','Gradient','Hue','Saturation','Value','h','s','v','SmudgeRate','ColorRate','SmudgeRadius'}|({'Line width','Offset scale','Density'}if engine=='spraybrush'else set())
 for k,v in params.items():
  if k.startswith('Pressure')and k[8:]in unused:
   if enabled(v):ignored.append(k)
   values[k]='false'
 for k in('Texture/Pattern/Enabled','MaskingBrush/Enabled'):
  if clock_enabled(params, k):ignored.append(k)
 node=copy.deepcopy(root);resources=ChainMap({},external);definition=xml(values.get('brush_definition')or'<Brush/>');text_warning=None
 if definition.get('type')=='kis_text_brush':
  definition,text_warning=text_resource(definition,resources);values['brush_definition']=ET.tostring(definition,encoding='unicode')
 for p in list(node):
  if p.tag=='param':node.remove(p)
 for k,v in values.items():
  original=next((p for p in root.findall('param') if p.get('name')==k),None)
  attrs=dict(original.attrib) if original is not None else {'name':k}
  ET.SubElement(node,'param',attrs).text=v
 private=png_preset(node)
 def resolve(key):
  if key in resources:return resources[key]
  return resource(key)
 tokens=[(COMPONENT194,COMPONENT194.set(True)),(COMPONENT190,COMPONENT190.set(True)),(COMPONENT191,COMPONENT191.set(True))]
 try:
  if engine=='sketchbrush':
   from krita_sketch import sketch_preset
   result=sketch_preset(private,node,values,name,catalog,resources,resolve)
  else:
   from krita_spray import spray_preset
   result=spray_preset(private,node,values,name,catalog,resources,resolve)
 finally:
  for variable,token in reversed(tokens):variable.reset(token)
 d=result['descriptor'];d['version']=194;b=d['behavior'];family=d['sketch'if engine=='sketchbrush'else'spray'];family['composite']=composite
 if erase:b['erase']=True
 b['rendering'].update(mode='buildUp',blendMode='normal',accumulation='alphaDarken'if action=='2'else'directOver',wetEdges=0,burntEdges=0)
 b.setdefault('strokeInput',{'version':1,'initialDirection':'cursorHistory'})
 for k in('mirror','scatter','softness','grain','wetMix','dual','taper','edgeBleed'):b.pop(k,None)
 for table in('dynamics','modulations'):
  if table in b:
   for target in('flow','softness','sharpness','roundness','grainDepth','lightnessStrength','scatter'):b[table].pop(target,None)
   if not b[table]:b.pop(table)
 d.update(flow=1,flowPer='stamp',flowByPressure=[[0,1],[1,1]],paperInteraction=0)
 for key in('texture','wet','scatter'):d.pop(key,None)
 if engine=='sketchbrush':
  if family['mode']=='mask':family['maskSignal']='native-dab-v1'
  else:family.pop('maskSignal',None);family.pop('maskSize',None)
 else:
  # Only a genuinely consumed mask colour source needs the BEGIN snapshot.
  if family['particle'].get('image'):d['tip'].pop('sourceGeometry',None)
  if family['color'].get('sampleInput'):family['color']['sourcePolicy']='canonical-begin-v1'
 validate194(d)
 bad=[n['feature']for n in result['compatibility']if n['status']=='unsupported']
 if bad:raise ValueError('Unlowered active native194 options: '+', '.join(bad))
 if ignored:result['compatibility'].append(compatibility('ignoredNative194','Native consumer does not instantiate these copied Pixel options: '+', '.join(sorted(set(ignored))), 'supported'))
 result['compatibility']=[n for n in result['compatibility']if n['feature']not in('sketchMask','sketch','spraySourceTiming','sprayCurveAA')]
 result['compatibility'].append(compatibility('sketchSpray194','Whole native masks, per-request source inputs, selected composite and PaintingMode retained. Original mask/particle geometry and native selector call boundary remain independent; Qt/ICC/U8/native RNG/line pixel identity is not claimed.'))
 if text_warning:result['compatibility'].append(compatibility('nativeText194',text_warning))
 image=Image.open(io.BytesIO(data));image.load();result.update(name=root.get('name')or name,preview=preset_preview(image));result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported'];finalize_identity(d,data);return result
