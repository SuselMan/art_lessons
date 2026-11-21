"""Native Filter-only lowering, original KPP remains the identity authority."""
from native_timing195 import clock_enabled
import copy
import xml.etree.ElementTree as ET
from collections import ChainMap
from native_mask190 import png_preset,text_resource
from filter_mask192 import FILTER192,MODES,validate_filter192

def lower_filter192(data,root,params,name,catalog,external):
    from krita_import import _preset_impl,xml,enabled,numeric
    from krita_filter import _legacy_filter_preset
    from independent_mask190 import COMPONENT190
    from texture_combinations191 import COMPONENT191
    from brush_contract import finalize_identity,compatibility
    if root.get('paintopid')!='filter':raise ValueError('Filter192 requires genuine native Filter origin')
    if any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Expanded Filter192 timers are a separate unsupported scope')
    composite='erase'if enabled(params.get('EraserMode'))or params.get('CompositeOp')=='erase'else 'copy'if params.get('CompositeOp','copy')=='copy'else MODES.get(params.get('CompositeOp'))
    if composite is None:raise ValueError('Unsupported native Filter destination composite')
    # Reuse the exact existing kernel/config parser with a harmless local shape.
    kernel=copy.deepcopy(root)
    values={**params,'brush_definition':'<Brush type="auto_brush" spacing="0.1"><MaskGenerator diameter="16" ratio="1" hfade="1" vfade="1" spikes="2" type="circle" id="default"/></Brush>','Filter/smudgeMode':'false','EraserMode':'false','CompositeOp':'copy','Texture/Pattern/Enabled':'false','MaskingBrush/Enabled':'false'}
    for node in list(kernel):
        if node.tag=='param':kernel.remove(node)
    # Only filter configuration is needed; unrelated active keys cannot affect kernel parsing.
    for key,value in values.items():
        if key.startswith('Filter/')or key in('brush_definition','CompositeOp','EraserMode'):ET.SubElement(kernel,'param',name=key).text=value
    if params.get('Filter/id')=='noise':
        configs=root.findall('filterconfig')
        if len(configs)>1:raise ValueError('Duplicate Filter configuration')
        cfg=configs[0] if configs else xml(params['Filter/configuration']) if params.get('Filter/configuration') else None
        config={p.get('name'):p.text or '' for p in cfg.iter('param')} if cfg is not None else {}
        if cfg is not None and len(config)!=len(list(cfg.iter('param'))):raise ValueError('Duplicate Filter configuration parameter')
        if set(config)-{'level','opacity','grayscale','seedThreshold','seedRed','seedGreen','seedBlue'}:raise ValueError('Unknown Noise setting')
        def integer(key,default,limit):
            try:value=int(config.get(key,default))
            except (ValueError,TypeError):raise ValueError('Invalid Noise parameter')from None
            if not 0<=value<=limit:raise ValueError('Noise parameter outside native range')
            return value
        seeds=[integer(k,None,2147483647)for k in ('seedThreshold','seedRed','seedGreen','seedBlue')]
        gray=config.get('grayscale','false').lower()
        if gray not in ('true','false','1','0'):raise ValueError('Invalid Noise grayscale')
        f={'version':3,'kind':'noise','level':integer('level',50,100),'opacity':integer('opacity',100,100),'grayscale':gray in ('true','1'),'seeds':seeds}
    elif params.get('Filter/id')=='hsvadjustment':
        configs=root.findall('filterconfig')
        if len(configs)>1:raise ValueError('Duplicate Filter configuration')
        cfg=configs[0] if configs else xml(params['Filter/configuration']) if params.get('Filter/configuration') else None
        config={p.get('name'):p.text or '' for p in cfg.iter('param')} if cfg is not None else {}
        if cfg is not None and len(config)!=len(list(cfg.iter('param'))):raise ValueError('Duplicate Filter configuration parameter')
        if set(config)-{'h','s','v','type','colorize','compatibilityMode'}:raise ValueError('Unknown HSV adjustment setting')
        if config.get('type','1')!='0' or config.get('h','0')!='0' or config.get('v','0')!='0' or config.get('colorize','false').lower() not in ('false','0') or config.get('compatibilityMode','true').lower() not in ('false','0'):raise ValueError('Unsupported HSV adjustment mode')
        try:amount=int(config.get('s','0'))
        except (ValueError,TypeError):raise ValueError('Invalid HSV saturation')from None
        if not -100<=amount<=100:raise ValueError('HSV saturation outside native range')
        f={'version':3,'kind':'hsvSaturation','amount':amount/100}
    elif params.get('Filter/id')=='colorbalance':
        configs=root.findall('filterconfig')
        if len(configs)>1:raise ValueError('Duplicate Filter configuration')
        cfg=configs[0] if configs else xml(params['Filter/configuration']) if params.get('Filter/configuration') else None
        config={p.get('name'):p.text or '' for p in cfg.iter('param')} if cfg is not None else {}
        if cfg is not None and len(config)!=len(list(cfg.iter('param'))):raise ValueError('Duplicate Filter configuration parameter')
        keys=[axis+'_'+tone for tone in ('shadows','midtones','highlights') for axis in ('cyan_red','magenta_green','yellow_blue')]
        if set(config)-set(keys)-{'preserve_luminosity'}:raise ValueError('Unknown Color Balance setting')
        def channel(key):
            try:value=int(config.get(key,'0'))
            except (ValueError,TypeError):raise ValueError('Invalid Color Balance channel')from None
            if not -100<=value<=100:raise ValueError('Color Balance channel outside native range')
            return value/100
        raw_preserve=config.get('preserve_luminosity','true').lower()
        if raw_preserve not in ('true','false','1','0'):raise ValueError('Invalid Color Balance luminosity flag')
        f={'version':3,'kind':'colorBalance',**{tone:[channel(axis+'_'+tone)for axis in ('cyan_red','magenta_green','yellow_blue')]for tone in ('shadows','midtones','highlights')},'preserveLuminosity':raw_preserve in ('true','1')}
    else:
        f=_legacy_filter_preset(png_preset(kernel),kernel,values,name,catalog,external)['descriptor']['filter']
    if f['kind']=='unsharp':
        if f['threshold']!=int(f['threshold']):raise ValueError('Filter192 Unsharp threshold must be integral')
        f['threshold']=int(f['threshold']);f['spatialPolicy']='unsharp-lab-halo-v1'
    if f['kind']=='gaussian':f.update(spatialPolicy='gaussian-halo-v1',amount=.5,threshold=0,lightnessOnly=True)
    f.update(maskPolicy='native-dab-v1',sourcePolicy='canonical-begin-v1',smudgeMode=enabled(params.get('Filter/smudgeMode')),composite=composite)
    node=copy.deepcopy(root);node.set('paintopid','paintbrush');resources=ChainMap({},external);ignored=[]
    # FilterOp constructs only Size/Rotation/Mirror/Texture options. These copied
    # Pixel keys are not runtime options, even when saved in a native preset.
    kept={'Size','Rotation','Mirror','Texture/Strength/'}
    for key,value in params.items():
        if key.startswith('Pressure')and key[8:]not in kept and enabled(value):ignored.append(key)
    if enabled(params.get('MaskingBrush/Enabled')):ignored.append('MaskingBrush/Enabled')
    normal={**params,'CompositeOp':'normal','EraserMode':'false','PaintOpAction':'1','MaskingBrush/Enabled':'false','PressureOpacity':'false','PressureFlow':'false','FlowValue':'1','SoftnessValue':'1','PressureSoftness':'false','PressureSharpness':'false','SharpnessValue':'0','PressureScatter':'false','PressureRatio':'false'}
    for key in list(normal):
        if key.startswith('Pressure')and key[8:]not in kept:normal[key]='false'
        if key.startswith(('HSV','PressureHue','PressureSaturation','PressureValue')):normal.pop(key,None)
    if numeric(normal.get('Texture/Pattern/TexturingMode'),0)in(2,3):normal['Texture/Pattern/TexturingMode']='1'
    normal['Texture/Pattern/AutoInvertOnErase']='false'
    definition=xml(normal.get('brush_definition',''))
    warning=None
    if definition.get('type')=='kis_text_brush':
        definition,warning=text_resource(definition,resources);normal['brush_definition']=ET.tostring(definition,encoding='unicode')
    for child in list(node):
        if child.tag=='param':node.remove(child)
    for key,value in normal.items():
        original=next((p for p in root.findall('param') if p.get('name')==key),None)
        attributes=dict(original.attrib) if original is not None else {'name':key}
        ET.SubElement(node,'param',attributes).text=value
    tokens=[(FILTER192,FILTER192.set(True)),(COMPONENT190,COMPONENT190.set(True)),(COMPONENT191,COMPONENT191.set(True))]
    try:result=_preset_impl(png_preset(node),name,catalog,resources,0,stroke_input=False,timed_input=True,_allow_texture_material=True,_default_input_policy=None)
    finally:
        for variable,token in reversed(tokens):variable.reset(token)
    d=result['descriptor'];d.update(version=192,model='mixer',category='wet',paperInteraction=0,flow=1,flowPer='stamp',flowByPressure=[[0,1],[1,1]],opacityByPressure=[[0,1],[1,1]],filter=f,mixer={'load':0,'initialLoad':0,'pickup':1,'strength':1,'source':'previousCanvas'})
    b=d['behavior'];b['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    for key in('scatter','wet'):d.pop(key,None)
    for key in list(b):
        if key not in('version','rendering','spacing','rotation','strokeInput','speedInput','sequentialRandom','clockRead','dynamics','modulations','mirror'):b.pop(key)
    for section in('dynamics','modulations'):
        if section in b:
            b[section]={k:v for k,v in b[section].items()if k in('size','angle','grainDepth')}
            if not b[section]:b.pop(section)
    if 'texture'in d:d['texture'].pop('eraseId',None)
    validate_filter192(d)
    bad=[n['feature']for n in result['compatibility']if n['status']=='unsupported']
    if bad:raise ValueError('Unlowered native Filter192 settings: '+', '.join(bad))
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']
    result['compatibility'].append(compatibility('filterMask192','Native Filter five existing kernels use canonical BEGIN, true OVER/false COPY temporary updates, complete alpha8 dab and destination composite. IMAGE/PIPE_IMAGE bake default-sRGB linear709 then sRGB GrayA times alpha offline; native ICC/Qt/RNG and byte identity are qualified. Pixel-only saved options are ignored by native FilterOp: '+(', '.join(ignored)or'none')+'.'))
    if f['kind']=='noise':result['compatibility'].append(compatibility('noiseFilter','Native threshold, per-channel seeds and opacity retained with deterministic coordinate noise; Krita uses a different random generator, so its exact speckle pattern differs.'))
    if warning:result['compatibility'].append(compatibility('filterText192',warning))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    finalize_identity(d,data)
    from krita_import import preset_preview
    from PIL import Image
    import io
    image=Image.open(io.BytesIO(data));image.load();result.update(name=root.get('name')or name,preview=preset_preview(image))
    return result
