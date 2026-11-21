"""Bounded root Pixel lightness pipe with authored angular fan."""
import io
from PIL import Image
from independent_mask190 import component190,COMPONENT190

def scope202(d):
 if not component190(d,True,202):return False
 t=d['tip'];b=d['behavior'];a=t.get('animation');r=b.get('rendering');i=b.get('strokeInput')
 return (d.get('paperInteraction')==0 and not any(k in d for k in ('texture','wet')) and not any(k in b for k in ('dual','timing','sequentialRandom','wetMix','taper')) and b.get('erase')is not True
  and t.get('kind')=='bitmap' and isinstance(t.get('material'),dict)and t['material'].get('kind')=='lightness' and not any(k in t for k in ('color','imageSampling','profile','autoNoise','autoShape'))
  and isinstance(a,dict)and a.get('mode')=='dimensions'and 'geometry'not in a and isinstance(a.get('dimensions'),list)and any(isinstance(x,dict)and x.get('mode')=='angular'for x in a['dimensions'])
  and isinstance(r,dict)and r.get('blendMode')=='normal'and r.get('accumulation')=='alphaDarken'and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0
  and isinstance(i,dict)and i.get('version')==1 and i.get('initialDirection')=='cursorHistory'and isinstance(i.get('fanCorners'),dict))

def lower202(data,name,catalog,external,impl,options):
 from krita_import import xml,enabled,compatibility
 from brush_contract import finalize_identity
 image=Image.open(io.BytesIO(data));image.load();root=xml(image.info.get('preset',''));params={p.get('name'):p.text or ''for p in root.findall('param')}
 if root.get('paintopid')!='paintbrush' or enabled(params.get('MaskingBrush/Enabled')) or enabled(params.get('Texture/Pattern/Enabled')) or params.get('PaintOpAction')!='2':raise ValueError('Not native202 Pixel fan')
 del image,root,params
 token=COMPONENT190.set(True)
 try:result=impl(data,name,catalog,external,0,**{**options,'timed_input':True,'_allow_texture_material':True})
 finally:COMPONENT190.reset(token)
 d=result['descriptor'];d['version']=202
 if not scope202(d):raise ValueError('Invalid native202 Pixel fan scope')
 bad=[n['feature']for n in result['compatibility']if n['status']=='unsupported']
 if bad:raise ValueError('Unlowered native202 options: '+', '.join(bad))
 finalize_identity(d,data);result['warnings']=list(dict.fromkeys(result['warnings']))
 result['compatibility'].append(compatibility('pixelFan202','Angular pipe selection and authored corner fan retain captured source requests; native interpolation, first-point behaviour, ICC and random sequences may differ.'))
 return result
