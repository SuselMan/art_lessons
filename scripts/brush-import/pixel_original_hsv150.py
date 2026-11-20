import re

def pixel_original_hsv150_scope(v):
    if not isinstance(v,dict) or not isinstance(v.get('tip'),dict) or not isinstance(v.get('behavior'),dict):return False
    t=v['tip'];b=v['behavior'];c=t.get('color');r=b.get('rendering')
    return (type(v.get('version')) is int and v['version']>=150 and v.get('model')=='stamp' and v.get('paperInteraction')==0
        and not any(k in v for k in ('mixer','wet','texture','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal'))
        and t.get('kind')=='bitmap' and isinstance(t.get('mask'),str) and not set(t)-{'kind','mask','maskBounds','hardness','aspect','rotation','angle','color'}
        and isinstance(c,dict) and c.get('adjustmentPolicy')=='native-image-stamp-v1' and not set(c)-{'planes','adjustmentPolicy'} and isinstance(c.get('planes'),list) and len(c['planes'])==3 and all(isinstance(x,str) and re.fullmatch(r'asset:[a-f0-9]{64}',x) for x in c['planes'])
        and b.get('version')==2 and not set(b)-{'version','rendering','spacing','rotation','mirror','modulations','dynamics','strokeInput','speedInput','colorAdjustment'}
        and isinstance(b.get('colorAdjustment'),dict) and bool(b['colorAdjustment']) and not set(b['colorAdjustment'])-{'hue','saturation','value'}
        and all(k not in b or isinstance(b[k],dict) and not any(h in b[k] for h in ('hue','saturation','brightness')) for k in ('dynamics','modulations'))
        and isinstance(r,dict) and r.get('mode')=='buildUp' and r.get('accumulation')=='directOver' and r.get('blendMode')=='normal' and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0 and not r.get('gammaCorrect') and not r.get('luminance'))

def validate_pixel_original_hsv150(v,depth=0):
    t=v.get('tip',{});c=t.get('color') if isinstance(t,dict) else None
    from pixel_original_dual151 import pixel_original_dual151_scope
    if isinstance(c,dict) and 'adjustmentPolicy'in c and (depth or not(pixel_original_hsv150_scope(v)or pixel_original_dual151_scope(v))):
        raise ValueError('Invalid native IMAGESTAMP150 policy')
