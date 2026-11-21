"""Clone uses the ordinary mask and records its source in each gesture."""
from native_timing195 import clock_enabled
import io
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility

def clone_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled
    healing=enabled(params.get('Duplicateop/Healing'))
    ignored_perspective=enabled(params.get('Duplicateop/CorrectPerspective'))
    if enabled(params.get('EraserMode'))or params.get('CompositeOp','normal')!='normal':raise ValueError('Clone requires normal OVER')
    if any(clock_enabled(params, k)for k in ('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Clone timers unsupported')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in list(transformed):
        if node.get('name')in('CompositeOp','PaintOpAction','paintop'):transformed.remove(node)
    ET.SubElement(transformed,'param',name='CompositeOp').text='normal';ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta,icc_profile=im.info.get('icc_profile') if isinstance(im.info.get('icc_profile'),bytes) else None)
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
    if healing:note=compatibility('cloneHealing152','Immutable local or merged canonical-BEGIN source and destination-guide; one whole integer request Lab16-ratio fixed-edge100 solve, then ordinary mask/opacity OVER. Native tiny request expands both solve axes by2; original source starts at0,0 and output crops top-left original extent. Expanded solve<=512 plus highp/working-set admission explicit; no native uninitialized scratch carry is reproduced. Functional analytic sRGB/Lab, not ICC or native early-stop byte identity.')
    ignored=[]
    if ignored_perspective:ignored.append(compatibility('nativeIgnored.cloneCorrectPerspective','KDE/krita 41bef33e41ebf15d394096d275c49c7c52b25f9a kis_duplicateop.cpp144-179 comments out perspective correction; active180-188 always copies OLD source. Checked setting retained in original source identity; no homography or canvas perspective-grid support is claimed.','supported'))
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']+[note]+ignored;result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported'];result['descriptor']=finalize_identity(d,data)
    return result
