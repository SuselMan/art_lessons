"""Clone uses the ordinary mask and records its source in each gesture."""
import io
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility

def clone_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled
    healing=enabled(params.get('Duplicateop/Healing'))
    for key in ('Duplicateop/CorrectPerspective',):
        if enabled(params.get(key)):raise ValueError('Unsupported Clone mode: '+key)
    if enabled(params.get('EraserMode'))or params.get('CompositeOp','normal')!='normal':raise ValueError('Clone requires normal OVER')
    if any(enabled(params.get(k))for k in ('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Clone timers unsupported')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in list(transformed):
        if node.get('name')in('CompositeOp','PaintOpAction','paintop'):transformed.remove(node)
    ET.SubElement(transformed,'param',name='CompositeOp').text='normal';ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False);d=result['descriptor'];d.update(version=54,model='stamp',category='paint',paperInteraction=0)
    if healing and any(k in d for k in('mixer','scatter','texture','wet')):raise ValueError('Healing152 does not discard active source modifiers')
    for key in ('mixer','scatter','texture','wet'):d.pop(key,None)
    d['clone']={'version':1,'moveSourcePoint':enabled(params.get('Duplicateop/MoveSourcePoint','true'))}
    projection=enabled(params.get('Duplicateop/CloneFromProjection'))
    if projection:
        d['version']=149;d['clone'].update(source='projectionCanvas',sourcePolicy='canonical-begin-v1')
        if behavior:=d.get('behavior'):
            if behavior.get('erase')is True or any(k in d['tip']for k in('color','material','imageSampling','animation','autoNoise')):raise ValueError('Merged Clone149 requires ordinary static mask')
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    if d['behavior'].get('taper'):raise ValueError('Clone tail taper unsupported')
    if healing:
        from clone_healing152 import clone_healing152_scope
        d['version']=152;d['clone'].update(sourcePolicy='canonical-begin-v1',healing='lab-ratio-v1')
        if not clone_healing152_scope(d):raise ValueError('Healing152 requires ordinary static root mask')
    note=compatibility('clone','Ordinary mask and sensors; source is a captured world position/offset per gesture. Reads frozen pre-stroke layer, NORMAL OVER per dab. No merged projection, healing, perspective or timer; source subpixel rounding and colour-space quantization may differ.')
    if projection:note=compatibility('cloneProjection','Ordinary Clone mask/offset with immutable merged RGBA from verified canonical stroke-BEGIN layers, captured order/opacity and existing source nonce. NORMAL OVER and transparent source semantics unchanged; ICC/subpixel/native concurrent projection identity are qualified.')
    if healing:note=compatibility('cloneHealing152','Immutable local or merged canonical-BEGIN source and destination-guide; one whole integer request Lab16-ratio fixed-edge100 solve, then ordinary mask/opacity OVER. Domain3..512 and highp/working-set admission explicit. Functional analytic sRGB/Lab, not ICC or native early-stop byte identity.')
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']+[note];result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported'];result['descriptor']=finalize_identity(d,data)
    return result
