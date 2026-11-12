"""Exact188 recorded native pen controls; no replay pointer/device inference."""
def uses_recorded_pen188_controls(v):
 if isinstance(v,dict):return v.get('control')in('barrelRotation','tangentialPressure')or any(uses_recorded_pen188_controls(x)for key,x in v.items()if key!='dual')
 return isinstance(v,list)and any(uses_recorded_pen188_controls(x)for x in v)
def recorded_pen188_scope(d):
 if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']!=188 or d.get('model')!='stamp'or type(d.get('paperInteraction'))not in(int,float)or d['paperInteraction']!=0 or not isinstance(d.get('tip'),dict)or not isinstance(d.get('behavior'),dict)or not uses_recorded_pen188_controls(d['behavior']):return False
 if any(k in d for k in('mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
 tip=d['tip'];b=d['behavior'];r=b.get('rendering')
 if tip.get('kind')not in('round','procedural','bitmap')or any(k in tip for k in('animation','color','material','imageSampling','autoNoise','autoShape','alphaThreshold')):return False
 if 'profile'in tip and(not isinstance(tip['profile'],dict)or tip['profile'].get('kind')!='standard'or tip['profile'].get('shape')!='ellipse'):return False
 if set(b)-{'version','rendering','spacing','rotation','modulations','speedInput'}or not isinstance(r,dict)or set(r)-{'mode','accumulation','blendMode','wetEdges','burntEdges','burntEdgesMode','opacityCeiling'}or r.get('mode')!='buildUp'or r.get('accumulation')!='directOver'or r.get('blendMode')!='normal'or r.get('wetEdges',0)!=0 or r.get('burntEdges',0)!=0 or r.get('burntEdgesMode','multiply')!='multiply'or'opacityCeiling'in r and r['opacityCeiling']!='uniform':return False
 if 'speedInput'in b and b['speedInput']!={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}:return False
 def leaf(v,additive):return isinstance(v,dict)and not set(v)-{'control','minimum','jitter','curve'}and type(v.get('minimum'))in(int,float)and v['minimum']==0 and type(v.get('jitter'))in(int,float)and v['jitter']==0 and v.get('control')in(('barrelRotation',)if additive else('pressure','off','tangentialPressure'))
 def response(v):
  if not isinstance(v,dict):return False
  if 'combine'not in v:return leaf(v,False)
  c=v['combine'];return set(v)=={'control','minimum','jitter','combine'}and v['control']=='off'and v['minimum']==0 and v['jitter']==0 and isinstance(c,dict)and not set(c)-{'mode','scaling','additive','constant'}and c.get('mode')in('product','sum','max','min','difference')and isinstance(c.get('scaling'),list)and isinstance(c.get('additive'),list)and 1<=len(c['scaling'])+len(c['additive'])<=3 and all(leaf(x,False)for x in c['scaling'])and all(leaf(x,True)for x in c['additive'])and('constant'not in c or type(c['constant'])in(int,float)and 0<=c['constant']<=1)
 if 'spacing'in b and(not isinstance(b['spacing'],dict)or'dynamics'in b['spacing']):return False
 if 'modulations'in b and(not isinstance(b['modulations'],dict)or set(b['modulations'])-{'size','opacity'}or not all(isinstance(v,list)and 1<=len(v)<=3 and all(response(x)for x in v)for v in b['modulations'].values())):return False
 if 'rotation'in b:
  rot=b['rotation']
  if not isinstance(rot,dict)or set(rot)-{'follow','random','composition'}or rot.get('follow')!=0 or rot.get('random')!='none':return False
  if 'composition'in rot:
   c=rot['composition']
   if not isinstance(c,dict)or set(c)-{'strength','additive','scaling','scalingMode'}or not isinstance(c.get('additive'),list)or not all(leaf(x,True)for x in c['additive'])or'scaling'in c and(not isinstance(c['scaling'],list)or not all(leaf(x,False)for x in c['scaling'])):return False
 return True
def validate_recorded_pen188(d,depth=0):
 if (d.get('version')==188 or uses_recorded_pen188_controls(d.get('behavior')))and(depth or not recorded_pen188_scope(d)):raise ValueError('Recorded pen controls require closed root Pixel188')
