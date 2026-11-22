"""MyPaint JSON is retained as native base values and sensor mappings."""
import json,math,io
from pathlib import Path
from PIL import Image
from brush_contract import finalize_identity,compatibility
SCHEMA=json.loads(Path(__file__).with_name('mypaint_schema.json').read_text())
SETTINGS={x['name']:x for x in SCHEMA['settings']};INPUTS={name:i for i,name in enumerate(SCHEMA['inputs'])}

def mypaint_preset(data,name,catalog,preview=None,erase=False,*,surface_policy=None):
    if len(data)>2*1024*1024:raise ValueError('MyPaint preset too large')
    doc=json.loads(data)
    if not isinstance(doc,dict)or doc.get('version')!=3 or not isinstance(doc.get('settings'),dict):raise ValueError('Expected MyPaint version3 settings')
    if surface_policy not in(None,'krita-legacy-v1'):raise ValueError('Unknown MyPaint surface policy')
    values=[];total=0;ignored_paint=False;ignored_lock_alpha=False
    for key,setting in doc['settings'].items():
        if key not in SETTINGS:raise ValueError('Unknown MyPaint setting: '+key)
        meta=SETTINGS[key];base=setting.get('base_value');inputs=setting.get('inputs')
        if type(base)not in(int,float)or not math.isfinite(base)or not meta['min']<=base<=meta['max']or not isinstance(inputs,dict):raise ValueError('Invalid MyPaint setting: '+key)
        if key=='paint_mode'and(base!=0 or inputs):
            if surface_policy!='krita-legacy-v1':raise ValueError('Unsupported MyPaint mode: '+key)
            ignored_paint=True
        mappings=[]
        for control,points in inputs.items():
            if control not in INPUTS or meta['constant']or not isinstance(points,list)or not(len(points)==0 or 2<=len(points)<=64):raise ValueError('Invalid MyPaint sensor: '+control)
            previous=-math.inf
            for p in points:
                if not isinstance(p,list)or len(p)!=2 or any(type(v)not in(int,float)or not math.isfinite(v)or abs(v)>1e6 for v in p)or p[0]<previous:raise ValueError('Invalid MyPaint mapping')
                previous=p[0];total+=1
            mappings.append({'id':INPUTS[control],'points':points})
        # Krita's MyPaint surface ignores lock_alpha, including its mappings.
        # Validate it fully before omitting it; standalone MyPaint keeps it.
        if key=='lock_alpha' and surface_policy=='krita-legacy-v1' and (base!=0 or any(m['points'] for m in mappings)):
            ignored_lock_alpha=True
        else:
            values.append({'id':meta['id'],'base':base,'inputs':mappings})
    if total>4096:raise ValueError('MyPaint sensor budget exceeded')
    radius=math.exp(doc['settings'].get('radius_logarithmic',{}).get('base_value',SETTINGS['radius_logarithmic']['default']))
    if not .0<radius<=800:raise ValueError('MyPaint base radius outside supported range')
    d={'id':'pending','version':55,'model':'stamp','category':'paint','tip':{'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0},'paperInteraction':0,'spacing':.1,'flow':1,'flowPer':'stamp','sizeByPressure':[[0,1],[1,1]],'flowByPressure':[[0,1],[1,1]],'opacityByPressure':[[0,1],[1,1]],'pressureSmoothingPx':0,'opacity':1,'behavior':{'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}},'mypaint':{'version':1,'kernel':'libmypaint-1.6.1','settings':values,'baseRadius':radius,'erase':erase}}
    if ignored_paint:
        d['version']=156;d['mypaint']['surfacePolicy']='krita-legacy-v1'
    from krita_import import preset_preview
    rate=doc['settings'].get('dabs_per_second',{})
    if rate.get('base_value',0)>0 or rate.get('inputs'):
        d['behavior']['timing']={'version':1,'rate':60,'ignoreDistanceSpacing':False}
    if preview is not None:
        im=Image.open(io.BytesIO(preview));im.load();thumbnail=preset_preview(im)
    else:thumbnail=preset_preview(Image.new('RGBA',(64,64),(0,0,0,0)))
    note=compatibility('mypaint','Original libmypaint1.6.1 WASM dynamics and64px Q15 tiled renderer. Contact inputs, time, seeds and endpoint recorded; canvas commits quantized per input, not per network packet. No Qt/GLib. Native Krita uses a different surface and colour-space rounding. Dwell sampled at60Hz; pigment paint_mode rejected; legacy blending/smudging retained.')
    if ignored_paint:note=compatibility('mypaintKritaLegacy156','Embedded Krita MyPaint uses the legacy stroke/surface API. Captured paint_mode bases and sensor mappings are preserved but native-ignored; this does not enable spectral pigment blending or standalone MyPaint2 semantics.','approximate')
    notes=[note]
    if ignored_lock_alpha:
        notes.append(compatibility('mypaintLockAlpha','Krita MyPaint surface ignores lock_alpha and its mappings; this does not imply identical surface blending.','supported'))
    return {'source':Path(name).name,'name':Path(name).stem,'sourceDefaults':{'sizePx':radius*2,'opacity':1,'flow':1},'descriptor':finalize_identity(d,data),'preview':thumbnail,'compatibility':notes,'warnings':[n['feature']+': '+n['detail'] for n in notes if n['status']!='supported']}
