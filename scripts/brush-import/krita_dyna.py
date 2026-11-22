"""Bounded legacy DynaDraw circles; reject unknown paint actions explicitly."""
import io,math
from pathlib import PurePosixPath
from PIL import Image
from brush_contract import descriptor,finalize_identity,compatibility
from native_timing195 import clock_enabled

def dyna_preset(data,root,params,name,catalog,external):
    from krita_import import enabled,preset_preview
    if params.get('CompositeOp','normal')!='normal' or enabled(params.get('EraserMode')) or enabled(params.get('Krita/erase')) or any(clock_enabled(params,k)for k in ('AirbrushOption/isAirbrushing','PaintOpSettings/isAirbrushing')):raise ValueError('DynaDraw composition or timer is unsupported')
    def number(key,default):
        try:return float(params.get(key,default))
        except (ValueError,TypeError,OverflowError):raise ValueError('Invalid DynaDraw value: '+key)from None
    if params.get('PaintOpAction') != '1':raise ValueError('DynaDraw Wash or unrecognized painting mode is unsupported')
    if number('Dyna/action',0)!=0 or enabled(params.get('Dyna/enableLine')) or enabled(params.get('Dyna/useTwoCircles')):raise ValueError('DynaDraw supports single-circle action only')
    mass=number('Dyna/mass',0);drag=number('Dyna/drag',0);diameter=number('Dyna/diameter',3)
    if not all(math.isfinite(v) for v in (mass,drag,diameter)) or not 0<=mass<=1 or not 0<=drag<=1 or int(diameter)!=diameter or not 3<=diameter<=32:raise ValueError('DynaDraw values outside bounded range')
    d=descriptor(data,'');d.update(version=210,model='stamp',category='paint',paperInteraction=0,spacing=.2,flow=1,opacity=1,tip={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0},dyna={'version':1,'mass':mass,'drag':drag,'diameter':int(diameter)},behavior={'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}})
    note=compatibility('dynaDraw','Legacy damped cursor and velocity-sized polygon circles are retained; host input subdivision, edge antialiasing and Wash compositing may differ from Krita 3.')
    im=Image.open(io.BytesIO(data));im.load()
    return {'descriptor':finalize_identity(d,data),'name':root.get('name')or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'preview':preset_preview(im),'sourceDefaults':{'sizePx':int(diameter),'opacity':1,'flow':1},'compatibility':[note],'warnings':[note['feature']+': '+note['detail']]}
