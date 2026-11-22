"""Mask-derived persistent Bristle hairs; native option names are preserved.

Soaking is staged behind the canonical-BEGIN139 palette contract. No per-frame or per-tile random selection.
"""
from native_timing195 import clock_enabled
import io,math,hashlib
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def bristle_preset(data,root,params,name,catalog,external,*,_allow_initialization=True):
    from krita_import import preset,enabled,numeric
    if type(_allow_initialization)is not bool:raise ValueError('Private Bristle initialization origin must be boolean')
    if params.get('PaintOpAction','1') not in ('1','2'):
        raise ValueError('Unsupported noncanonical Bristle painting mode')
    ink_enabled=enabled(params.get('HairyInk/enabled'))
    soak=ink_enabled and enabled(params.get('HairyInk/soak'))
    if soak and(params.get('PaintOpAction','1')!='1'or enabled(params.get('Krita/erase'))or enabled(params.get('EraserMode'))or any(clock_enabled(params, k)for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing'))):raise ValueError('Bristle Soak139 requires normal directOver untimed input')
    if clock_enabled(params, 'PaintOpSettings/isAirbrushing'):raise ValueError('Bristle timed input is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Bristle supports normal compositing only')
    aa=enabled(params.get('HairyBristle/antialias'));compositing=enabled(params.get('HairyBristle/useCompositing'))
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    from native_ignored_options import strip_unused_native_flow,strip_unused_native_mirror
    ignored_flow=strip_unused_native_flow(transformed)
    ignored_mirror=strip_unused_native_mirror(transformed)
    for node in transformed.findall('param'):
        if node.get('name')=='PaintOpAction':node.text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta,icc_profile=im.info.get('icc_profile') if isinstance(im.info.get('icc_profile'),bytes) else None)
    original_source={}
    result=preset(out.getvalue(),name,catalog,external,_allow_texture_material=False,_bristle_source_capture=original_source);d=result['descriptor'];tip=d['tip']
    side=max(1,round(result['sourceDefaults']['sizePx']))
    if side>256:raise ValueError('Bristle initialization mask exceeds256px')
    if tip['kind']=='bitmap':
        asset=catalog.assets[tip['mask']];mask=Image.frombytes('L',(asset['size'],asset['size']),(catalog.output/asset['file']).read_bytes())
        bounds=tip['maskBounds'];x,y,w,h=(bounds[k] for k in ('x','y','width','height'))
        mask=mask.crop((round(x*mask.width),round(y*mask.height),round((x+w)*mask.width),round((y+h)*mask.height))).resize((side,side),Image.Resampling.LANCZOS)
    else:
        from bristle_procedural import standard_circle
        definition=ET.fromstring(params.get('brush_definition',''))
        if definition.get('type')!='auto_brush':raise ValueError('Bristle requires a bitmap or supported procedural tip')
        mask=standard_circle(definition,side)
        result['compatibility']=[n for n in result['compatibility'] if n['feature'] not in ('autoBrush','autoMaskNoise','standardMaskProfile','autoSpikes')]
        result['compatibility'].append(compatibility('bristleProceduralSource','Standard circular or rectangular procedural source rasterized at authored size and angle with deterministic per-pixel density and attenuation; Krita random sequence and raster rounding may differ.'))
    density=numeric(params.get('HairyBristle/density'),100)/100
    if not math.isfinite(density) or not 0<=density<=1:raise ValueError('Bristle density outside0..100')
    mask_side=mask.width
    expansion=mask_side/side
    if expansion!=1 and ink_enabled and mask_side>256:raise ValueError('Expanded rotated Bristle ink initialization exceeds256px')
    hairs=[]
    for yy in range(mask_side):
        for xx in range(mask_side):
            alpha=mask.getpixel((xx,yy))/255
            random=int.from_bytes(hashlib.sha256(f'{xx},{yy}'.encode()).digest()[:4],'big')/2**32
            if alpha>0 and random<=density:hairs.append([(xx-mask_side//2)/mask_side,(yy-mask_side//2)/mask_side,alpha])
    population_limit=4096 if ink_enabled else 8192
    if not 0<len(hairs)<=population_limit:raise ValueError(f'Bristle population outside1..{population_limit}; reduce source mask/density')
    def number(key,default,lo,hi):
        v=numeric(params.get('HairyBristle/'+key),default)
        if not math.isfinite(v) or not lo<=v<=hi:raise ValueError('Bristle setting outside bounded range: '+key)
        return v
    d['version']=66 if not aa and not compositing else 45;d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    for key in ('scatter','texture','wet'):d.pop(key,None)
    for key in ('scatter','spacing'):d['behavior'].pop(key,None)
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    effective_scale=number('scale',2,0 if ink_enabled else -10,10)*expansion
    if not -10<=effective_scale<=10:raise ValueError('Expanded Bristle scale outside bounded range')
    d['bristle']={'version':1,'hairs':hairs,'scale':effective_scale,'shear':number('shear',0,-10,10),'random':number('random',2,0,100)/expansion,'mousePressure':enabled(params.get('HairyBristle/useMousePressure')),'threshold':enabled(params.get('HairyBristle/threshold')),'connected':enabled(params.get('HairyBristle/isConnected')),'antialias':aa,'compositing':compositing}
    if ink_enabled:
        from curve_transfer import native_transfer
        import struct
        amount=numeric(params.get('HairyInk/inkAmount'),1024)
        if not math.isfinite(amount) or amount!=int(amount) or not 2<=amount<=65536:
            raise ValueError('Bristle ink amount outside bounded2..65536')
        amount=int(amount)
        curve=native_transfer(params.get('HairyInk/inkDepletionCurve','0,0;1,1;'),amount)
        samples=curve['samples'] if isinstance(curve,dict) else [i/(amount-1) for i in range(amount)]
        def ink_number(key,default,lo,hi):
            value=numeric(params.get('HairyInk/'+key),default)
            if not math.isfinite(value) or not lo<=value<=hi:raise ValueError('Bristle ink setting outside bounded range: '+key)
            return value
        d['version']=72
        d['bristle']['version']=2
        d['bristle']['ink']={'depletion':[struct.unpack('f',struct.pack('f',v))[0] for v in samples],
            'useOpacity':enabled(params.get('HairyInk/useOpacity','true')),'useSaturation':enabled(params.get('HairyInk/useSaturation')),
            'useWeights':enabled(params.get('HairyInk/useWeights')),
            'pressureWeight':ink_number('pressureWeights',50,0,100)/100,
            'bristleLengthWeight':ink_number('bristleLengthWeights',50,0,100)/100,
            'bristleInkAmountWeight':ink_number('bristleInkAmountWeight',50,0,100)/100,
            'inkDepletionWeight':ink_number('inkDepletionWeight',50,0,100)}
    if ink_enabled and d['bristle']['ink']['useSaturation']:
        from captured_bristle import install_bristle
        lookup,_quality=install_bristle(d['bristle']['ink'],catalog)
        d['version']=93;d['bristle']['saturationLookup']=lookup
    if soak:
        from bristle_soak139 import bristle_soak139_scope
        dynamic_angle=d.get('behavior',{}).get('dynamics',{}).get('angle')
        d['version']=205 if dynamic_angle else 139;d['bristle']['soak']={'sourcePolicy':'canonical-begin-v1','initialSide':mask_side}
        if not dynamic_angle and density==1 and side<=64 and expansion==1:
            d['version']=140;d['bristle']['soak']['resizePolicy']='mask-population-v1'
        if not bristle_soak139_scope(d):raise ValueError('Bristle Soak139 requires closed root canonical-BEGIN ink palette scope')
    ignored={'gihSelection','gihFrameCount','kritaEngine','autoSpacing'}
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ignored]
    result['compatibility'].append(compatibility('bristle','Mask-derived fixed hairs, pressure contact, shear, jitter, mouse pressure and connected paths retained. Initialization uses the first pipe frame and deterministic Grafetto population; GPU capsule coverage/additive AA differs from native per-pixel DDA/Wu. Aliased maximum-alpha preserves the whole winning pigment via batched depth ranking; Opacity depletion uses persistent per-hair counters and a bounded GPU curve; saturation/soaking remain rejected.'))
    if ink_enabled and d['bristle']['ink']['useSaturation']:
        result['compatibility']=[dict(n,detail=n['detail'].replace('saturation/soaking remain rejected.','Saturation uses a compiled functional lookup; soaking remains rejected.'))if n['feature']=='bristle'else n for n in result['compatibility']]
        result['compatibility'].append(compatibility('bristleSaturation','Immutable profile compiled once into a trusted bounded CAS lookup. Functional clamped HSL interval transfer; deterministic quality-screen evidence is not a native RGB8/ICC identity or universal error bound. Canvas soaking remains unsupported.'))
    if ignored_flow:result['compatibility'].append(compatibility('ignoredNativeFlow','This native paintop evaluates Opacity, not Flow. Unused captured Flow settings do not affect rendering.','supported'))
    if ignored_mirror:result['compatibility'].append(compatibility('ignoredNativeMirror','This native paintop does not connect the brush Mirror option to its rendering path. Captured unused Brush Mirror settings do not change rendering; canvas symmetry is separate.','supported'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    # Private Pixel conversion still handles initialization only; native Wash is
    # admitted late on the completed genuine Bristle descriptor, never on a child.
    if params.get('PaintOpAction','1')=='2':
        from bristle_wash135 import bristle_wash135_scope
        d['version']=203 if compositing else 135;d['behavior']['rendering']['accumulation']='alphaDarken'
        if enabled(params.get('Krita/erase'))or enabled(params.get('EraserMode'))or not bristle_wash135_scope(d):raise ValueError('Bristle Wash135 requires closed no-ink AA additive request')
        result['compatibility'].append(compatibility('bristleWash','One AA hair-line request is transferred through common creamy Wash with the selected per-hair composition; captured external stroke opacity is applied once. Hair geometry/seed and first-anchor policy are unchanged; capsule coverage is a functional approximation to native Wu/DDA.'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if soak:
        result['compatibility']=[dict(n,detail=n['detail'].replace('saturation/soaking remain rejected.','Saturation requires its trusted compiled lookup. Soaking uses canonical-BEGIN source palette.').replace('soaking remains rejected.','Soaking uses canonical-BEGIN source palette.').replace('Canvas soaking remains unsupported.','Canvas soaking uses canonical-BEGIN source palette.'))if n['feature']in('bristle','bristleSaturation')else n for n in result['compatibility']]
        result['compatibility'].append(compatibility('bristleSoak','All hair colors sampled once before the first line writes, from canonical-BEGIN active-layer old pixels at nearest-integer initialization coordinates. Source alpha is retained unless opacity depletion replaces it; palette is rebuilt by full BEGIN replay. Functional canonical concurrency, color-space and raster behavior are not native pixel identity.'))
        if d['version']==140:
            result['compatibility'].append(compatibility('bristleResize','Complete initialization alpha grid retained: captured sourceSize1..64 rebuilds a dense mask population once per gesture using deterministic bilinear pixel-center/clamped-edge/U8 filtering; pressure and Bristle Scale transform this population afterwards. Native Qt filtering bytes are not identical.'))
        else:
            result['compatibility'].append(compatibility('bristleResize','This Soak preset keeps legacy139 fixed imported hairs: density below100% or initialization side above64 is outside the mask-population resize policy. Toolbar resizing stretches existing hairs; native reinitialization population differs.'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    if not ink_enabled:
        if _allow_initialization and expansion==1 and density==1 and params.get('PaintOpAction','1')=='1':
            from bristle_soak139 import bristle_resize141_scope
            candidate={**d,'version':141,'bristle':{**d['bristle'],'initialization':{'sourceSide':side,'resizePolicy':'mask-population-v1'}}}
            if not enabled(params.get('Krita/erase'))and not enabled(params.get('EraserMode'))and bristle_resize141_scope(candidate):
                # Original CAS alpha is the initialization authority; saved GUI
                # size only controls legacy hairs, never this source domain.
                if original_source and 2<=asset['size']<=1024:
                    width,height=original_source['width'],original_source['height'];angle=-original_source['angle']
                    quarter=round(angle/(math.pi/2))
                    if abs(angle-quarter*math.pi/2)<=1e-5:
                        rotation=([65536,0],[0,65536],[-65536,0],[0,-65536])[quarter%4]
                    else:rotation=[round(math.cos(angle)*65536),round(math.sin(angle)*65536)]
                    candidate['version']=144 if candidate['bristle']['antialias']and candidate['bristle']['compositing']else 143
                    candidate['bristle']['initialization']={'resizePolicy':'source-area143-v1','sourceSide':asset['size'],'sourceMask':tip['mask'],'sourceBounds':{'x':(asset['size']-width)//2,'y':(asset['size']-height)//2,'width':width,'height':height},'rotation':list(rotation)}
                    result['compatibility'].append(compatibility('bristleSource','Original padded alpha CAS and image footprint/angle retained until captured GUI size; area resize preserves aspect before bounded Q16 rotation. '+('Fast capsule raster retained; 'if candidate['version']==143 else'Versioned raster retained; ')+'no alpha boost or native Qt pixel identity claim.'))
                if candidate['version']==144:
                    result['compatibility'].append(compatibility('bristleRaster','Original source mask with native major-axis bilinear U8 point coverage and bounded oriented segment mesh; historical142 keeps its original full-AABB mesh. Request opacity remains applied once.'))
                d=candidate
                result['compatibility'].append(compatibility('bristleInitialization','Original source-area143 initialization is retained when available; otherwise legacy141 saved-size grid is rebuilt. Recorded sourceSize1..64 fixes population at BEGIN; pressure and Bristle Scale act afterwards. Native filtering/raster bytes may differ.'))
            else:
                result['compatibility'].append(compatibility('bristleInitialization','Legacy fixed imported hairs retained: this ordinary preset is outside the closed141 no-ink initialization scope. Toolbar resizing stretches existing hairs.'))
        else:
            result['compatibility'].append(compatibility('bristleInitialization','Legacy fixed imported hairs retained: non-full density, masking/private origin or Wash is outside ordinary141 initialization. Toolbar resizing stretches these hairs rather than rebuilding the native mask population.'))
        result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
