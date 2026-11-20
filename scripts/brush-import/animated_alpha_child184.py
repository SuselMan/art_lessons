"""Ordinary equal-frame independent animated alpha child, no alternate renderer."""
import re,copy
def animated_alpha_child184_scope(v):
 if not isinstance(v,dict)or type(v.get('version'))is not int or v['version']not in(184,185):return False
 b=v.get('behavior');dual=b.get('dual')if isinstance(b,dict)else None;c=dual.get('brush')if isinstance(dual,dict)else None;t=c.get('tip')if isinstance(c,dict)else None;a=t.get('animation')if isinstance(t,dict)else None
 if not isinstance(a,dict)or dual.get('blendMode')not in('multiply','subtract','darken','hardMixSofterPhotoshop','hardMixPhotoshopAlpha')or t.get('kind')!='bitmap'or 'imageSampling'in t or not(a.get('mode')=='random'if v['version']==185 else a.get('mode')in('constant','incremental','pressure'))or set(a)-{'mode','frames','rank'}:return False
 frames=a.get('frames')
 if not isinstance(frames,list)or not 2<=len(frames)<=256 or frames[0]!=t.get('mask')or any(not isinstance(x,str)or re.fullmatch(r'asset:[a-f0-9]{64}',x)is None for x in frames):return False
 if a['mode']=='pressure':
  if type(a.get('rank'))is not int or not 1<=a['rank']<=2147483647:return False
 elif 'rank'in a:return False
 from dual_mask168 import static_pixel_alpha_dual168_scope
 static=copy.deepcopy(v);static['behavior']['dual']['blendMode']='hardMixSofterPhotoshop';del static['behavior']['dual']['brush']['tip']['animation']
 return static_pixel_alpha_dual168_scope(static)
def validate_animated_alpha_child184(v,parent=None,asset_sizes=None):
 if not isinstance(v,dict)or v.get('version')not in(184,185):return
 if parent is not None or not animated_alpha_child184_scope(v):raise ValueError('Animated ALPHAMASK child184 requires closed root ordinary pair')
 if asset_sizes is not None:
  frames=v['behavior']['dual']['brush']['tip']['animation']['frames'];sides=[asset_sizes.get(x)for x in frames]
  if any(type(n)is not int or n<2 or n>512 or n&(n-1)for n in sides)or len(set(sides))!=1:raise ValueError('Animated ALPHAMASK child184 requires equal physical CAS sides<=512')
