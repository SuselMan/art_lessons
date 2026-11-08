"""Revision86 original GIH geometry; no pixel rescale or implicit render fallback."""
import math

def frame_bounds(width,height,side):
    if type(side)is not int or not 2<=side<=2048 or side&(side-1) or any(type(n)not in(int,float)or not 1<=n<=side or not math.isfinite(n)or n!=int(n)for n in(width,height)):
        raise ValueError('Invalid variable GIH original dimensions')
    longest=max(width,height)
    bounds={'x':((side-width)//2+(width-longest)/2)/side,'y':((side-height)//2+(height-longest)/2)/side,'width':longest/side,'height':longest/side}
    if bounds['x']<0 or bounds['y']<0:raise ValueError('Variable GIH original requires additional padding')
    return bounds

def same_bounds(actual,expected):
    return isinstance(actual,dict) and set(actual)==set(expected) and all(type(actual[k])in(int,float) and math.isfinite(actual[k]) and actual[k]==v and not(v==0 and math.copysign(1,actual[k])<0) for k,v in expected.items())

def validate_variable_gih_descriptor(d,asset_sizes):
    tip=d.get('tip',{});animation=tip.get('animation',{});b=d.get('behavior',{})
    dual=b.get('dual',{});child=dual.get('brush',{})if isinstance(dual,dict)else{}
    child_tip=child.get('tip',{})if isinstance(child,dict)else{}
    child_animation=child_tip.get('animation',{})if isinstance(child_tip,dict)else{}
    if isinstance(child_animation,dict)and 'geometry'in child_animation:raise ValueError('Variable GIH child is unsupported')
    if not isinstance(animation,dict)or 'geometry'not in animation:return
    if any(k in b and not isinstance(b[k],dict)for k in('rendering','dynamics','modulations')):raise ValueError('Invalid variable GIH behavior')
    g=animation['geometry'];frames=animation.get('frames')
    if animation.get('mode')in('angular','xtilt','ytilt','dimensions'):
        scatter=d.get('scatter',{})
        if d.get('version',0)<118 or not isinstance(scatter,dict)or scatter.get('radius',0)>0 or any(k in tip for k in('color','material','imageSampling','profile','autoNoise','autoShape')):raise ValueError('Sensor GIH original geometry requires118 alpha without positional scatter')
    if type(d.get('version'))is not int or d['version']<86 or d.get('model')!='stamp' or any(k in d for k in('mixer','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')) or tip.get('kind')!='bitmap' or any(k in tip for k in('profile','autoNoise','autoShape','imageSampling','material')) or any(k in b for k in('dual','edgeBleed','colorAdjustment')) or b.get('rendering',{}).get('wetEdges') or any('sharpness'in b.get(k,{}) for k in('dynamics','modulations')):
        raise ValueError('Unsupported variable GIH geometry combination')
    if not isinstance(g,dict) or set(g)!={'version','frames'} or type(g['version'])is not int or g['version']!=1 or not isinstance(frames,list) or not 2<=len(frames)<=256 or any(not isinstance(a,str)or a not in asset_sizes for a in frames) or not isinstance(g['frames'],list) or len(g['frames'])!=len(frames):
        raise ValueError('Invalid variable GIH geometry inventory')
    for index,row in enumerate(g['frames']):
        if not isinstance(row,dict) or set(row)!={'sourceWidth','sourceHeight','maskBounds'}:raise ValueError('Invalid variable GIH geometry fields')
        side=asset_sizes.get(frames[index],0);expected=frame_bounds(row['sourceWidth'],row['sourceHeight'],side)
        if not same_bounds(row['maskBounds'],expected):raise ValueError('Variable GIH geometry differs from original padding')
        if index==0 and not same_bounds(tip.get('maskBounds'),expected):raise ValueError('Variable GIH reference bounds differ')
    if 'color'in tip:
        c=tip['color']
        if not isinstance(c,dict)or set(c)!={'planes','frames'} or not isinstance(c['frames'],list)or len(c['frames'])!=len(frames)or c['frames'][0]!=c['planes']:raise ValueError('Variable GIH colour frames are unsupported or incomplete')
        for index,planes in enumerate(c['frames']):
            if not isinstance(planes,list)or len(planes)!=3 or any(not isinstance(a,str)or asset_sizes.get(a)!=asset_sizes.get(frames[index])for a in planes):raise ValueError('Variable GIH colour plane dimensions differ')
