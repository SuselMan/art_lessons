"""Static IMAGESTAMP raw-alpha Sketch point selector, not RGB deposition."""
import math

def sketch_image_alpha162_scope(d):
    if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<162 or d.get('model')!='stamp'or d.get('paperInteraction')!=0:return False
    if any(k in d for k in('mixer','spray','bristle','particle','curveTrace','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet')):return False
    t,b,s=d.get('tip'),d.get('behavior'),d.get('sketch')
    if not all(isinstance(x,dict)for x in(t,b,s)):return False
    if t.get('kind')!='bitmap'or t.get('aspect')!=1 or any(k in t for k in('color','animation','material','imageSampling','profile','autoNoise','autoShape')):return False
    if s.get('version')!=1 or s.get('mode')!='mask'or s.get('maskSignal')!='image-alpha-v1'or any(k not in('version','mode','maskSize','maskSignal','width','offset','probability','connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','distanceOpacityPolicy','antialias','dynamics')for k in s):return False
    dims=s.get('maskSize')
    if not isinstance(dims,list)or len(dims)!=2 or any(type(v)is not int or not 1<=v<=256 for v in dims):return False
    for key,lo,hi in [('width',.01,1000),('offset',-10,10),('probability',0,1)]:
        v=s.get(key)
        if type(v)not in(int,float)or not math.isfinite(v)or not lo<=v<=hi:return False
    if any(type(s.get(k))is not bool for k in('connect','magnetify','randomRGB','randomOpacity','distanceDensity','distanceOpacity','antialias')):return False
    if s['distanceOpacity'] and s.get('distanceOpacityPolicy')!='generic-clamp-v1'or not s['distanceOpacity']and 'distanceOpacityPolicy'in s:return False
    if 'dynamics'in s:
        if not isinstance(s['dynamics'],dict)or any(k not in('width','offset','probability')for k in s['dynamics']):return False
        from convert import validate_portable_dynamics
        try:
            for controls in s['dynamics'].values():validate_portable_dynamics(controls)
        except ValueError:return False
    if b.get('version')!=2 or any(k in b for k in('dual','timing','erase','wetMix','taper','mirror','edgeBleed','grain')):return False
    r=b.get('rendering')
    return isinstance(r,dict)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and r.get('accumulation')=='directOver'and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0 and not r.get('gammaCorrect')and not r.get('luminance')

def validate_sketch_image_alpha162(d,parent=None):
    if isinstance(d,dict)and isinstance(d.get('sketch'),dict)and 'maskSignal'in d['sketch']and d['sketch']['maskSignal']not in('procedural-standard-v1','gih-alpha-v1'):
        if parent is not None or not sketch_image_alpha162_scope(d):raise ValueError('Sketch162 requires closed root static IMAGESTAMP alpha selector')
