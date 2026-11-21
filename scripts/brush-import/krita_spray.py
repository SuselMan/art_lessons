"""Spray format adapter; independent math from pinned KDE option/distribution docs.

Area, population and particle footprint are separate; native RNG/colour profile
and brush-device byte rounding are not claimed to be identical.
"""
import bisect
import io
import math
import xml.etree.ElementTree as ET
from PIL import Image, PngImagePlugin
from brush_contract import finalize_identity, compatibility


def inverse_cdf(pdf, upper=1):
    # Bounded import-time integration; the client only interpolates inverse CDF.
    samples=4096
    xs=[upper*i/samples for i in range(samples+1)]
    ys=[max(0,pdf(x)) for x in xs]
    cdf=[0]
    for i in range(samples):cdf.append(cdf[-1]+(ys[i]+ys[i+1])*(xs[i+1]-xs[i])/2)
    if not math.isfinite(cdf[-1]) or cdf[-1]<=0:raise ValueError('Spray distribution has no probability mass')
    total=cdf[-1];out=[]
    for j in range(257):
        value=j*total/256;i=max(1,min(samples,bisect.bisect_right(cdf,value)))
        fraction=(value-cdf[i-1])/(cdf[i]-cdf[i-1]) if cdf[i]>cdf[i-1] else 0
        out.append(xs[i-1]+fraction*(xs[i]-xs[i-1]))
    return out


