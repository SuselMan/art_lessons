import math
def legacy_color_smudge_arithmetic175_scope(v):
    if not isinstance(v,dict)or not isinstance(v.get('mixer'),dict)or not isinstance(v.get('behavior'),dict)or not isinstance(v.get('tip'),dict):return False
    m=v['mixer'];b=v['behavior'];t=v['tip'];r=b.get('rendering')
    def controls(x,depth=0):
        return depth<=12 and(all(controls(v,depth+1)for v in x)if isinstance(x,list)else ('control'not in x or isinstance(x['control'],str))and all(controls(v,depth+1)for v in x.values())if isinstance(x,dict)else True)
    if any(type(m.get(k))not in(int,float)or not math.isfinite(m[k])or not 0<=m[k]<=1 for k in('pickup','strength'))or not controls(b)or not controls(m):return False
    if type(v.get('version'))is not int or v['version']<175 or v.get('model')!='mixer'or v.get('paperInteraction')!=0 or any(k in v for k in('wet','texture','scatter','spray','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
    if (m.get('source')!='previousCanvas'and not(v['version']>=178 and m.get('source')=='projectionCanvas'and 'sampling'not in m))or m.get('colorRateComposite')not in('add','subtract')or m.get('load')!=0 or m.get('initialLoad')!=0 or set(m)-{'load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite'}:return False
    if 'smearAlpha'in m and type(m['smearAlpha'])is not bool:return False
    f=m.get('foreground')
    if f is not None and(not isinstance(f,dict)or set(f)-{'rate','dynamics'}or type(f.get('rate'))not in(int,float)or not math.isfinite(f['rate'])or not 0<=f['rate']<=1):return False
    if 'sampling'in m:return False
    if t.get('kind')not in('round','bitmap','procedural')or any(k in t for k in('color','material','imageSampling','animation','autoNoise','autoShape')):return False
    if b.get('version')!=2 or set(b)-{'version','rendering','spacing','rotation','mirror','dynamics','modulations','strokeInput','speedInput','colorAdjustment','softness','falloff'}:return False
    return isinstance(r,dict)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and 'accumulation'not in r and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0 and not r.get('gammaCorrect')and not r.get('luminance')

def validate_legacy_color_smudge_arithmetic175(v,depth=0):
    m=v.get('mixer')if isinstance(v,dict)else None
    if isinstance(m,dict)and m.get('colorRateComposite')in('add','subtract')and(depth or not legacy_color_smudge_arithmetic175_scope(v)):raise ValueError('Legacy foreground Arithmetic175 requires closed root previousCanvas scope')
