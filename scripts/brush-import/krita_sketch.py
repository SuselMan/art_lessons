"""Independent adapter for Sketch's simple radius-neighbour connections.

Reference: pinned KDE sketch option data and paintop. Mask-selected non-simple
connections and active timed input are rejected rather than treated as a disc.
"""
import io
import math
import xml.etree.ElementTree as ET
from PIL import Image, PngImagePlugin
from brush_contract import finalize_identity,compatibility


def sketch_preset(data,root,params,name,catalog,external,resource):
    from krita_import import preset,enabled,numeric,size_like_controls,gbr,raster,xml
    simple=enabled(params.get('Sketch/simpleMode'))
    mask_size=None
    if not simple:
        definition=xml(params.get('brush_definition',''))
        if definition.get('type')not in('gbr_brush','png_brush'):raise ValueError('Sketch mask-selected mode requires captured static bitmap alpha')
        filename=definition.get('filename','');raw=resource(filename);image=gbr(raw,preserve_color=True)if filename.lower().endswith('.gbr')else raster(raw,filename)
        mask_size=list(image.size)
        if min(mask_size)<1 or max(mask_size)>256:raise ValueError('Sketch101 bitmap size<=256 required')
    if enabled(params.get('PaintOpSettings/isAirbrushing')):raise ValueError('Sketch timed input is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Sketch supports normal compositing only')
    def number(key,default,lo,hi):
        value=numeric(params.get(key),default)
        if not math.isfinite(value) or not lo<=value<=hi:raise ValueError('Sketch setting outside bounded range: '+key)
        return value
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    from native_ignored_options import strip_unused_native_flow,strip_unused_native_mirror,strip_unused_native_rotation
    ignored_flow=strip_unused_native_flow(transformed)
    ignored_mirror=strip_unused_native_mirror(transformed)
    ignored_rotation=strip_unused_native_rotation(transformed) if simple else False
    for node in transformed.findall('param'):
        if node.get('name')=='PaintOpAction':node.text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False)
    d=result['descriptor'];d['version']=44 if simple else(114 if enabled(params.get('Sketch/distanceOpacity'))else 101)
    # Pixel's derived integer-image bank is not Sketch's native selection mask.
    # New101 reads the already-captured alpha plane with its explicit own law.
    if not simple:d['tip'].pop('imageSampling',None)
    if simple:d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    elif d['tip']['kind']!='bitmap'or d['tip'].get('aspect')!=1 or any(k in d['tip']for k in('color','animation','material','imageSampling','profile','autoNoise','autoShape'))or catalog.assets[d['tip']['mask']]['size']>256:raise ValueError('Unsupported Sketch101 captured alpha bitmap')
    d.pop('scatter',None);d.pop('texture',None);d.pop('wet',None)
    behavior=d['behavior']
    if simple:behavior.pop('rotation',None)
    behavior.pop('scatter',None);behavior.pop('spacing',None)
    behavior['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    d['sketch']={'version':1,'mode':'simple'if simple else'mask',**({'maskSize':mask_size}if not simple else{}),'width':number('Sketch/lineWidth',1,.01,1000),'offset':number('Sketch/offset',30,-1000,1000)/100,'probability':number('Sketch/probability',.5,0,1),
                 **{target:enabled(params.get('Sketch/'+source,str(default).lower())) for target,source,default in [('connect','makeConnection',True),('magnetify','magnetify',True),('randomRGB','randomRGB',False),('randomOpacity','randomOpacity',False),('distanceDensity','distanceDensity',True),('distanceOpacity','distanceOpacity',False),('antialias','antiAliasing',False)]}}
    if not simple and d['sketch']['distanceOpacity']:d['sketch']['distanceOpacityPolicy']='generic-clamp-v1'
    notes=[];controls={}
    for option,key in [('Line width','width'),('Offset scale','offset'),('Density','probability')]:
        if not enabled(params.get('Pressure'+option)):continue
        local=[];values=size_like_controls(params,option,local,allow_time=True)
        if any(n['status']=='unsupported'for n in local):raise ValueError('Unsupported Sketch '+option+' sensor combination')
        value=number(option+'Value',1,0,1)
        if value!=1:values.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,value],[1,value]]})
        if len(values)>4:raise ValueError('Sketch sensor count limit')
        if values:controls[key]=values
        notes+=local
    if controls:d['sketch']['dynamics']=controls
    ignored={'autoSpacing','standardMaskProfile','radialCurveProfile','gaussianProcedural','softCurveGenerator','gihSelection','RotationComposition','RotationSensor'}
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ignored and n['feature']!='kritaEngine']+notes
    for n in result['compatibility']:
        if n['feature']=='activeDynamics':n['detail']=', '.join(v for v in n['detail'].split(', ')if v not in ('PressureLine width','PressureOffset scale','PressureDensity','PressureRotation'))
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='activeDynamics' or n['detail']]
    result['compatibility'].append(compatibility('sketch','Simple-radius connections, original author input knots, magnetify/offset, probability/distance density, binary distance opacity, random RGB/opacity and line controls retained. Retains32768 input points and at most4096 recent neighbours per request. RNG and capsule AA/line byte rounding differ from native DDA/Wu.'if simple else'Static bitmap alpha-mask-selected connections use native bounding box/hotspot/nonzero-alpha gating before probability/distance density, magnetify/offset and line colour. Native Sketch fixes dab ratio to1: generic dab.aspectRatio and generic aspect responses do not alter this mask; intrinsic nonsquare maskSize is retained. Retains32768 input points and at most4096 recent neighbours per request. Browser allocated-mask filtering, RNG and capsule AA/line byte rounding differ from native QImage/DDA/Wu.'))
    if not simple:result['compatibility'].append(compatibility('sketchMask','Captured static alpha bitmap<=256 selects historical input points after allocated-mask bounding box, hotspot/qRound and nonzero filtered alpha; the alpha is a gate, not another probability. Size and Rotation are evaluated per request. Browser bilinear mask filtering/allocation differs from native QImage; animated/procedural/colour masks, mask distanceOpacity and timers remain unsupported.'))
    if not simple and d['sketch']['distanceOpacity']:
        for note in result['compatibility']:
            if note['feature']=='sketchMask':note['detail']=note['detail'].replace('mask distanceOpacity and timers remain unsupported','timers remain unsupported')
        result['compatibility'].append(compatibility('sketchDistanceOpacity','Explicit generic-clamp-v1: signed Qt5 half-up distance factor then random opacity, normalized to [0,1] before line AA/request union; request Opacity applies once. Negative rectangular-mask corners match generic native U8 clamping, not optimized native signed byte artifacts.'))
    if ignored_flow:result['compatibility'].append(compatibility('ignoredNativeFlow','This native paintop evaluates Opacity, not Flow. Unused captured Flow settings do not affect rendering.','supported'))
    if ignored_mirror:result['compatibility'].append(compatibility('ignoredNativeMirror','This native paintop does not connect the brush Mirror option to its rendering path. Captured unused Brush Mirror settings do not change rendering; canvas symmetry is separate.','supported'))
    if ignored_rotation:result['compatibility'].append(compatibility('ignoredNativeRotation','This native paintop mode does not consume the generic brush Rotation option. Active family-specific angle controls remain independent.','supported'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
