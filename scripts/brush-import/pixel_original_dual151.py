from pixel_original_hsv150 import pixel_original_hsv150_scope

def pixel_original_dual151_scope(v):
    if not isinstance(v,dict)or not isinstance(v.get('tip'),dict)or not isinstance(v.get('behavior'),dict):return False
    t=v['tip'];b=v['behavior'];d=b.get('dual');c=t.get('color')
    if not isinstance(c,dict)or not isinstance(d,dict)or not isinstance(d.get('brush'),dict):return False
    child=d['brush'];ct=child.get('tip');cb=child.get('behavior')
    if not isinstance(ct,dict)or not isinstance(cb,dict):return False
    families=('mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')
    keys={'version','rendering','spacing','rotation','mirror','modulations','dynamics','strokeInput','speedInput','colorAdjustment','dual'}
    def ordinary(x,mask=False):
        q=x.get('rendering');return x.get('version')==2 and isinstance(q,dict)and q.get('mode')=='buildUp'and (q.get('accumulation')=='directOver'or mask and q.get('accumulation')=='alphaDarken')and q.get('blendMode')=='normal'and q.get('wetEdges',0)==0 and q.get('burntEdges',0)==0 and not q.get('gammaCorrect')and not q.get('luminance')
    import re
    if type(v.get('version'))is not int or v['version']<151 or v.get('model')!='stamp'or v.get('paperInteraction')!=0 or any(k in v for k in families)or t.get('kind')!='bitmap'or not isinstance(t.get('mask'),str)or set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle','color'}or not isinstance(c.get('planes'),list)or len(c['planes'])!=3 or not all(isinstance(x,str)and re.fullmatch(r'asset:[a-f0-9]{64}',x)for x in c['planes'])or set(c)-{'planes','adjustmentPolicy'}or set(b)-keys or not ordinary(b):return False
    if 'adjustmentPolicy'in c or 'colorAdjustment'in b:
        if not pixel_original_hsv150_scope({**v,'behavior':{k:x for k,x in b.items()if k!='dual'}}):return False
    if any(isinstance(b.get(k),dict)and any(h in b[k]for h in('hue','saturation','brightness'))for k in('dynamics','modulations')):return False
    if d.get('sampling')!='independent'or d.get('blendMode')not in('multiply','subtract','darken')or set(d)-{'brush','sampling','blendMode'}:return False
    if child.get('model')!='stamp'or child.get('paperInteraction')!=0 or any(k in child for k in families)or set(cb)-(keys-{'dual','colorAdjustment'})or not ordinary(cb,True):return False
    if any(isinstance(cb.get(k),dict)and any(h in cb[k]for h in('hue','saturation','brightness'))for k in('dynamics','modulations')):return False
    si=cb.get('strokeInput')
    if isinstance(si,dict)and(si.get('version')!=1 or si.get('initialDirection')!='cursorHistory'or 'fanCorners'in si):return False
    if ct.get('kind')=='bitmap':return isinstance(ct.get('mask'),str)and not set(ct)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle','imageSampling'}
    if ct.get('kind')=='round':return 'profile'not in ct and not set(ct)-{'kind','hardness','aspect','rotation','angle'}
    profile=ct.get('profile')
    return ct.get('kind')=='procedural'and isinstance(profile,dict)and profile.get('kind')=='standard'and profile.get('shape')=='ellipse'and not set(ct)-{'kind','hardness','aspect','rotation','angle','profile'}

def validate_pixel_original_dual151(v,depth=0):
    t=v.get('tip',{});b=v.get('behavior',{})
    if isinstance(t,dict)and isinstance(t.get('color'),dict)and 'planes'in t['color']and isinstance(b,dict)and 'dual'in b and(depth or not pixel_original_dual151_scope(v)):
        raise ValueError('Invalid original RGBA ALPHAMASK151 pair')
