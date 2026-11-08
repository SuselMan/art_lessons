"""Closed portable merged Clone opt-in. Historical Clone54 is untouched."""
def validate_clone_projection149(d,depth=0):
    c=d.get('clone')if isinstance(d,dict)else None
    if not isinstance(c,dict)or not('source'in c or 'sourcePolicy'in c):return
    b=d.get('behavior');t=d.get('tip');r=b.get('rendering')if isinstance(b,dict)else None
    if(depth or type(d.get('version'))is not int or d['version']<149 or set(c)!={'version','moveSourcePoint','source','sourcePolicy'}or type(c.get('version'))is not int or c['version']!=1 or type(c.get('moveSourcePoint'))is not bool or c.get('source')!='projectionCanvas'or c.get('sourcePolicy')!='canonical-begin-v1'
       or d.get('model')!='stamp'or type(d.get('paperInteraction'))not in(int,float)or d.get('paperInteraction')!=0 or any(k in d for k in('mixer','filter','deform','experiment','particle','grid','hatching','sketch','spray','bristle','curveTrace','scatter','texture','wet','mypaint','tangentNormal'))
       or not isinstance(t,dict)or any(k in t for k in('color','material','imageSampling','animation','autoNoise'))
       or not isinstance(b,dict)or b.get('version')!=2 or b.get('erase')is True or any(k in b for k in('dual','timing','wetMix','taper'))or not isinstance(r,dict)or r.get('accumulation')!='directOver'or r.get('blendMode')!='normal'or type(r.get('wetEdges'))not in(int,float)or r.get('wetEdges')!=0 or type(r.get('burntEdges'))not in(int,float)or r.get('burntEdges')!=0):
        raise ValueError('Merged Clone149 requires closed root canonical BEGIN projection scope')
