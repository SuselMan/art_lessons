"""Mask-derived persistent Bristle hairs; native option names are preserved.

Ink depletion / canvas soaking are explicitly rejected until their complete
state/source contract is available. No per-frame or per-tile random selection.
"""
import io,math,hashlib
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def bristle_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled,numeric
    if enabled(params.get('HairyInk/enabled')):raise ValueError('Bristle ink depletion/soaking is not implemented')
    if enabled(params.get('PaintOpSettings/isAirbrushing')):raise ValueError('Bristle timed input is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Bristle supports normal compositing only')
    if numeric(params.get('FlowValue'),1)!=1:raise ValueError('Bristle nonunit flow is unsupported')
    aa=enabled(params.get('HairyBristle/antialias'));compositing=enabled(params.get('HairyBristle/useCompositing'))
    if not aa and not compositing:raise ValueError('Bristle aliased maximum-alpha rasterization is not implemented')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in transformed.findall('param'):
        if node.get('name')=='PaintOpAction':node.text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external);d=result['descriptor'];tip=d['tip']
    if tip['kind']!='bitmap':raise ValueError('Bristle requires an authored bitmap tip')
    asset=catalog.assets[tip['mask']];mask=Image.frombytes('L',(asset['size'],asset['size']),(catalog.output/asset['file']).read_bytes())
    bounds=tip['maskBounds'];side=max(1,round(result['sourceDefaults']['sizePx']))
    if side>256:raise ValueError('Bristle initialization mask exceeds256px')
    x,y,w,h=(bounds[k] for k in ('x','y','width','height'))
    # maskBounds are normalized square coordinates in the CAS plane.
    mask=mask.crop((round(x*mask.width),round(y*mask.height),round((x+w)*mask.width),round((y+h)*mask.height))).resize((side,side),Image.Resampling.LANCZOS)
    density=numeric(params.get('HairyBristle/density'),100)/100
    if not math.isfinite(density) or not 0<=density<=1:raise ValueError('Bristle density outside0..100')
    hairs=[]
    for yy in range(side):
        for xx in range(side):
            alpha=mask.getpixel((xx,yy))/255
            random=int.from_bytes(hashlib.sha256(f'{xx},{yy}'.encode()).digest()[:4],'big')/2**32
            if alpha>0 and random<=density:hairs.append([(xx-side//2)/side,(yy-side//2)/side,alpha])
    if not 0<len(hairs)<=4096:raise ValueError('Bristle population outside1..4096; reduce source mask/density')
    def number(key,default,lo,hi):
        v=numeric(params.get('HairyBristle/'+key),default)
        if not math.isfinite(v) or not lo<=v<=hi:raise ValueError('Bristle setting outside bounded range: '+key)
        return v
    d['version']=45;d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    for key in ('scatter','texture','wet'):d.pop(key,None)
    for key in ('scatter','spacing'):d['behavior'].pop(key,None)
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    d['bristle']={'version':1,'hairs':hairs,'scale':number('scale',2,0,10),'shear':number('shear',0,-10,10),'random':number('random',2,0,100),'mousePressure':enabled(params.get('HairyBristle/useMousePressure')),'threshold':enabled(params.get('HairyBristle/threshold')),'connected':enabled(params.get('HairyBristle/isConnected')),'antialias':aa,'compositing':compositing}
    ignored={'gihSelection','gihFrameCount','kritaEngine','autoSpacing'}
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ignored]
    result['compatibility'].append(compatibility('bristle','Mask-derived fixed hairs, pressure contact, shear, jitter, mouse pressure and connected paths retained. Initialization uses the first pipe frame and deterministic Grafetto population; GPU capsule coverage/additive AA differs from native per-pixel DDA/Wu. Ink depletion/soaking and aliased maximum-alpha input are rejected.'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
