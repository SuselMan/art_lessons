"""Closed portable policy: Krita legacy ignores paint_mode; no Surface2 claim."""
import math
from mypaint_import import SCHEMA

def validate_mypaint_legacy156(d,parent=None):
    if not isinstance(d,dict):return
    m=d.get('mypaint')
    if not isinstance(m,dict)or not('surfacePolicy'in m or d.get('version')==156):return
    def fail():raise ValueError('Invalid Krita legacy MyPaint156 policy')
    if parent is not None or type(d.get('version'))is not int or d['version']!=156 or m.get('surfacePolicy')!='krita-legacy-v1' or set(m)!={'version','kernel','surfacePolicy','settings','baseRadius','erase'}or type(m.get('version'))is not int or m.get('version')!=1 or m.get('kernel')!='libmypaint-1.6.1' or type(m.get('erase'))is not bool:fail()
    radius=m.get('baseRadius')
    if type(radius)not in(int,float)or not math.isfinite(radius)or not 0<radius<=800:fail()
    b=d.get('behavior')
    if d.get('model')!='stamp'or type(d.get('paperInteraction'))not in(int,float)or d.get('paperInteraction')!=0 or any(k in d for k in('mixer','clone','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet'))or not isinstance(b,dict)or type(b.get('version'))is not int or b.get('version')!=2 or any(k in b for k in('dual','wetMix','taper')):fail()
    timing=b.get('timing')
    if timing is not None and timing!={'version':1,'rate':60,'ignoreDistanceSpacing':False}:fail()
    settings=m.get('settings')
    if not isinstance(settings,list)or len(settings)>64:fail()
    ids=set();total=0
    for s in settings:
        if not isinstance(s,dict)or set(s)!={'id','base','inputs'}or type(s['id'])is not int or not 0<=s['id']<len(SCHEMA['settings'])or s['id']in ids:fail()
        ids.add(s['id']);meta=SCHEMA['settings'][s['id']];value=s['base'];inputs=s['inputs']
        if type(value)not in(int,float)or not math.isfinite(value)or not meta['min']<=value<=meta['max']or not isinstance(inputs,list)or len(inputs)>len(SCHEMA['inputs']):fail()
        seen=set()
        for i in inputs:
            if not isinstance(i,dict)or set(i)!={'id','points'}or type(i['id'])is not int or not 0<=i['id']<len(SCHEMA['inputs'])or i['id']in seen or meta['constant']:fail()
            seen.add(i['id']);points=i['points']
            if not isinstance(points,list)or len(points)==1 or len(points)>64:fail()
            previous=-math.inf
            for point in points:
                if not isinstance(point,list)or len(point)!=2 or any(type(v)not in(int,float)or not math.isfinite(v)or abs(v)>1e6 for v in point)or point[0]<previous:fail()
                previous=point[0];total+=1
    if total>4096:fail()
