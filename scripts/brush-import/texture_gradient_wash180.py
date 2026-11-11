"""Gradient material before Wash: existing111 pixels/171 feedback; no new source."""
from texture_lightness_wash171 import texture_lightness_wash171_scope
import math

def texture_gradient_wash180_scope(v):
 if not isinstance(v,dict)or type(v.get('version'))not in(int,float)or not math.isfinite(v['version'])or v['version']!=math.trunc(v['version'])or v['version']<180:return False
 t=v.get('texture');m=t.get('material')if isinstance(t,dict)else None
 if not isinstance(m,dict)or m.get('kind')!='gradient':return False
 return texture_lightness_wash171_scope({**v,'texture':{**t,'material':{**m,'kind':'lightness'}}})

def validate_texture_gradient_wash180(v,parent=None):
 if not isinstance(v,dict):return
 t=v.get('texture');b=v.get('behavior');m=t.get('material')if isinstance(t,dict)else None;r=b.get('rendering')if isinstance(b,dict)else None
 if isinstance(m,dict)and m.get('kind')=='gradient'and isinstance(r,dict)and r.get('accumulation')=='alphaDarken'and(parent is not None or not texture_gradient_wash180_scope(v)):raise ValueError('Texture Gradient Wash180 requires closed root static MASK Pixel')
