"""Native no-strength Hard Mix Photoshop ALPHA, root ordinary pair only."""
import math
from dual_mask168 import pixel_alpha_dual168_scope

def pixel_alpha_dual170_scope(v):
 if not isinstance(v,dict):return False
 version=v.get('version');b=v.get('behavior');dual=b.get('dual')if isinstance(b,dict)else None
 if isinstance(version,bool)or not isinstance(version,(int,float))or not math.isfinite(version)or version<170 or version!=int(version)or not isinstance(dual,dict)or dual.get('blendMode')!='hardMixPhotoshopAlpha':return False
 return pixel_alpha_dual168_scope({**v,'version':int(version),'behavior':{**b,'dual':{**dual,'blendMode':'hardMixSofterPhotoshop'}}})

def validate_pixel_alpha_dual170(v,parent=None):
 b=v.get('behavior')if isinstance(v,dict)else None;dual=b.get('dual')if isinstance(b,dict)else None
 if isinstance(dual,dict)and dual.get('blendMode')=='hardMixPhotoshopAlpha'and(parent is not None or not pixel_alpha_dual170_scope(v)):raise ValueError('Pixel alpha dual170 requires closed root ordinary mask components')