def spray_source146_scope(d):
    """New root-only source policy; ordinary schema/resource validation is separate."""
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<146 or d.get('model')!='stamp':return False
    s,t,b=d.get('spray'),d.get('tip'),d.get('behavior')
    if not all(isinstance(x,dict)for x in(s,t,b)):return False
    c,p,r=s.get('color'),s.get('particle'),b.get('rendering')
    if not all(isinstance(x,dict)for x in(c,p,r)):return False
    if c.get('sourcePolicy')!='canonical-begin-v1'or c.get('sampleInput')is not True or 'image'in p or type(d.get('paperInteraction'))not in(int,float)or d.get('paperInteraction')!=0:return False
    if any(k in d for k in('mixer','wet','texture','scatter','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
    if b.get('version')!=2 or b.get('erase')is True or any(k in b for k in('dual','taper','edgeBleed','wetMix','grain'))or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or type(r.get('wetEdges',0))not in(int,float)or r.get('wetEdges',0)!=0 or type(r.get('burntEdges',0))not in(int,float)or r.get('burntEdges',0)!=0:return False
    if any(k in t for k in('material','color','imageSampling','autoShape','autoNoise'))or p.get('shape')=='tip'and 'profile'in t:return False
    return True


def validate_spray_source146(d,depth=0):
    s=d.get('spray')if isinstance(d,dict)else None
    c=s.get('color')if isinstance(s,dict)else None
    if not isinstance(c,dict)or 'sourcePolicy'not in c:return
    if depth or not spray_source146_scope(d):raise ValueError('Spray146 requires its closed root canonical BEGIN source')
    from spray_wash133 import _spray133_metadata
    normalized=dict(s);normalized['color']={k:v for k,v in c.items()if k not in('sourcePolicy','sampleInput','mixBackground','fillBackground')}
    if any(k in c and c[k]is not True for k in('sampleInput','mixBackground','fillBackground'))or not _spray133_metadata(normalized):raise ValueError('Invalid Spray146 metadata')


def spray_preset(data,root,params,name,catalog,external,resolve_resource=None):
    from krita_import import preset, enabled, numeric, xml, native_transfer
    from sketch_spray194 import COMPONENT194
    whole194=COMPONENT194.get()
    def number(key,default,lo,hi):
        n=numeric(params.get(key),default)
        if not lo<=n<=hi:raise ValueError('Spray setting outside supported range: '+key)
        return n
    source_flags={key:True for source,key in (('sampleInputColor','sampleInput'),('mixBgColor','mixBackground'),('fillBackground','fillBackground'))if enabled(params.get('ColorOption/'+source))}
    diameter=number('Spray/diameter',100,.01,10000)
    scale=number('Spray/scale',1,.01,10)
    shape=enabled(params.get('SprayShape/enabled','true'))
    shape_id=int(number('SprayShape/shape',0,0,4))
    image_shape=shape and shape_id==4
    image_size=None
    if not whole194 and image_shape and (params.get('CompositeOp','normal')!='normal' or enabled(params.get('Krita/erase'))):
        raise ValueError('Spray image shape combination is not supported')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    base_params=dict(params)
    if shape:
        width=number('SprayShape/width',6,1,10000);height=number('SprayShape/height',6,1,10000)
        if shape_id in (2,3):width=height=1
        if image_shape:
            from krita_spray_image import capture_spray_image
            base_params['brush_definition'],image_size=capture_spray_image(transformed,params.get('SprayShape/imageUrl',''),resolve_resource)
        else:
            definition=ET.Element('Brush',{'type':'auto_brush','spacing':'0.1','useAutoSpacing':'0','angle':'0'})
            ET.SubElement(definition,'MaskGenerator',{'diameter':str(max(width,height)),'type':'rect' if shape_id in (1,3) else 'circle','ratio':str(min(width,height)/max(width,height)),'id':'default','hfade':'1','vfade':'1','spikes':'2','antialiasEdges':'1'})
            base_params['brush_definition']=ET.tostring(definition,encoding='unicode')
    source_randomness=False
    source_curve_aa=False
    if not shape:
        definition=xml(base_params.get('brush_definition',''))
        source_randomness=numeric(definition.get('randomness'),0)!=0 or numeric(definition.get('density'),1)!=1
        # The common Auto-mask importer retains the existing functional74 law.
        # Each Spray particle receives its own captured placement identity.
        generator=definition.find('MaskGenerator')
        if not whole194 and generator is not None and generator.get('id')=='soft' and enabled(generator.get('antialiasEdges')):
            source_curve_aa=True;generator.set('antialiasEdges','0')
        base_params['brush_definition']=ET.tostring(definition,encoding='unicode')
    # Common bridge remains BuildUp; native Wash is admitted only after the
    # complete independent Spray descriptor exists, never via Pixel aliases.
    base_params['PaintOpAction']='1'
    for node in transformed.findall('param'):transformed.remove(node)
    for key,value in base_params.items():ET.SubElement(transformed,'param',{'name':key}).text=value or ''
    im=Image.open(io.BytesIO(data));im.load();info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(transformed,encoding='unicode'));output=io.BytesIO();im.save(output,format='PNG',pnginfo=info)
    result=preset(output.getvalue(),name,catalog,external,timed_input=True,_allow_texture_material=False)
    common_profile_revision=result['descriptor']['version']
    d=result['descriptor'];particle_size=result['sourceDefaults']['sizePx']
    if not shape:width=particle_size;height=particle_size/d['tip']['aspect']
    if image_shape:
        if 'color' not in d['tip'] or 'planes' not in d['tip']['color']:
            raise ValueError('Spray image shape requires canonical RGBA planes')
        from krita_spray_image import spray_image_bounds
        side=catalog.assets[d['tip']['mask']]['size']
        if any(catalog.assets[aid]['size']!=side for aid in d['tip']['color']['planes']):
            raise ValueError('Spray image colour/alpha storage mismatch')
        d['tip']['maskBounds']=spray_image_bounds(image_size,side)
    # The common painter normalises its long axis. Spray's independent physical
    # particle metrics below already include that conversion.
    d['tip']['aspect']=1
    behavior=d['behavior'];behavior.pop('scatter',None);d.pop('scatter',None)
    if not whole194 and image_shape and (d.get('texture') or d.get('paperInteraction') or behavior.get('erase') or behavior.get('dual') or behavior.get('taper') or behavior.get('edgeBleed') or behavior.get('wetMix') or behavior.get('rendering',{}).get('blendMode')!='normal'):
        raise ValueError('Spray image shape combination is not supported')
    spacing=number('Spray/spacing',.5,0,4)*.5
    d['spacing']=max(.000001,min(2,spacing));behavior['spacing']={'mode':'diameter','coefficient':spacing,'isotropic':True}
    behavior['rendering']['accumulation']='directOver'
    biased=enabled(params.get('Spray/radialDistributionCenterBiased','true'))
    radial=params.get('Spray/radialDistributionType') or ('gaussian' if enabled(params.get('Spray/gaussianDistribution')) else 'uniform')
    def curve_pdf(prefix,polar):
        repeat=int(number(prefix+'CurveRepeat',1,1,32));transfer=native_transfer(params.get(prefix+'Curve','0,0;1,1;'),4097)
        vals=[i/4096 for i in range(4097)] if isinstance(transfer,list) else transfer['samples']
        def f(x):
            u=(x*repeat)%1;at=min(len(vals)-2,int(u*(len(vals)-1)));v=vals[at]+(vals[at+1]-vals[at])*(u*(len(vals)-1)-at)
            return v*(2*x if polar else 1)
        return f
    upper=1
    if radial=='uniform':pdf=lambda x:1 if biased else 2*x
    elif radial=='gaussian':
        sigma=number('Spray/radialDistributionStdDeviation',.5,.001,2);upper=5*sigma
        pdf=lambda x:math.exp(-x*x/(2*sigma*sigma))*(1 if biased else 2*x)
    elif radial=='clusterBased':
        amount=number('Spray/radialDistributionClusteringAmount',0,-100,100)
        pdf=lambda x:2*x if amount==0 else 2*x*math.exp(-((x if amount>0 else 1-x)*abs(amount))**2/2)
    elif radial=='curveBased':pdf=curve_pdf('Spray/radialDistribution',True)
    else:raise ValueError('Unsupported Spray radial distribution')
    angular=params.get('Spray/angularDistributionType','uniform')
    if angular not in ('uniform','curveBased'):raise ValueError('Unsupported Spray angular distribution')
    active=enabled(params.get('ShapeDynamics/enabled',params.get('SprayShape/enabled','false')))
    prefix='ShapeDynamics/' if (params.get('ShapeDynamicsVersion','2.2')!='2.2' if whole194 else 'ShapeDynamicsVersion' in params) else 'SprayShape/'
    flag=lambda key:active and enabled(params.get(prefix+key))
    def angle_value(flag_key,key,default=0):return math.radians(number(prefix+key,default,-360,360)) if flag(flag_key) else 0
    color=enabled(params.get('ColorOption/useRandomHSV'))
    spray={'version':1,'diameter':diameter,'scale':scale,'aspect':number('Spray/aspect',1,.01,4),'angle':math.radians(number('Spray/rotation',0,-360,360)),
           'count':int(number('Spray/particleCount',12,0,1024)),'jitter':number('Spray/jitterMoveAmount',1,0,4) if enabled(params.get('Spray/jitterMovement')) else 0,
           'radial':{'maximum':upper,'samples':''.join(format(round(v/upper*65535),'04x') for v in inverse_cdf(pdf,upper))},'angular':''.join(format(round(v*65535),'04x') for v in inverse_cdf(curve_pdf('Spray/angularDistribution',False) if angular=='curveBased' else lambda x:1)),
           'particle':{'shape':('tip' if image_shape or not shape else ['ellipse','rectangle','bilinear','pixel'][shape_id]),'width':width,'height':height,'proportional':shape and enabled(params.get('SprayShape/proportional'))},
           'dynamics':{'randomSize':flag('randomSize'),'fixedAngle':angle_value('fixedRotation','fixedAngle'),'randomAngle':number(prefix+'randomRotationWeight',.5,0,1) if flag('randomRotation') else 0,'radialAngle':number(prefix+'followCursorWeigth',1,0,1) if flag('followCursor') else 0,'pathAngle':number(prefix+'followDrawingAngleWeigth',1,0,1) if flag('followDrawingAngle') else 0},
           'color':{'perParticle':enabled(params.get('ColorOption/colorPerParticle','true')),'hue':number('ColorOption/hue',0,-180,180)/180 if color else 0,'saturation':number('ColorOption/saturation',0,-100,100)/100 if color else 0,'value':number('ColorOption/value',0,-100,100)/100 if color else 0,'randomOpacity':enabled(params.get('ColorOption/useRandomOpacity'))}}
    if image_shape:spray['particle']['image']=True
    if enabled(params.get('Spray/useDensity')):spray['density']=number('Spray/coverage',.3,0,100)/100
    spray['color'].update(source_flags)
    if source_flags:
        if not whole194 and spray['particle']['shape']=='tip'and any(k in d['tip']for k in('profile','imageSampling','autoShape','autoNoise')):raise ValueError('Spray sampled source requires a round or bitmap particle tip')
        if not whole194 and (d.get('texture')or d.get('paperInteraction')or behavior.get('erase')):raise ValueError('Spray sampled source combination is not supported')
    if not whole194 and d['tip'].get('autoNoise') and (image_shape or source_flags or behavior.get('dual')):raise ValueError('Spray Auto-mask noise requires an independent procedural particle')
    d['spray']=spray;d['version']=max(76 if source_flags or image_shape else 43,96 if d['tip'].get('autoNoise') else 0)
    if params.get('PaintOpAction','1')=='2':
        from spray_wash133 import spray_wash133_scope
        d['version']=max(d['version'],133);behavior['rendering']['accumulation']='alphaDarken'
        if not spray_wash133_scope(d):raise ValueError('Spray Wash133 combination is outside the closed root scope')
    if source_flags.get('sampleInput') and not image_shape:
        # New imports opt in only after the complete closed root exists.
        # Other formerly supported combinations retain their historical policy.
        previous_version=d['version'];spray['color']['sourcePolicy']='canonical-begin-v1';d['version']=max(146,previous_version)
        if not spray_source146_scope(d):
            spray['color'].pop('sourcePolicy');d['version']=previous_version
    if not whole194 and d['tip'].get('profile',{}).get('kind')in('gaussian2D','curveRectangle','curveRectangleSoftness')and d['tip'].get('autoNoise'):
        # Do not lose common98 source-profile semantics through the legacy96 bridge.
        # Only this complete new consumer combination opts in; old96 remains literal.
        import copy
        from spray_rectangle_noise155 import spray_rectangle_noise155_scope
        candidate=copy.deepcopy(d);candidate['version']=max(155,common_profile_revision)
        if not spray_rectangle_noise155_scope(candidate):raise ValueError('Spray rectangle noise155 is outside the closed static root scope')
        d=candidate
    result['descriptor']=finalize_identity(d,data);result['sourceDefaults']['sizePx']=diameter
    note=compatibility('spray','Independent area/particle geometry, count/density (bounded4096 particles per dab), inverse-CDF distributions, particle dynamics and colour retained. Grafetto RNG, raster AA, image-pipe selection and colour rounding differ from native Krita.')
    result['compatibility']=[n for n in result['compatibility'] if n['feature']!='kritaEngine']+[note]
    if behavior['rendering']['accumulation']=='alphaDarken':result['compatibility'].append(compatibility('sprayWash','Particles OVER into one logical request image, then creamy alpha-darken into stroke-owned coverage; captured stroke opacity composites once. Bounded tile-region scratch preserves large clouds and image-pipe colours. Native ICC/RNG/U8 identity is not claimed.','approximate'))
    if image_shape:result['compatibility'].append(compatibility('sprayImageParticle','Captured resource RGB/alpha, independent particle dimensions, centred rotation and per-particle HSV/opacity retained. Native Qt initial resize and smooth transformed-image filtering differ from canonical GPU filtering.','approximate'))
    if image_shape and params.get('SprayShape/imageUrl','').lower().endswith('.svg'):result['compatibility'].append(compatibility('capturedSvgImage','Captured bounded SVG subset rasterized to explicit RGBA pixel dimensions with librsvg. Fonts/external images/filters/use are rejected; Qt SVG plugin/ICC/filtering byte identity is not claimed.'))
    if source_flags.get('sampleInput') and not image_shape and spray['color'].get('sourcePolicy') is None:result['compatibility'].append(compatibility('spraySourceTiming','Canvas colour is captured before each Spray request; native Krita reads the original layer at stroke start. Overlapping requests can differ.','approximate'))
    if spray['color'].get('sourcePolicy'):result['compatibility'].append(compatibility('spraySourceTiming','Canvas colour uses the verified canonical stroke-BEGIN layer with fixed source membership; request RNG, particle order and recorded background remain unchanged. Native ICC/concurrent-layer byte identity is not claimed.','approximate'))
    if d['version']==155:result['compatibility'].append(compatibility('sprayRectangleNoise','Static Gaussian2D or rectangular curve is evaluated per particle with the existing captured-seed full-grid D16/R8 attenuation/density law; native mutable RNG, scalar/SIMD and raster byte identity are qualified.','supported'))
    if source_curve_aa:result['compatibility'].append(compatibility('sprayCurveAA','Authored radial curve retained; native supersampled edge AA remains approximate.'))
    if source_randomness and not d['tip'].get('autoNoise'):result['compatibility'].append(compatibility('sprayTipRandomness','Authored tip profile retained; internal source-mask density/randomness is not reproduced.','unsupported'))
    result['warnings']=[n['feature']+': '+n['detail'] for n in result['compatibility'] if n['status']!='supported']
    return result
