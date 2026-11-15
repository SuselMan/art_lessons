"""Native-only whole Color Smudge lowering, original bytes own final identity."""
from native_timing195 import clock_enabled
import copy,io
import xml.etree.ElementTree as ET
from collections import ChainMap
from PIL import Image
from native_mask190 import png_preset,text_resource
from color_smudge193 import COMPONENT193,NATIVE_MODES,validate_smudge193

def lower_smudge193(data,name,catalog,external,impl,options):
    from krita_import import xml,enabled,numeric,preset_preview
    from independent_mask190 import COMPONENT190
    from texture_combinations191 import COMPONENT191
    from brush_contract import compatibility,finalize_identity
    image=Image.open(io.BytesIO(data));image.load();root=xml(image.info['preset']);params={p.get('name'):p.text or''for p in root.findall('param')}
    if root.get('paintopid')!='colorsmudge':raise ValueError('Smudge193 requires genuine native Color Smudge root')
    if any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing','MaskingBrush/Enabled')):raise ValueError('Smudge193 excludes new timer families and non-native dual')
    if numeric(params.get('SmudgeRateMode'),0)not in(0,1):raise ValueError('Unknown native Color Smudge strategy')
    raw_mode=params.get('CompositeOp','normal');composite=NATIVE_MODES.get(raw_mode)
    if composite is None:raise ValueError('Unknown native Color Smudge composite: '+raw_mode)
    if enabled(params.get('EraserMode'))or enabled(params.get('Krita/erase')):composite='erase'
    # Only the private bridge substitutes foreground composite with normal. It
    # is restored as FOREGROUND ONLY after the existing native strategy parser.
    values={**params,'CompositeOp':'normal','EraserMode':'false','Krita/erase':'false','FlowValue':'1','PressureFlow':'false','PressureSoftness':'false','PressureSharpness':'false','SoftnessValue':'1'}
    resources=ChainMap({},external);definition=xml(values.get('brush_definition',''));text_warning=None
    if definition.get('type')=='kis_text_brush':
        definition,text_warning=text_resource(definition,resources);values['brush_definition']=ET.tostring(definition,encoding='unicode')
    node=copy.deepcopy(root)
    for p in list(node):
        if p.tag=='param':node.remove(p)
    for key,value in values.items():ET.SubElement(node,'param',name=key).text=value
    tokens=[(COMPONENT193,COMPONENT193.set(True)),(COMPONENT190,COMPONENT190.set(True)),(COMPONENT191,COMPONENT191.set(True))]
    try:result=impl(png_preset(node),name,catalog,resources,0,**{**options,'timed_input':True,'_default_input_policy':None,'_allow_texture_material':True})
    finally:
        for variable,token in reversed(tokens):variable.reset(token)
    d=result['descriptor'];d['version']=193;m=d.get('mixer',{});b=d['behavior']
    if m.get('source')not in('previousCanvas','projectionCanvas'):raise ValueError('Smudge193 missing actual canvas strategy')
    m['colorRateComposite']=composite;b['rendering']['blendMode']='normal';b['rendering']['accumulation']='directOver'
    if composite=='erase':b['erase']=True
    b.setdefault('strokeInput',{'version':1,'initialDirection':'cursorHistory'})
    d['flow']=1;d['flowPer']='stamp';d['flowByPressure']=[[0,1],[1,1]]
    for field in('dynamics','modulations'):
        if field in b:
            for target in('flow','softness','sharpness'):b[field].pop(target,None)
            if not b[field]:b.pop(field)
    for ignored in('softness','falloff'):b.pop(ignored,None)
    validate_smudge193(d)
    bad=[n['feature']for n in result['compatibility']if n['status']=='unsupported']
    if bad:raise ValueError('Unlowered native Smudge193 settings: '+', '.join(bad))
    result['compatibility'].append(compatibility('colorSmudge193','Whole native Color Smudge keeps existing legacy/modern/unshaded-height feedback. Captured composite applies only to foreground Color Rate; final transfer is unchanged. Native Pixel Flow/Softness/Sharpness are ignored. Original tip geometry, per-request selectors and captured source inputs remain independent. Qt/ICC/U8/native RNG identity is not claimed.','supported'))
    if 'sourceGeometry'in d['tip']:
        result['compatibility'].append(compatibility('smudgeStaticGeometry193','Original static bitmap width/height and native square padding are retained as explicit geometry; no animation or descriptor proxy.','supported'))
        result['compatibility'].append(compatibility('smudgeStaticResampling193','Static raw coverage/pigment uses the common native-geometry sampler. Native Qt integer pyramid/filter/subpixel pixel identity is not claimed.'))
    if text_warning:result['compatibility'].append(compatibility('smudgeText193',text_warning))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result.update(preview=preset_preview(image),name=root.get('name')or name);finalize_identity(d,data);return result
