def legacy_color_smudge_overlay154_scope(v):
    if not isinstance(v,dict)or not isinstance(v.get('mixer'),dict)or not isinstance(v.get('behavior'),dict)or not isinstance(v.get('tip'),dict):return False
    m=v['mixer'];b=v['behavior'];t=v['tip'];r=b.get('rendering')
    if type(v.get('version'))is not int or v['version']<154 or v.get('model')!='mixer'or v.get('paperInteraction')!=0 or any(k in v for k in('wet','texture','scatter','spray','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
    if m.get('source')!='previousCanvas'or m.get('colorRateComposite')!='overlay'or m.get('load')!=0 or m.get('initialLoad')!=0 or set(m)-{'load','pickup','strength','initialLoad','smearAlpha','source','pickupDynamics','sampling','foreground','colorRateComposite'}:return False
    if isinstance(m.get('foreground'),dict)and 'gradient'in m['foreground']:return False
    if 'sampling'in m and(not isinstance(m['sampling'],dict)or m['sampling'].get('mode')not in('adaptiveMean','uniformMean')):return False
    if t.get('kind')not in('round','bitmap','procedural')or any(k in t for k in('color','material','imageSampling','animation','autoNoise','autoShape')):return False
    if b.get('version')!=2 or set(b)-{'version','rendering','spacing','rotation','mirror','dynamics','modulations','strokeInput','speedInput','colorAdjustment','softness','falloff'}:return False
    return isinstance(r,dict)and r.get('mode')=='buildUp'and r.get('blendMode')=='normal'and 'accumulation'not in r and r.get('wetEdges',0)==0 and r.get('burntEdges',0)==0 and not r.get('gammaCorrect')and not r.get('luminance')

def validate_legacy_color_smudge_overlay154(v,depth=0):
    m=v.get('mixer')if isinstance(v,dict)else None
    if isinstance(m,dict)and m.get('colorRateComposite')=='overlay'and(depth or not legacy_color_smudge_overlay154_scope(v)):raise ValueError('Legacy foreground Overlay154 requires closed root previousCanvas scope')
