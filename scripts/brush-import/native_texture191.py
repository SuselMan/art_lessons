"""191 native promotion only after legacy parse fails or an actual new Height enum.
Raw original KPP and original resource keys remain source identity authority.
"""
import io,copy
from collections import ChainMap
from PIL import Image
from independent_mask190 import COMPONENT190
from texture_combinations191 import COMPONENT191,texture191_scope
from native_mask190 import lower_pair,png_preset,text_resource

def lower_texture191(data,name,catalog,external,impl,options):
 from krita_import import xml,enabled,compatibility
 from brush_contract import finalize_identity
 image=Image.open(io.BytesIO(data));image.load();root=xml(image.info.get('preset',''))
 if root.get('paintopid')not in('paintbrush','colorsmudge'):raise ValueError('Texture191 only existing native Pixel/ColorSmudge')
 params={n.get('name'):n.text or''for n in root.findall('param')}
 if not enabled(params.get('Texture/Pattern/Enabled')):raise ValueError('Texture191 needs active native pattern')
 token=COMPONENT191.set(True)
 try:
  if enabled(params.get('MaskingBrush/Enabled')):
   result=lower_pair(data,name,catalog,external,impl,options,revision=191,scope=texture191_scope)
  else:
   import xml.etree.ElementTree as ET
   resources=ChainMap({},external);definition=xml(params.get('brush_definition',''));warnings=[]
   if definition.get('type')=='kis_text_brush':
    definition,warning=text_resource(definition,resources);warnings.append(warning)
    next(n for n in root.findall('param')if n.get('name')=='brush_definition').text=ET.tostring(definition,encoding='unicode')
   inner=COMPONENT190.set(True)
   try:result=impl(png_preset(root),name,catalog,resources,0,**{**options,'_allow_texture_material':True,'timed_input':True})
   finally:COMPONENT190.reset(inner)
   result['warnings'].extend(warnings);result['descriptor']['version']=191
   if not texture191_scope(result['descriptor']):raise ValueError('Native191 whole texture scope rejected')
   finalize_identity(result['descriptor'],data)
 finally:COMPONENT191.reset(token)
 bad=[n['feature']for n in result['compatibility']if n['status']=='unsupported']
 if bad:raise ValueError('Unlowered native191 options: '+', '.join(bad))
 result['compatibility'].append(compatibility('texture191','Native pattern is applied after actual tip pigment/alpha and before primary accumulation/independent mask. Existing captured gradient shared by tip/material; paired erase gray+alpha and all16 native texture enums retained. Native U8/ICC/RNG identity not claimed.','supported'))
 return result
