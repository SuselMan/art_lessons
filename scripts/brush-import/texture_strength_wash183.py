"""Checked deterministic Texture Strength with existing Lightness/Gradient Wash."""
def texture_strength183_control(v):
 def leaf(c):
  if not isinstance(c,dict)or not isinstance(c.get('control'),str)or c['control']not in('pressure','off','dabProgress','distance')or c.get('jitter')!=0 or any(k in c for k in('combine','randomSource','randomStream')):return False
  return True
 if not isinstance(v,dict):return False
 if 'combine'not in v:valid=leaf(v)
 else:
  c=v['combine'];valid=isinstance(c,dict)and isinstance(c.get('mode'),str)and c['mode']in('product','sum','max','min','difference')and not any(k in c for k in('policy','absolute'))and isinstance(c.get('scaling'),list)and 1<=len(c['scaling'])<=16 and all(leaf(a)for a in c['scaling'])and c.get('additive')==[]
 if not valid:return False
 from convert import validate_portable_dynamics
 try:validate_portable_dynamics([v])
 except(ValueError,TypeError,KeyError):return False
 return True

def uses_texture_strength183_control(c):return isinstance(c,dict)and(c.get('control')in('dabProgress','distance')or 'combine'in c)
def texture_strength183_required(v):
 b=v.get('behavior',{})if isinstance(v,dict)else{}
 if not isinstance(b,dict):return False
 ds=b.get('dynamics',{});ms=b.get('modulations',{})
 return any(uses_texture_strength183_control(c)for c in([ds['grainDepth']]if isinstance(ds,dict)and 'grainDepth'in ds else[])+(ms.get('grainDepth',[])if isinstance(ms,dict)and isinstance(ms.get('grainDepth',[]),list)else[]))
def texture_strength_wash183_scope(v):
 if not isinstance(v,dict)or type(v.get('version'))not in(int,float)or v['version']<183 or not texture_strength183_required(v):return False
 t=v.get('texture',{})
 if not isinstance(t,dict):return False
 m=t.get('material',{})
 if not isinstance(m,dict):return False
 if m.get('kind')not in('lightness','gradient'):return False
 from texture_lightness_wash171 import texture_lightness_wash171_scope
 return texture_lightness_wash171_scope({**v,'texture':{**t,'material':{**m,'kind':'lightness'}}})
