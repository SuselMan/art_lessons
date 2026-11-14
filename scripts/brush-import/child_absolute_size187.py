"""Closed unlocked independent-child absolute Size; existing source wire/state only."""
import math

def obj(v):return isinstance(v,dict)
def num(v,lo,hi):return type(v)in(int,float)and math.isfinite(v)and lo<=v<=hi
def curve(v):
 if isinstance(v,list):return v==[[0,0],[1,1]] and all(type(x)in(int,float)for q in v for x in q)
 return(obj(v)and set(v)<={'kind','samples','endpointEpsilon','preserveInputSign'}and v.get('kind')=='uniform'and isinstance(v.get('samples'),list)and 2<=len(v['samples'])<=256 and all(num(x,0,1)for x in v['samples'])and('endpointEpsilon'not in v or num(v['endpointEpsilon'],0,.001))and('preserveInputSign'not in v or type(v['preserveInputSign'])is bool))
def ordinary(t):return(obj(t)and type(t.get('kind'))is str and t['kind']in('round','bitmap','procedural')and not any(k in t for k in('animation','color','material','imageSampling','autoNoise','autoShape'))and('profile'not in t or obj(t['profile'])and t['profile'].get('kind')=='standard'and type(t['profile'].get('shape'))is str and t['profile']['shape']in('ellipse','rectangle')))
def _child_absolute_size_control(d,locked):
 if not obj(d)or d.get('model')!='stamp'or not ordinary(d.get('tip'))or not obj(d.get('behavior')):return False
 b=d['behavior'];m=b.get('modulations')
 if set(b)-{'version','rendering','rotation','strokeInput','speedInput','spacing','modulations'}or not obj(m)or set(m)!={'size'}or not isinstance(m['size'],list)or len(m['size'])!=1:return False
 control=m['size'][0]
 if not obj(control)or set(control)!={'control','minimum','jitter','combine'}or control['control']!='off'or type(control['control'])is not str or type(control['minimum'])not in(int,float)or control['minimum']!=0 or type(control['jitter'])not in(int,float)or control['jitter']!=0:return False
 c=control['combine']
 if not obj(c)or set(c)-{'mode','scaling','additive','constant','absolute'}or c.get('mode')!='product'or not isinstance(c.get('scaling'),list)or len(c['scaling'])>1 or not isinstance(c.get('additive'),list)or c['additive']or'constant'in c and not num(c['constant'],0,1):return False
 for leaf in c['scaling']:
  if(not obj(leaf)or set(leaf)-{'control','minimum','jitter','curve'}or type(leaf.get('control'))is not str or leaf['control']not in('pressure','off')or not num(leaf.get('minimum'),0,1)or not num(leaf.get('jitter'),0,1)or leaf.get('jitter')!=0 or'curve'in leaf and not curve(leaf['curve'])):return False
 a=c.get('absolute')
 return(obj(a)and set(a)=={'locked','angleOffset','curve'}and a['locked']is locked and num(a['angleOffset'],-360,360)and curve(a['curve']))
def _independent_child_absolute_size_scope(d,version,locked):
 if not obj(d)or type(d.get('version'))is not int or d['version']!=version or d.get('model')!='stamp'or not ordinary(d.get('tip'))or not obj(d.get('behavior'))or not obj(d['behavior'].get('dual')):return False
 dual=d['behavior']['dual'];child=dual.get('brush')
 def component(x,root):
  if not obj(x)or type(x.get('version'))is not int or x['version']!=version or x.get('model')!='stamp'or not num(x.get('paperInteraction'),0,0) or not ordinary(x.get('tip'))or any(k in x for k in('mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))or not obj(x.get('behavior')):return False
  b=x['behavior'];r=b.get('rotation');i=b.get('strokeInput');render=b.get('rendering')
  if set(b)-({'version','rendering','rotation','strokeInput','speedInput','spacing'}|({'dual'}if root else{'modulations'}))or type(b.get('version'))is not int or b['version']!=2 or not obj(r)or set(r)!={'follow','random'}or type(r.get('follow'))not in(int,float)or r['follow']!=1 or r.get('random')!='none'or not obj(i)or set(i)!={'version','initialDirection'}or type(i.get('version'))is not int or i['version']!=1 or i.get('initialDirection')!='cursorHistory'or not obj(render)or render.get('mode')!='buildUp'or render.get('blendMode')!='normal'or render.get('accumulation')not in(('directOver',)if root else('directOver','alphaDarken'))or render.get('wetEdges',0)!=0 or render.get('burntEdges',0)!=0:return False
  return not(obj(b.get('spacing'))and b['spacing'].get('dynamics'))
 return dual.get('sampling')=='independent'and dual.get('blendMode')=='multiply'and component(d,True)and component(child,False)and _child_absolute_size_control(child,locked)

def child_absolute_size187_control(d):return _child_absolute_size_control(d,False)
def independent_child_absolute_size187_scope(d):return _independent_child_absolute_size_scope(d,187,False)
def locked_child_absolute_size189_control(d):return _child_absolute_size_control(d,True)
def locked_child_absolute_size189_scope(d):return _independent_child_absolute_size_scope(d,189,True)
