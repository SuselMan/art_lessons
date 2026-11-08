"""Tangent Normal uses the ordinary mask/sensors with RGB vector encoding."""
import io,math
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility

def tangent_normal_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled
    def number(key,default,low,high,integer=False):
        value=float(params.get('Tangent/'+key,default))
        if not math.isfinite(value)or not low<=value<=high or integer and int(value)!=value:raise ValueError('Invalid Tangent '+key)
        return int(value)if integer else value
    direction=number('directionType',0,0,3,True)
    if direction==2:raise ValueError('Tangent Rotation requires recorded stylus twist; unsupported')
    channels=[number('swizzle'+key,default,0,5,True)for key,default in [('Red',0),('Green',2),('Blue',4)]]
    elevation=number('elevationSensitivity',100,0,100)/100
    mix=number('mixValue',50,0,100)/100
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in list(transformed):
        if node.get('name')in('paintop','PaintOpAction'):transformed.remove(node)
    ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False);d=result['descriptor']
    if d.get('mixer')or d.get('tip',{}).get('material')or d.get('tip',{}).get('color')or d['behavior'].get('dual'):raise ValueError('Tangent requires an alpha mask, without dual/mixer/material colour')
    if d['behavior'].get('colorAdjustment')or any(k in d['behavior'].get('dynamics',{})or k in d['behavior'].get('modulations',{})for k in ('hue','saturation','brightness')):raise ValueError('Tangent foreground colour dynamics unsupported')
    d.update(version=56,model='stamp',category='paint',paperInteraction=0)
    d.pop('wet',None)
    d['tangentNormal']={'version':1,'direction':{0:'tilt',1:'direction',3:'mix'}[direction],'channels':channels,'elevationSensitivity':elevation,'mix':mix}
    rendering=d['behavior'].setdefault('rendering',{})
    rendering.update(mode='buildUp',accumulation='directOver')
    note=compatibility('tangentNormal','RGB normal from stylus tilt, drawing direction or their angular mixture; elevation sensitivity, six swizzles, ordinary mask/size/opacity/scatter. Viewport rotation is captured per gesture. Stylus twist and canvas mirroring are not supported; no normal-vector renormalization of composited layers.')
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']+[note]
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
