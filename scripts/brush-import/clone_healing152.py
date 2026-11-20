def clone_healing152_scope(d):
    if not isinstance(d,dict):return False
    c=d.get('clone');b=d.get('behavior');t=d.get('tip')
    if not isinstance(c,dict)or not isinstance(b,dict)or not isinstance(t,dict):return False
    r=b.get('rendering')
    if set(c)!=({'version','moveSourcePoint','sourcePolicy','healing'}|({'source'}if 'source'in c else set()))or type(c.get('version'))is not int or c['version']!=1 or type(c.get('moveSourcePoint'))is not bool or c.get('healing')!='lab-ratio-v1'or c.get('sourcePolicy')!='canonical-begin-v1'or 'source'in c and c['source']!='projectionCanvas':return False
    if type(d.get('version'))is not int or d['version']<152 or d.get('model')!='stamp'or d.get('paperInteraction')!=0 or any(k in d for k in('mixer','scatter','texture','wet','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','mypaint','tangentNormal')):return False
    if t.get('kind')not in('round','bitmap','procedural')or any(k in t for k in('color','material','imageSampling','animation','autoNoise','autoShape')):return False
    if b.get('version')!=2 or set(b)-{'version','rendering','spacing','rotation','mirror','dynamics','modulations','strokeInput','speedInput','falloff','softness'}:return False
    if any(isinstance(b.get(k),dict)and any(h in b[k]for h in('hue','saturation','brightness','lightnessStrength'))for k in('dynamics','modulations')):return False
    return isinstance(r,dict)and r.get('mode')=='buildUp'and r.get('accumulation')=='directOver'and r.get('blendMode')=='normal'and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0 and not r.get('luminance')and not r.get('gammaCorrect')

def validate_clone_healing152(d,depth=0):
    c=d.get('clone')if isinstance(d,dict)else None
    if isinstance(c,dict)and 'healing'in c and(depth or not clone_healing152_scope(d)):raise ValueError('Healing152 requires closed root canonical BEGIN Lab ratio scope')
