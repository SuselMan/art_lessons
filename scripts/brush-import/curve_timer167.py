"""Closed Curve host-QTimer input law; no rendering or clock implementation."""
import math
def curve_host_timer167_scope(d):
 if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<167 or d.get('model')!='stamp'or d.get('paperInteraction')!=0 or d.get('flow')!=1 or d.get('flowPer')!='stamp':return False
 if any(k in d for k in('mixer','spray','bristle','sketch','particle','hatching','grid','experiment','deform','filter','clone','mypaint','tangentNormal','scatter','texture','wet')):return False
 if d.get('tip')!={'kind':'round','aspect':1,'hardness':1,'rotation':'fixed','angle':0}:return False
 for key in('sizeByPressure','flowByPressure','opacityByPressure'):
  a=d.get(key)
  if not isinstance(a,list)or len(a)<2 or any(not isinstance(p,list)or len(p)!=2 or type(p[0])not in(int,float)or not math.isfinite(p[0])or not 0<=p[0]<=1 or type(p[1])not in(int,float)or p[1]!=1 for p in a):return False
 b=d.get('behavior');c=b.get('timing')if isinstance(b,dict)else None;r=b.get('rendering')if isinstance(b,dict)else None;q=d.get('curveTrace')
 if not isinstance(b,dict)or b.get('version')!=2 or set(b)-{'version','rendering','timing','speedInput'}or not isinstance(r,dict)or r.get('mode')!='buildUp'or r.get('blendMode')!='normal'or r.get('accumulation')!='directOver'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('gammaCorrect')or r.get('luminance'):return False
 if 'speedInput'in b and b['speedInput']!={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}:return False
 if not isinstance(q,dict)or set(q)!={'version','history','smoothing','connect','opacity'}or q.get('version')!=2 or type(q.get('history'))is not int or not 2<=q['history']<=128 or type(q.get('smoothing'))is not bool or type(q.get('connect'))is not bool or type(q.get('opacity'))not in(int,float)or not math.isfinite(q['opacity'])or not 0<=q['opacity']<=1:return False
 if not isinstance(c,dict)or set(c)!={'version','rate','ignoreDistanceSpacing'}or c.get('version')!=1 or c.get('ignoreDistanceSpacing')is not True or type(c.get('rate'))not in(int,float)or not math.isfinite(c['rate'])or not 0<c['rate']<=1000:return False
 interval=1000/c['rate'];return math.isfinite(interval)and interval<=320000000000 and abs(interval-round(interval))<1e-7
def validate_curve_timer167(d,parent=None):
 if isinstance(d,dict)and 'curveTrace'in d and isinstance(d.get('behavior'),dict)and 'timing'in d['behavior']and(parent is not None or not curve_host_timer167_scope(d)):raise ValueError('Curve167 requires closed root static host timer')
