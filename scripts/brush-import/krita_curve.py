"""Curve paintop history paths; uses common opacity and sensor import."""
from native_timing195 import clock_enabled
import io,math
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def curve_preset(data,root,params,name,catalog,external,*,timed_input=False):
    from krita_import import preset,enabled,numeric,size_like_controls
    timer=clock_enabled(params, 'PaintOpSettings/isAirbrushing')
    if timer or clock_enabled(params, 'AirbrushOption/isAirbrushing'):
        if not timer or not timed_input:raise ValueError('Curve timed input requires closed167 opt-in')
        if any(clock_enabled(params, k)for k in('PressureRate','PaintOpSettings/ignoreSpacing','EraserMode','Krita/erase','MaskingBrush/Enabled'))or params.get('PaintOpAction','1')!='1':raise ValueError('Curve167 unsupported timer combination')
        rate=numeric(params.get('PaintOpSettings/rate'),1)
        if not math.isfinite(rate)or not 0<rate<=1000:raise ValueError('Curve167 native rate outside0..1000')
        raw_interval=500/rate
        if not math.isfinite(raw_interval)or raw_interval>320000000000:raise ValueError('Curve167 interval outside existing81 clock bound')
        interval=max(1,math.floor(raw_interval))
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Curve supports normal compositing only')
    def number(key,default,lo,hi):
        v=numeric(params.get('Curve/'+key),default)
        if not math.isfinite(v)or not lo<=v<=hi:raise ValueError('Curve setting outside bounded range: '+key)
        return v
    history=number('strokeHistorySize',12,2,128)
    if int(history)!=history:raise ValueError('Curve history must be an integer')
    width=number('lineWidth',1,.1,1000)
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    from native_ignored_options import strip_unused_native_flow,strip_unused_native_mirror,strip_unused_native_rotation
    if timer:
        for node in transformed.findall('param'):
            if node.get('name')in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing'):node.text='false'
    ignored_flow=strip_unused_native_flow(transformed)
    ignored_mirror=strip_unused_native_mirror(transformed)
    ignored_rotation=strip_unused_native_rotation(transformed)
    # Curve has no stamp/Size/Rotation option. Supply a harmless initialization
    # tip only for the common parser, and remove stale unrelated settings.
    for node in list(transformed):
        if node.get('name')in('brush_definition','PressureSize','PressureRotation','PressureScatter','PressureSpacing','PressureLine width','PressureCurves opacity','PaintOpAction'):transformed.remove(node)
    ET.SubElement(transformed,'param',name='brush_definition').text='<Brush type="auto_brush" spacing="0.1" angle="0"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1" diameter="1"/></Brush>'
    ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta,icc_profile=im.info.get('icc_profile') if isinstance(im.info.get('icc_profile'),bytes) else None)
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False);d=result['descriptor'];d['version']=53
    d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    for key in ('scatter','texture','wet'):d.pop(key,None)
    for key in ('rotation','scatter','spacing'):d['behavior'].pop(key,None)
    d['sizeByPressure']=[[0,1],[1,1]]
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    trace={'version':2,'history':int(history),'smoothing':enabled(params.get('Curve/smoothing')),'connect':enabled(params.get('Curve/makeConnection')),'opacity':number('curvesOpacity',1,0,1)}
    notes=[];dynamics={}
    for option,key in [('Line width','width'),('Curves opacity','opacity')]:
        if not enabled(params.get('Pressure'+option)):continue
        local=[];controls=size_like_controls(params,option,local,allow_time=True)
        if any(n['status']=='unsupported'for n in local):raise ValueError('Unsupported Curve '+option+' sensor combination')
        value=numeric(params.get(option+'Value'),1)
        if not math.isfinite(value)or not 0<=value<=1:raise ValueError('Curve option value outside0..1')
        if value!=1:controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,value],[1,value]]})
        if len(controls)>4:raise ValueError('Curve sensor count limit')
        if controls:dynamics[key]=controls
        notes+=local
    if dynamics:trace['dynamics']=dynamics
    d['curveTrace']=trace
    result['sourceDefaults']={'sizePx':width,'opacity':d['opacity'],'flow':1}
    ignored={'kritaEngine','standardMaskProfile','autoSpacing'}
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ignored]+notes
    # Retire only an exact option already lowered into this195 render payload.
    from native_timing195 import TIMING195
    if TIMING195.get() and dynamics.get('width'):
        for note in result['compatibility']:
            if note['feature']=='activeDynamics':
                note['detail']=', '.join(v for v in note['detail'].split(', ')if v!='PressureLine width')
        result['compatibility']=[n for n in result['compatibility']if n['feature']!='activeDynamics' or n['detail']]
    result['compatibility'].append(compatibility('curveTrace','Basic input cubic smoothing and0.5px subdivision before the bounded history (depth8 admission); native default input law, not raw browser sample history. Native bounded history, quadratic midpoint or cubic one-third/two-third controls, optional connection and independent path/request opacity retained. Adaptive de Casteljau stops at0.25px flatness or256 segments; capsule AA/joins differ from Qt painter paths. Size slider controls line width.'))
    if ignored_flow:result['compatibility'].append(compatibility('ignoredNativeFlow','This native paintop evaluates Opacity, not Flow. Unused captured Flow settings do not affect rendering.','supported'))
    if ignored_mirror:result['compatibility'].append(compatibility('ignoredNativeMirror','This native paintop does not connect the brush Mirror option to its rendering path. Captured unused Brush Mirror settings do not change rendering; canvas symmetry is separate.','supported'))
    if ignored_rotation:result['compatibility'].append(compatibility('ignoredNativeRotation','This native paintop mode does not consume the generic brush Rotation option. Active family-specific angle controls remain independent.','supported'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if timer:
        from curve_timer167 import curve_host_timer167_scope
        d['version']=167;d['behavior']['timing']={'version':1,'rate':1000/interval,'ignoreDistanceSpacing':True}
        if not curve_host_timer167_scope(d):raise ValueError('Curve167 outside closed static root scope')
        result['compatibility'].append(compatibility('curveHostTimer167','Native host callback period max(1,floor(500/nativeRate)); every real input restarts its deadline. Existing BASIC curve input/history/path renderer retained; initial paintAt is anchor only. Author81 records F64 requests; replay never retimes. Event-loop lateness, Qt pixels and native RNG sequence not identical.','supported'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
