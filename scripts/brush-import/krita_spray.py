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
        value=j*total/256;i=max(1,min(samples,bisect.bisect_left(cdf,value)))
        fraction=(value-cdf[i-1])/(cdf[i]-cdf[i-1]) if cdf[i]>cdf[i-1] else 0
        out.append(xs[i-1]+fraction*(xs[i]-xs[i-1]))
    return out


def spray_preset(data,root,params,name,catalog,external):
    from krita_import import preset, enabled, numeric, xml, native_transfer
    def number(key,default,lo,hi):
        n=numeric(params.get(key),default)
        if not lo<=n<=hi:raise ValueError('Spray setting outside supported range: '+key)
        return n
    for option in ('sampleInputColor','mixBgColor','fillBackground'):
        if enabled(params.get('ColorOption/'+option)):raise ValueError('Spray '+option+' requires a canvas colour resource strategy')
    diameter=number('Spray/diameter',100,.01,10000)
    scale=number('Spray/scale',1,.01,4)
    shape=enabled(params.get('SprayShape/enabled','true'))
    shape_id=int(number('SprayShape/shape',0,0,4))
    # Native imageUrl is a filesystem path, not an embedded brush resource.
    if shape and shape_id==4:raise ValueError('Spray image shape requires an embedded portable image, not imageUrl')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    base_params=dict(params)
    if shape:
        width=number('SprayShape/width',6,1,10000);height=number('SprayShape/height',6,1,10000)
        if shape_id in (2,3):width=height=1
        definition=ET.Element('Brush',{'type':'auto_brush','spacing':'0.1','useAutoSpacing':'0','angle':'0'})
        ET.SubElement(definition,'MaskGenerator',{'diameter':str(max(width,height)),'type':'rect' if shape_id in (1,3) else 'circle','ratio':str(min(width,height)/max(width,height)),'id':'default','hfade':'1','vfade':'1','spikes':'2','antialiasEdges':'1'})
        base_params['brush_definition']=ET.tostring(definition,encoding='unicode')
    # Spray uses its own accumulation, not Pixel Wash/BuildUp selection.
    base_params['PaintOpAction']='1'
    for node in transformed.findall('param'):transformed.remove(node)
    for key,value in base_params.items():ET.SubElement(transformed,'param',{'name':key}).text=value or ''
    im=Image.open(io.BytesIO(data));im.load();info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(transformed,encoding='unicode'));output=io.BytesIO();im.save(output,format='PNG',pnginfo=info)
    result=preset(output.getvalue(),name,catalog,external,timed_input=True)
    d=result['descriptor'];particle_size=result['sourceDefaults']['sizePx']
    if not shape:width=particle_size;height=particle_size/d['tip']['aspect']
    # The common painter normalises its long axis. Spray's independent physical
    # particle metrics below already include that conversion.
    d['tip']['aspect']=1
    behavior=d['behavior'];behavior.pop('scatter',None);d.pop('scatter',None)
    spacing=number('Spray/spacing',.5,0,4)*.5
    d['spacing']=max(.000001,min(2,spacing));behavior['spacing']={'mode':'diameter','coefficient':spacing,'isotropic':True}
    behavior['rendering']['accumulation']='directOver'
    biased=enabled(params.get('Spray/radialDistributionCenterBiased','true'))
    radial=params.get('Spray/radialDistributionType') or ('gaussian' if enabled(params.get('Spray/gaussianDistribution')) else 'uniform')
    def curve_pdf(prefix,polar):
        repeat=int(number(prefix+'CurveRepeat',1,1,32));transfer=native_transfer(params.get(prefix+'Curve','0,0;1,1;'),4097)
        vals=transfer if isinstance(transfer,list) else transfer['samples']
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
    prefix='ShapeDynamics/' if 'ShapeDynamicsVersion' in params else 'SprayShape/'
    flag=lambda key:active and enabled(params.get(prefix+key))
    def angle_value(flag_key,key,default=0):return math.radians(number(prefix+key,default,-360,360)) if flag(flag_key) else 0
    color=enabled(params.get('ColorOption/useRandomHSV'))
    spray={'version':1,'diameter':diameter,'scale':scale,'aspect':number('Spray/aspect',1,.01,4),'angle':math.radians(number('Spray/rotation',0,-360,360)),
           'count':int(number('Spray/particleCount',12,0,1024)),'jitter':number('Spray/jitterMoveAmount',1,0,4) if enabled(params.get('Spray/jitterMovement')) else 0,
           'radial':{'maximum':upper,'samples':''.join(format(round(v/upper*65535),'04x') for v in inverse_cdf(pdf,upper))},'angular':''.join(format(round(v*65535),'04x') for v in inverse_cdf(curve_pdf('Spray/angularDistribution',False) if angular=='curveBased' else lambda x:1)),
           'particle':{'shape':(['ellipse','rectangle','bilinear','pixel'][shape_id] if shape else 'tip'),'width':width,'height':height,'proportional':shape and enabled(params.get('SprayShape/proportional'))},
           'dynamics':{'randomSize':flag('randomSize'),'fixedAngle':angle_value('fixedRotation','fixedAngle'),'randomAngle':number(prefix+'randomRotationWeight',.5,0,1) if flag('randomRotation') else 0,'radialAngle':number(prefix+'followCursorWeigth',1,0,1) if flag('followCursor') else 0,'pathAngle':number(prefix+'followDrawingAngleWeigth',1,0,1) if flag('followDrawingAngle') else 0},
           'color':{'perParticle':enabled(params.get('ColorOption/colorPerParticle','true')),'hue':number('ColorOption/hue',0,-180,180)/180 if color else 0,'saturation':number('ColorOption/saturation',0,-100,100)/100 if color else 0,'value':number('ColorOption/value',0,-100,100)/100 if color else 0,'randomOpacity':enabled(params.get('ColorOption/useRandomOpacity'))}}
    if enabled(params.get('Spray/useDensity')):spray['density']=number('Spray/coverage',.3,0,100)/100
    d['spray']=spray;d['version']=42
    result['descriptor']=finalize_identity(d,data);result['sourceDefaults']['sizePx']=diameter
    note=compatibility('spray','Independent area/particle geometry, count/density (bounded4096 particles per dab), inverse-CDF distributions, particle dynamics and colour retained. Grafetto RNG, raster AA, image-pipe selection and colour rounding differ from native Krita.')
    result['compatibility']=[n for n in result['compatibility'] if n['feature']!='kritaEngine']+[note]
    result['warnings']=[n['feature']+': '+n['detail'] for n in result['compatibility'] if n['status']!='supported']
    return result
