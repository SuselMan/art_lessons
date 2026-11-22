"""Independent adapter for Sketch's simple radius-neighbour connections.

Reference: pinned KDE sketch option data and paintop. Mask-selected non-simple
connections and active timed input are rejected rather than treated as a disc.
"""
from native_timing195 import clock_enabled
import io
import struct
import hashlib
import math
import xml.etree.ElementTree as ET
from PIL import Image, PngImagePlugin
from brush_contract import finalize_identity,compatibility
from brush_numeric import numeric
from legacy_radius872 import auto_generator_diameter


def sketch_preset(data,root,params,name,catalog,external,resource,*,timed_input=False):
    from krita_import import preset,enabled,size_like_controls,gbr,gih,raster,xml,brush_application
    from sketch_spray194 import COMPONENT194
    whole194=COMPONENT194.get()
    simple=enabled(params.get('Sketch/simpleMode'))
    mask_size=None;image_alpha=None;procedural=False;pipe174=False;pipe181=False;pipe182=False
    if not simple:
        definition=xml(params.get('brush_definition',''))
        if definition.get('type')=='auto_brush':
            g=definition.find('MaskGenerator')
            # The closed scope bounds the diameter Krita actually applies, which
            # for a legacy 2.2 bundle is the "radius" attribute (#872): resolve
            # it through the shared helper so the bounds cannot be bypassed.
            if not whole194 and (g is None or g.get('id','default')!='default'or g.get('type','circle')not in('circle','rect')or numeric(g.get('spikes'),2)!=2 or numeric(definition.get('density'),1)!=1 or numeric(definition.get('randomness'),0)!=0 or not .01<=auto_generator_diameter(g,1)<=256 or not .0625<=numeric(g.get('ratio'),1)<=1):raise ValueError('Sketch173 mask-selected procedural generator outside closed scope')
            if not whole194 and any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing','EraserMode','Krita/erase','MaskingBrush/Enabled','PressureSoftness','PressureSharpness'))or params.get('PaintOpAction','1')!='1':raise ValueError('Sketch173 outside static root ordinary scope')
            procedural=True
        elif definition.get('type')not in('gbr_brush','png_brush'):raise ValueError('Sketch mask-selected mode requires captured static bitmap alpha')
        if not procedural:
            filename=definition.get('filename','');raw=resource(filename)
            if filename.lower().endswith('.gih'):
                pipe=gih(raw,preserve_color=True);frames=pipe['frames']
                if not whole194 and (pipe['mode']not in('incremental','pressure','angular')or not 2<=len(frames)<=256 or pipe['declaredCount']!=len(frames)or len({f.size for f in frames})!=1 or any(f.mode!='L'for f in frames)or brush_application(definition,frames)!=0):raise ValueError('Sketch174 requires equal incremental ordinary alpha frames')
                if any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing','EraserMode','Krita/erase','MaskingBrush/Enabled'))or params.get('PaintOpAction','1')!='1':raise ValueError('Sketch174 outside closed root ordinary scope')
                if not whole194 and enabled(params.get('PressureSize'))and enabled(params.get('SizeUseCurve','true')):
                    sensor=xml(params.get('SizeSensor','<params id="pressure"/>'));nodes=list(sensor.findall('ChildSensor'))if sensor.get('id')=='sensorslist'else[sensor]
                    if not nodes or any(n.get('id')!='pressure'for n in nodes):raise ValueError('Sketch174 Size supports pressure/off only')
                image=frames[0];pipe174=not whole194 and pipe['mode']=='incremental';pipe181=not whole194 and pipe['mode']=='pressure';pipe182=not whole194 and pipe['mode']=='angular'
            else:image=gbr(raw,preserve_color=True)if filename.lower().endswith('.gbr')else raster(raw,filename)
            mask_size=list(image.size)
            if min(mask_size)<1 or max(mask_size)>(2048 if whole194 else 256):raise ValueError('Sketch101 bitmap size<=256 required')
            if not whole194 and image.mode in('RGB','RGBA')and brush_application(definition,[image])==1:image_alpha=image.convert('RGBA').getchannel('A')
    timer=clock_enabled(params, 'PaintOpSettings/isAirbrushing')
    if timer and not timed_input:raise ValueError('Sketch timed input requires explicit closed161 opt-in')
    if timer:
        if not simple or enabled(params.get('PaintOpSettings/ignoreSpacing'))or enabled(params.get('EraserMode'))or enabled(params.get('Krita/erase'))or enabled(params.get('MaskingBrush/Enabled'))or params.get('PaintOpAction','1')!='1':raise ValueError('Sketch161 requires root simple normal static native timer')
        from native_pressure_rate import native_pressure_rate
        timing=native_pressure_rate(params)
    if not whole194 and params.get('CompositeOp','normal')!='normal':raise ValueError('Sketch supports normal compositing only')
    def number(key,default,lo,hi):
        value=numeric(params.get(key),default)
        if not math.isfinite(value) or not lo<=value<=hi:raise ValueError('Sketch setting outside bounded range: '+key)
        return value
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    private_external=external
    if pipe182:
        from sketch_gih182 import private_incremental_alpha182
        filename,private_pipe=private_incremental_alpha182(frames)
        private_external={filename:private_pipe}
        for resources in transformed.findall('resources'):transformed.remove(resources)
        definition.set('filename',filename)
        for node in transformed.findall('param'):
            if node.get('name')=='brush_definition':node.text=ET.tostring(definition,encoding='unicode')
    if image_alpha is not None:
        if clock_enabled(params, 'PaintOpSettings/isAirbrushing')or clock_enabled(params, 'AirbrushOption/isAirbrushing')or enabled(params.get('EraserMode'))or enabled(params.get('Krita/erase'))or enabled(params.get('MaskingBrush/Enabled'))or params.get('PaintOpAction','1')!='1':raise ValueError('Sketch162 requires root static IMAGESTAMP without timer/erase/dual/Wash')
        alpha=image_alpha.tobytes();filename='__grafetto_sketch_alpha162_'+hashlib.sha256(alpha).hexdigest()+'.gbr';label=b'Captured Sketch IMAGESTAMP alpha\0'
        bridge=struct.pack('>7I',28+len(label),2,image_alpha.width,image_alpha.height,1,0x47494d50,25)+label+alpha
        private_external={filename:bridge}
        # Original embedded resources were validated by the outer reader. The
        # private bridge must not be shadowed by an input basename collision.
        for resources in transformed.findall('resources'):transformed.remove(resources)
        # Only private parsing sees this MASK. Source XML/resource identity stays original.
        definition.set('type','gbr_brush');definition.set('filename',filename)
        for key in('brushApplication','preserveLightness','ColorAsMask','AdjustmentMidPoint','BrightnessAdjustment','ContrastAdjustment','AdjustmentVersion','AutoAdjustMidPoint'):definition.attrib.pop(key,None)
        definition.set('ColorAsMask','1')
        for node in transformed.findall('param'):
            if node.get('name')=='brush_definition':node.text=ET.tostring(definition,encoding='unicode')
    from native_ignored_options import strip_unused_native_flow,strip_unused_native_mirror,strip_unused_native_rotation
    ignored_flow=strip_unused_native_flow(transformed)
    ignored_mirror=strip_unused_native_mirror(transformed)
    ignored_rotation=strip_unused_native_rotation(transformed) if simple else False
    for node in transformed.findall('param'):
        if timer and node.get('name')in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing','PressureRate'):node.text='false'
        if node.get('name')=='PaintOpAction':node.text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta,icc_profile=im.info.get('icc_profile') if isinstance(im.info.get('icc_profile'),bytes) else None)
    result=preset(out.getvalue(),name,catalog,private_external,_allow_texture_material=False)
    d=result['descriptor'];d['version']=44 if simple else(114 if enabled(params.get('Sketch/distanceOpacity'))else 101)
    # Pixel's derived integer-image bank is not Sketch's native selection mask.
    # New101 reads the already-captured alpha plane with its explicit own law.
    if not simple:d['tip'].pop('imageSampling',None)
    if simple:d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    elif not whole194 and not procedural and (d['tip']['kind']!='bitmap'or d['tip'].get('aspect')!=1 or any(k in d['tip']and(k!='animation'or not(pipe174 or pipe181 or pipe182))for k in('color','animation','material','imageSampling','profile','autoNoise','autoShape'))or catalog.assets[d['tip']['mask']]['size']>256):raise ValueError('Unsupported Sketch101 captured alpha bitmap')
    d.pop('scatter',None);d.pop('texture',None);d.pop('wet',None)
    behavior=d['behavior']
    if simple:behavior.pop('rotation',None)
    behavior.pop('scatter',None);behavior.pop('spacing',None)
    behavior['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    d['sketch']={'version':1,'mode':'simple'if simple else'mask',**({'maskSize':mask_size}if not simple and not procedural else{}),'width':number('Sketch/lineWidth',1,.01,1000),'offset':number('Sketch/offset',30,-1000,1000)/100,'probability':number('Sketch/probability',.5,0,1),
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
    if image_alpha is not None:
        from sketch_image_alpha162 import sketch_image_alpha162_scope
        d['version']=162;d['sketch']['maskSignal']='image-alpha-v1'
        if not sketch_image_alpha162_scope(d):raise ValueError('Sketch162 outside closed alpha-selector scope')
        result['compatibility'].append(compatibility('sketchImageAlpha162','Static native IMAGESTAMP contributes original alpha only to nonzero Sketch point selection. Source RGB is not drawn; connections retain the normal Sketch foreground/random-color law. Same alpha CAS/101 geometry and114 distanceOpacity; browser filtering/RNG/U8 line AA remain functionally qualified.','supported'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if timer:
        from sketch_timer161 import sketch_timer161_scope
        d['version']=164 if 'rateDynamics'in timing else 161;behavior['timing']=timing
        if not sketch_timer161_scope(d):raise ValueError('Sketch161 outside closed root scope')
        result['compatibility'].append(compatibility('sketchRate164'if d['version']==164 else 'sketchTimer161','Checked native pressure/off Rate and strength use existing81 clock; moving Sketch requests do not update/spend/reset stationary timing, existing point-history/density/opacity solver and recorded replay remain unchanged. Zero factor suspends stationary timing; moving input still paints. No fuzzy/combination/native RNG or line pixel identity.'if d['version']==164 else'Static native simple Sketch timer reuses author F64 clock81: one request per moving input, stationary elapsed requests retain the shared native accumulator. Existing point history, density/opacity/random line laws remain; replay never retimes. Functional qualification, not native RNG/line pixel identity.','supported'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if procedural and not whole194:
        from sketch_procedural173 import sketch_procedural173_scope
        d['version']=173;d['sketch']['maskSignal']='procedural-standard-v1'
        if not sketch_procedural173_scope(d):raise ValueError('Sketch173 outside closed procedural scope')
        result['compatibility']=[n for n in result['compatibility']if n['feature']not in('sketchMask','sketch')]
        result['compatibility'].append(compatibility('sketchProcedural173','Static native standard ellipse/rectangle selects historical points through allocated pixel U8 nonzero alpha before existing Sketch probability/line laws. Existing scalar U8 AA/fade and captured Size/Rotation reused; no native SIMD/RNG/line-pixel identity. Procedural physical axes bounded256.','approximate'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if pipe174:
        from sketch_gih174 import sketch_gih174_scope
        d['version']=174;d['sketch']['maskSignal']='gih-alpha-v1'
        if not sketch_gih174_scope(d):raise ValueError('Sketch174 outside closed incremental scope')
        result['compatibility']=[n for n in result['compatibility']if n['feature']not in('sketchMask','sketch')]
        result['compatibility'].append(compatibility('sketchGih174','Equal captured ordinary alpha frames select Sketch points through allocated mask U8!=0. Incremental sequence advances per generated non-tiny mask, never per connection/chunk/tile. Existing geometry/line/RNG remain functionally qualified; no native pixel identity.','approximate'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if pipe181:
        from sketch_gih181 import sketch_pressure_gih181_scope
        d['version']=181;d['sketch']['maskSignal']='gih-alpha-v1'
        if not sketch_pressure_gih181_scope(d):raise ValueError('Sketch181 outside closed pressure GIH scope')
        result['compatibility']=[n for n in result['compatibility']if n['feature']not in('sketchMask','sketch')]
        result['compatibility'].append(compatibility('sketchPressureGih181','Equal ordinary alpha GIH frames select non-simple Sketch historical points from captured current pressure using the existing native half-up index, independent of generated-mask ordinal and Size response. Same U8 mask gate/geometry/line/RNG qualification as174; no native pixel identity.','approximate'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if pipe182:
        from sketch_gih182 import sketch_angular_gih182_scope
        d['version']=182;d['sketch']['maskSignal']='gih-alpha-v1'
        d['tip']['animation']={'mode':'angular','rank':len(frames),'cursorPolicy':'first-request-v1','frames':d['tip']['animation']['frames']}
        behavior['strokeInput']={'version':1,'initialDirection':'cursorHistory'}
        if not sketch_angular_gih182_scope(d):raise ValueError('Sketch182 outside closed angular GIH scope')
        result['compatibility']=[n for n in result['compatibility']if n['feature']not in('sketchMask','sketch')]
        result['compatibility'].append(compatibility('sketchAngularGih182','Equal ordinary alpha frames select non-simple Sketch points by recorded drawing angle plus native3pi/4, normalized to one rank. Existing captured cursorHistory/sourceAngle is mandatory, never substituted by painted angle. Native Sketch fetches every non-tiny mask directly; Pixel canPaintFor movement suppression does not apply. Original frame alpha/order, U8 gate and174 geometry/line/RNG qualification retained; no native pixel identity.','approximate'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
