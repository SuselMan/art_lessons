"""Filter brush imports common mask/sensors and explicit filter settings."""
from native_timing195 import clock_enabled
import io,math
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def _legacy_filter_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled,numeric,xml
    kind={'gaussian blur':'gaussian','unsharp':'unsharp','invert':'invert','desaturate':'desaturate','posterize':'posterize'}.get(params.get('Filter/id'))
    if kind is None:raise ValueError('Unsupported brush filter: '+str(params.get('Filter/id')))
    smudge=enabled(params.get('Filter/smudgeMode'))
    if smudge and kind not in('invert','desaturate','posterize','gaussian','unsharp'):raise ValueError('Spatial Filter smudge mode requires persistent halo support and is unsupported')
    if enabled(params.get('EraserMode'))or params.get('CompositeOp','copy')!='copy':raise ValueError('Filter requires COPY compositing')
    airbrush_keys=('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')
    host_initial=any(clock_enabled(params, k)for k in airbrush_keys)
    if host_initial:
        if not smudge:raise ValueError('Filter186 host-initial requires smudge mode')
        if any(k in params and str(params[k]).lower()not in('true','false','0','1')for k in airbrush_keys):raise ValueError('Invalid Filter186 airbrush alias')
        if all(k in params for k in airbrush_keys)and enabled(params[airbrush_keys[0]])!=enabled(params[airbrush_keys[1]]):raise ValueError('Contradictory Filter186 airbrush aliases')
        if any(enabled(params.get('Pressure'+k,params.get(k+'UseCurve','false')))for k in('Opacity','Flow')):raise ValueError('Filter186 requires Opacity/Flow pressure OFF before bridge normalization')
        if any(k.startswith('Pressure')and enabled(v)for k,v in params.items()):raise ValueError('Filter186 requires all pressure/sensor options OFF')
        if any(clock_enabled(params, k)for k in('MaskingBrush/Enabled','Texture/Pattern/Enabled','PaintOpSettings/ignoreSpacing','FanCornersEnabled','fanCornersEnabled')):raise ValueError('Filter186 excludes dual/texture/timing/fan input')
        for key in ('PaintOpSettings/rate','AirbrushOption/rate'):
            if key in params:
                try:rate=float(params[key])
                except(ValueError,TypeError):raise ValueError('Invalid Filter186 static host rate')from None
                if not math.isfinite(rate)or not 0<=rate<=1000:raise ValueError('Invalid Filter186 static host rate')
        if params.get('RotationSensor'):
            sensor=xml(params['RotationSensor'])
            if any(node.get('fanCornersEnabled','0').lower()not in('false','0')or node.get('lockedAngleMode','0')!='0'for node in sensor.iter()):raise ValueError('Filter186 excludes fan/locked DrawingAngle')
    config={}
    authored_configs=root.findall('filterconfig')
    if len(authored_configs)>1:raise ValueError('Duplicate Filter configuration')
    cfg=authored_configs[0] if authored_configs else xml(params['Filter/configuration']) if params.get('Filter/configuration') else None
    if cfg is not None:
        config={p.get('name'):p.text or ''for p in cfg.iter('param')}
        if len(config)!=len(list(cfg.iter('param'))):raise ValueError('Duplicate Filter configuration parameter')
    allowed={'horizRadius','vertRadius','lockAspect'}if kind=='gaussian'else{'halfSize','amount','threshold','lightnessOnly'}
    if kind not in('invert','desaturate','posterize')and set(config)-allowed:raise ValueError('Unknown Filter configuration setting')
    def number(key,default,lo,hi):
        value=numeric(config.get(key),default)
        if not math.isfinite(value)or not lo<=value<=hi:raise ValueError('Filter setting outside bounded range: '+key)
        return value
    radiusX=0 if kind in('invert','desaturate','posterize')else(number('horizRadius',5,0,16)if kind=='gaussian'else number('halfSize',1,0,16))
    radiusY=0 if kind in('invert','desaturate','posterize')else(number('vertRadius',5,0,16)if kind=='gaussian'else radiusX)
    desaturate_type=0
    if kind=='desaturate':
        try:desaturate_type=float(config.get('type','0'))
        except ValueError:raise ValueError('Desaturate type must be an integer0..5')from None
        if not math.isfinite(desaturate_type)or not 0<=desaturate_type<=5 or desaturate_type!=int(desaturate_type):raise ValueError('Desaturate type must be an integer0..5')
    steps=16
    if kind=='posterize':
        try:steps=float(config.get('steps','16'))
        except ValueError:raise ValueError('Posterize steps must be an integer2..128')from None
        if not math.isfinite(steps)or not 2<=steps<=128 or steps!=int(steps):raise ValueError('Posterize steps must be an integer2..128')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in list(transformed):
        if node.get('name')in('CompositeOp','PaintOpAction','paintop'):transformed.remove(node)
    if host_initial:
        # ONLY the local Pixel bridge is normalized. Final identity uses ORIGINAL data.
        for node in transformed.findall('param'):
            if node.get('name')in airbrush_keys:node.text='false'
    ET.SubElement(transformed,'param',name='CompositeOp').text='normal';ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta,icc_profile=im.info.get('icc_profile') if isinstance(im.info.get('icc_profile'),bytes) else None)
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False,_adapter_private=True);d=result['descriptor'];d.update(version=117 if kind=='posterize'else 99 if kind=='desaturate'else 95 if kind=='invert'else 52,model='mixer',category='wet',paperInteraction=0,flow=1)
    for key in ('scatter','texture','wet'):d.pop(key,None)
    d['flowByPressure']=[[0,1],[1,1]]
    d['mixer']={'load':0,'initialLoad':0,'pickup':1,'strength':1,'source':'previousCanvas'}
    d['filter']={'version':2,'kind':'posterize','steps':int(steps)}if kind=='posterize'else{'version':2,'kind':'desaturate','type':int(desaturate_type)}if kind=='desaturate'else{'version':2,'kind':'invert'}if kind=='invert'else{'version':1,'kind':kind,'radiusX':radiusX,'radiusY':radiusY,'amount':number('amount',.5,0,5),'threshold':number('threshold',0,0,255),'lightnessOnly':enabled(config.get('lightnessOnly','true'))}
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    note=compatibility('filter','Frozen pre-stroke source reuses ordinary original tiles, common brush mask/sensors and COPY coverage. Separable Gaussian radius-to-sigma/support retained; radius0 is identity. Unsharp threshold/amount retained; lightness uses weighted RGB luminance rather than native colour-space conversion. RGBA8 intermediate quantization differs. Radius<=16; other filters, smudgeMode, non-COPY and timers rejected.')
    if kind=='invert':note=compatibility('filter','Pointwise native Invert changes colour channels and preserves alpha. Canonical premultipliedRGBA8 complement uses existing stroke-original tile and COPY mask once, without blur/gather/readback. Native ICC/HDR/Alpha-only models are outside this functional RGBA profile; unused native filter configuration does not change output.')
    if kind=='desaturate':note=compatibility('filter','Native Desaturate six explicit types preserve alpha: lightness, BT709(.2126,.7152,.0722), BT601(.299,.587,.114), average, min and max. Canonical homogeneous premultipliedRGBA pointwise graph reuses stroke-original tiles and COPY mask once; native straight-channel intermediate quantization/ICC/HDR may differ. Missing type is lightness0; unused native configuration has no effect.')
    if kind=='posterize':note=compatibility('filter','Native painting-enabled Posterize: steps2..128, default16. Functional sRGB16 integer step=floor65535/steps with strict remainder>halfStep rounds up; ALL four straight RGBA channels quantize, then premultiply and COPY-mask mix once using existing stroke-original tile. Not a steps-minus-one levels formula. Native ICC/profile conversion and final byte projection may differ; no extra gather, texture or framebuffer. Unused blur configuration does not change output.')
    if smudge:
        d['version']=159 if kind=='unsharp'else 153 if kind=='gaussian'else 147;d['filter'].update(smudgeMode=True,sourcePolicy='canonical-begin-v1')
        if kind=='gaussian':d['filter'].update(spatialPolicy='gaussian-halo-v1',amount=.5,threshold=0,lightnessOnly=True)
        if kind=='unsharp':
            if d['filter']['threshold']!=int(d['filter']['threshold']):raise ValueError('Unsharp159 threshold must be integral')
            d['filter'].update(spatialPolicy='unsharp-lab-halo-v1',threshold=int(d['filter']['threshold']))
        # Closed static pointwise source; no fallback may pretend smudge support.
        tip=d['tip'];behavior=d['behavior']
        bitmap=tip.get('kind')=='bitmap'
        if bitmap:d['version']=169 if kind=='invert'else 179;d['filter']['maskPolicy']='bitmap-alpha-v1'
        standard=tip.get('kind')=='procedural'and isinstance(tip.get('profile'),dict)and tip['profile'].get('kind')=='standard'and tip['profile'].get('shape')=='ellipse'
        if(not(bitmap or standard or tip.get('kind')=='round'and 'profile'not in tip)or any(k in tip for k in('animation','color','material','imageSampling','autoShape','autoNoise'))or any(k in behavior for k in('dual','timing','wetMix','taper','scatter','colorAdjustment'))or behavior.get('erase')is True or any(k in d for k in('clone','mypaint','tangentNormal'))):raise ValueError('Filter smudge147 requires root static round pointwise COPY scope')
        note=compatibility('filterSmudge','Pointwise Filter smudge preserves a persistent unmasked world-coordinate temporary device: each logical request filters OVER(canonical-BEGIN source, previous temporary), then COPY-masks onto current destination. Invert/Desaturate/Posterize only; no translated imprint, native ICC/quantization and concurrent source identity are not pixel-identical.')
    if smudge and kind=='gaussian':note=compatibility('filterSmudge','Gaussian spatial smudge preserves source-OVER updates on native neededRect (twice kernel support) including unfiltered halo, filters only current logical dabRect, then COPY-masks onto current destination. Radii0..16; sigma=.3r+.3/support3ceil(sigma), same canonical BEGIN and bounded16MiB request resources. RGBA8/native color-profile/quantization differences remain; oversized requests decline before acceptance.')
    if smudge and kind=='unsharp':note=compatibility('filterSmudge','Unsharp spatial smudge159 reuses canonical-BEGIN source and unmasked persistent temporary. Native source-OVER updateRect twice halfSize, full-request Gaussian read halo including radius0; raw signed transparent-weight convolution and threshold1 memcmp branch, or Lab16 lightness AND alpha sharpening with original chroma. Functional D65 Lab/DeltaE and RGBA8 boundaries are not native ICC/HDR/hidden-RGB identity. Existing ordinary52 remains unchanged; budget denial before acceptance.')
    if smudge and(kind=='unsharp'or d['filter'].get('maskPolicy')is not None):
        from canonical_effect_scopes import validate_canonical_effect_scopes
        validate_canonical_effect_scopes(d)
    if smudge and d['filter'].get('maskPolicy')=='bitmap-alpha-v1':note=compatibility('filterSmudge','Static ordinary bitmap ALPHAMASK169 uses existing native tip conversion/CAS and persistent unmasked invert temporary, canonical BEGIN source and final COPY coverage. No original-RGBA colour drawing, animation, dual, texture or timer. Native ICC/quantization/concurrency are functionally qualified, not pixel identity.')
    if smudge and d['version']==179:note=compatibility('filterSmudge','Static ordinary bitmap ALPHAMASK179 reuses existing Desaturate/Posterize/Gaussian/Unsharp carried temporary, canonical BEGIN, spatial halos where required, and final COPY coverage. Existing CAS/budget/owner and filter mathematics are unchanged; native ICC/quantization/concurrency remain functionally qualified, not pixel identity.')
    if host_initial:
        if any(n['status']=='unsupported'for n in result['compatibility']):raise ValueError('Filter186 unsupported active native settings')
        from canonical_effect_scopes import validate_canonical_effect_scopes
        d['version']=186
        validate_canonical_effect_scopes(d)
        note=compatibility('filterHostInitial186','Guard-only native host-initial admission on existing canonical-BEGIN Filter smudge. Grafetto already emits first request on down; no added timer, RNG, source recapture or renderer. Qualified NO_SMOOTHING/fan-off static pressure-off Size/Opacity/Flow/Strength/Rotation; native host smoothing/settings and pixel identity are not promised. Original airbrush aliases and KPP bytes remain the source identity; local Pixel bridge alone suppresses their unrelated timing parser. Existing COPY, filter payload, halos and budget remain unchanged.')
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']+[note];result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported'];result['descriptor']=finalize_identity(d,data)
    return result


def filter_preset(data,root,params,name,catalog,external):
    from krita_import import _native_preset_transaction,enabled
    if any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):
        return _legacy_filter_preset(data,root,params,name,catalog,external)
    # Historical complete imports retain exact descriptors and identities.
    def legacy():
        result=_legacy_filter_preset(data,root,params,name,catalog,external)
        if any(k in result['descriptor'].get('tip',{}) for k in ('autoNoise','autoShape')) or any(enabled(params.get('Pressure'+k))for k in('Opacity','Flow','Scatter','Softness','Sharpness','Ratio'))or enabled(params.get('Texture/Pattern/Enabled'))or enabled(params.get('MaskingBrush/Enabled'))or any(n['status']=='unsupported'for n in result['compatibility']):raise ValueError('Expanded native Filter settings require192')
        return result
    try:return _native_preset_transaction(catalog,legacy)
    except ValueError:
        from native_filter192 import lower_filter192
        return _native_preset_transaction(catalog,lambda:lower_filter192(data,root,params,name,catalog,external))
