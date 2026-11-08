"""Bounded request-OVER -> stroke Wash133; no alternate source policy."""
import math,re

def _spray133_metadata(s):
    obj=lambda x:isinstance(x,dict)
    n=lambda v,lo,hi:type(v)in(int,float)and math.isfinite(v)and lo<=v<=hi
    def cdf(v):
        return isinstance(v,str)and re.fullmatch(r'[0-9a-f]{1028}',v)is not None and all(int(v[i:i+4],16)<=int(v[i+4:i+8],16)for i in range(0,1024,4))
    if not obj(s)or set(s)-{'version','diameter','scale','aspect','angle','count','density','jitter','radial','angular','particle','dynamics','color'}or type(s.get('version'))is not int or s.get('version')!=1:return False
    for k,lo,hi in(('diameter',.01,10000),('scale',.01,4),('aspect',.01,4),('angle',-math.pi*2,math.pi*2),('jitter',0,4)):
        if not n(s.get(k),lo,hi):return False
    if type(s.get('count'))is not int or not 0<=s['count']<=1024 or 'density'in s and not n(s['density'],0,1):return False
    r=s.get('radial')
    if not obj(r)or set(r)-{'maximum','samples'}or not n(r.get('maximum'),.001,10)or not cdf(r.get('samples'))or not cdf(s.get('angular')):return False
    p=s.get('particle');c=s.get('color');d=s.get('dynamics')
    if not obj(p)or set(p)-{'shape','width','height','proportional'}or p.get('shape')not in('ellipse','rectangle','pixel','bilinear','tip')or not n(p.get('width'),.01,10000)or not n(p.get('height'),.01,10000)or type(p.get('proportional'))is not bool:return False
    if not obj(d)or set(d)-{'randomSize','fixedAngle','randomAngle','radialAngle','pathAngle'}or type(d.get('randomSize'))is not bool or not n(d.get('fixedAngle'),-math.pi*2,math.pi*2)or any(not n(d.get(k),0,1)for k in('randomAngle','radialAngle','pathAngle')):return False
    return obj(c)and not set(c)-{'perParticle','hue','saturation','value','randomOpacity'}and all(type(c.get(k))is bool for k in('perParticle','randomOpacity'))and all(n(c.get(k),-1,1)for k in('hue','saturation','value'))

def spray_wash133_scope(d):
    if not isinstance(d,dict)or not all(isinstance(d.get(k),dict)for k in('spray','tip','behavior')):return False
    s,t,b=d['spray'],d['tip'],d['behavior'];r=b.get('rendering')
    if not _spray133_metadata(s):return False
    if d.get('model')!='stamp'or type(d.get('version'))is not int or d['version']<133 or type(d.get('paperInteraction'))not in(int,float)or d['paperInteraction']!=0 or type(d.get('flow'))not in(int,float)or d['flow']!=1 or not isinstance(d.get('flowByPressure'),list)or len(d['flowByPressure'])<2 or not all(isinstance(v,list)and len(v)==2 and type(v[0])in(int,float)and math.isfinite(v[0])and 0<=v[0]<=1 and type(v[1])in(int,float)and v[1]==1 for v in d['flowByPressure']):return False
    if any(k in d for k in('mixer','wet','texture','scatter','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
    if b.get('version')!=2 or b.get('erase')is True or any(k in b for k in('dual','taper','edgeBleed','wetMix','grain','colorAdjustment','sequentialRandom','strokeInput','clockRead'))or not isinstance(r,dict)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')!='alphaDarken'or type(r.get('wetEdges',0))not in(int,float)or r.get('wetEdges',0)!=0 or type(r.get('burntEdges',0))not in(int,float)or r.get('burntEdges',0)!=0:return False
    if any(isinstance(b.get(key),dict)and any(k in b[key]for k in('flow','hue','saturation','brightness'))for key in('dynamics','modulations')):return False
    if not isinstance(s.get('particle'),dict)or not isinstance(s.get('color'),dict)or 'image'in s['particle']or any(k in s['color']for k in('sampleInput','mixBackground','fillBackground')):return False
    if any(k in t for k in('color','material','imageSampling','autoShape','autoNoise','alphaThreshold'))or t.get('kind')not in('round','procedural','bitmap'):return False
    if 'profile'in t and(not isinstance(t['profile'],dict)or t['profile'].get('kind')!='standard'):return False
    if s['particle'].get('shape')=='tip'and(t.get('kind')!='bitmap'or 'profile'in t or not isinstance(t.get('mask'),str)):return False
    if 'animation'in t:
        a=t['animation']
        if s['particle'].get('shape')!='tip'or not isinstance(a,dict)or a.get('mode')not in('random','incremental')or set(a)-{'mode','frames'}or not isinstance(a.get('frames'),list)or not 2<=len(a['frames'])<=256 or not all(isinstance(v,str)for v in a['frames']):return False
    return True

def validate_spray_wash133(d,depth=0):
    if isinstance(d,dict)and 'spray'in d and isinstance(d.get('behavior'),dict)and isinstance(d['behavior'].get('rendering'),dict)and d['behavior']['rendering'].get('accumulation')=='alphaDarken':
        if depth or not spray_wash133_scope(d):raise ValueError('Spray Wash133 requires a closed root request/stroke owner')
