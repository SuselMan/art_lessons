"""Clone uses the ordinary mask and records its source in each gesture."""
import io
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility

def clone_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled
    for key in ('Duplicateop/Healing','Duplicateop/CorrectPerspective','Duplicateop/CloneFromProjection'):
        if enabled(params.get(key)):raise ValueError('Unsupported Clone mode: '+key)
    if enabled(params.get('EraserMode'))or params.get('CompositeOp','normal')!='normal':raise ValueError('Clone requires normal OVER')
    if any(enabled(params.get(k))for k in ('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Clone timers unsupported')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in list(transformed):
        if node.get('name')in('CompositeOp','PaintOpAction','paintop'):transformed.remove(node)
    ET.SubElement(transformed,'param',name='CompositeOp').text='normal';ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False);d=result['descriptor'];d.update(version=54,model='stamp',category='paint',paperInteraction=0)
    for key in ('mixer','scatter','texture','wet'):d.pop(key,None)
    d['clone']={'version':1,'moveSourcePoint':enabled(params.get('Duplicateop/MoveSourcePoint','true'))}
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    if d['behavior'].get('taper'):raise ValueError('Clone tail taper unsupported')
    note=compatibility('clone','Ordinary mask and sensors; source is a captured world position/offset per gesture. Reads frozen pre-stroke layer, NORMAL OVER per dab. No merged projection, healing, perspective or timer; source subpixel rounding and colour-space quantization may differ.')
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']+[note];result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported'];result['descriptor']=finalize_identity(d,data)
    return result
