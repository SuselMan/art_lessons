"""Root static standard procedural mask selected Sketch, existing CPU U8 law."""
import math

def sketch_procedural173_scope(d):
    obj=lambda v:isinstance(v,dict)
    if not obj(d)or type(d.get('version'))not in(int,float)or not math.isfinite(d['version'])or int(d['version'])!=d['version']or d['version']<173 or d.get('model')!='stamp'or d.get('paperInteraction')!=0:return False
    if any(k in d for k in('mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet')):return False
    t,b,s=d.get('tip'),d.get('behavior'),d.get('sketch')
    if not all(obj(v)for v in(t,b,s)):return False
    p,r=t.get('profile'),b.get('rendering')
    if t.get('kind')!='procedural'or t.get('rotation')!='fixed'or t.get('hardness')!=1 or type(t.get('aspect'))not in(int,float)or not math.isfinite(t['aspect'])or not 1<=t['aspect']<=16 or any(k not in('kind','hardness','aspect','angle','rotation','profile')for k in t):return False
    if not obj(p)or p.get('kind')!='standard'or p.get('shape')not in('ellipse','rectangle')or type(p.get('antialias'))is not bool or any(k not in('kind','shape','horizontalFade','verticalFade','antialias')for k in p)or any(type(p.get(k))not in(int,float)or not math.isfinite(p[k])or not 0<=p[k]<=1 for k in('horizontalFade','verticalFade')):return False
    if s.get('version')!=1 or s.get('mode')!='mask'or s.get('maskSignal')!='procedural-standard-v1'or 'maskSize'in s or any(k not in('version','mode','maskSignal','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','distanceOpacityPolicy','antialias','dynamics')for k in s):return False
    if any(type(s.get(k))not in(int,float)or not math.isfinite(s[k])or not lo<=s[k]<=hi for k,lo,hi in [('width',.01,1000),('offset',-10,10),('probability',0,1)]):return False
    if any(type(s.get(k))is not bool for k in('connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias')):return False
    if s['distanceOpacity']and s.get('distanceOpacityPolicy')!='generic-clamp-v1'or not s['distanceOpacity']and 'distanceOpacityPolicy'in s:return False
    if b.get('version')!=2 or any(k not in('version','rendering','dynamics','modulations','speedInput','rotation')for k in b):return False
    def controls(v):
        return isinstance(v,list)and len(v)<=4 and all(obj(c)and c.get('control')in('pressure','off')and c.get('jitter')==0 and all(k in('control','minimum','jitter','curve')for k in c)for c in v)
    for table in(b.get('dynamics'),b.get('modulations')):
        if table is not None and(not obj(table)or any(k not in('size','opacity')or not controls(v if isinstance(v,list)else[v])for k,v in table.items())):return False
    if 'rotation'in b:
        q=b['rotation'];c=q.get('composition')if obj(q)else None
        if not obj(q)or any(k not in('follow','random','composition')for k in q)or q.get('follow')!=0 or q.get('random')!='none'or not obj(c)or any(k not in('strength','additive','scaling','scalingMode')for k in c)or type(c.get('strength'))not in(int,float)or not math.isfinite(c['strength'])or abs(c['strength'])>1 or c.get('additive')!=[]or not controls(c.get('scaling',[]))or c.get('scalingMode','product')!='product':return False
    def unit(c):
        curve=c.get('curve')
        values=[p[1]for p in curve if isinstance(p,list)and len(p)==2]if isinstance(curve,list)else curve.get('samples',[])if obj(curve)else[1]
        return all(type(v)in(int,float)and math.isfinite(v)and 0<=v<=1 for v in values)
    for table in(b.get('dynamics'),b.get('modulations')):
        if obj(table)and 'size'in table and not all(unit(c)for c in(table['size']if isinstance(table['size'],list)else[table['size']])):return False
    if 'dynamics'in s and(not obj(s['dynamics'])or any(k not in('width','offset','probability')or not controls(v)for k,v in s['dynamics'].items())):return False
    return obj(r)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='directOver'and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0 and not r.get('gammaCorrect')and not r.get('luminance')

def validate_sketch_procedural173(d,parent=None):
    if isinstance(d,dict)and isinstance(d.get('sketch'),dict)and d['sketch'].get('maskSignal')=='procedural-standard-v1':
        if parent is not None or not sketch_procedural173_scope(d):raise ValueError('Sketch173 requires closed root static standard procedural selector')
