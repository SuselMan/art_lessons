"""Self-authored genuine KPP corpus for native host roles (not native pixels).

Every case is an original native settings document, imported through the public
convert_krita entry. There are no descriptor/version substitutions or stock art.
"""
import base64,io,json,struct,xml.etree.ElementTree as ET,zipfile
from native_mask190 import png_preset
from PIL import Image

TIP='<Brush type="auto_brush" spacing=".2"><MaskGenerator id="default" type="circle" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>'


def corpus195():
    families=('paintbrush','roundmarker','colorsmudge','spraybrush','sketchbrush','hairybrush','curvebrush','hatchingbrush','gridbrush','particlebrush','experimentbrush','deformbrush','filter','duplicate','mypaintbrush','tangentnormal')
    def document(engine,extra):
        values={'CompositeOp':'copy'if engine in('filter','deformbrush')else'normal','PaintOpAction':'1','PressureSize':'false','SizeUseCurve':'false','Sketch/simpleMode':'true','PaintOpSettings/isAirbrushing':'true','brush_definition':TIP}
        values.update(extra)
        root=ET.Element('Preset',name='Original native195 '+engine,paintopid=engine)
        resources={}
        if engine=='roundmarker':
            for key in('PaintOpAction','Sketch/simpleMode','brush_definition'):values.pop(key,None)
        if engine=='hairybrush':
            resources['hair.gbr']=struct.pack('>7I',33,2,4,4,1,0x47494d50,25)+b'hair\0'+bytes([255]*16)
            values['brush_definition']='<Brush type="gbr_brush" filename="hair.gbr" scale="1" ColorAsMask="1"/>'
        if engine=='filter':values.update({'Filter/id':'invert','Filter/smudgeMode':'true'})
        if engine=='mypaintbrush':values['MyPaint/json']=json.dumps({'version':3,'settings':{'radius_logarithmic':{'base_value':2,'inputs':{}},'dabs_per_second':{'base_value':30,'inputs':{}}}})
        for k,v in values.items():ET.SubElement(root,'param',name=k).text=str(v)
        if resources:
            node=ET.SubElement(root,'resources')
            for name,data in resources.items():ET.SubElement(node,'resource',filename=name,type='brushes').text=base64.b64encode(data).decode()
        return png_preset(root)
    rows=[]
    def add(label,engine,values=None):rows.append((label,engine,document(engine,values or{})))
    for engine in families:add('host-default-'+engine,engine)
    add('smudge-modern','colorsmudge',{'SmudgeRateUseNewEngine':'true'})
    add('host-rate-zero','deformbrush',{'PaintOpSettings/rate':'0'})
    add('host-rate-max','particlebrush',{'PaintOpSettings/rate':'1000'})
    add('distance-disabled','deformbrush',{'PaintOpSettings/rate':'20','PaintOpSettings/ignoreSpacing':'true'})
    add('spacing-refresh','filter',{'PaintOpSettings/updateSpacingBetweenDabs':'true','PressureSize':'true','SizeUseCurve':'true','SizeSensor':'<params id="fuzzy"><curve>0,0;1,1;</curve></params>'})
    for sensor in('pressure','fuzzy','fuzzystroke','xtilt','declination','time','speed','distance','rotation','tangentialpressure'):
        add('rate-'+sensor,'deformbrush',{'PressureRate':'true','RateValue':'.7','RateSensor':'<params id="'+sensor+'" duration="30" length="100"><curve>0,0;1,1;</curve></params>'})
    add('rate-off-constant','particlebrush',{'PressureRate':'true','RateValue':'.25','RateUseCurve':'false'})
    add('rate-compound','sketchbrush',{'PressureRate':'true','RateValue':'.6','RateUseSameCurve':'false','RatecurveMode':'1','RateSensor':'<params id="sensorslist"><ChildSensor id="pressure"><curve>0,0;1,1;</curve></ChildSensor><ChildSensor id="fuzzy"><curve>0,0;1,1;</curve></ChildSensor></params>'})
    add('mypaint-ignored-rate','mypaintbrush',{'PressureRate':'true','RateSensor':'<params id="unknown"/>'})
    for pressure in('false','true'):
        # Native source dimensions1x1, independent of runtime pressure scale.
        tip='<Brush type="auto_brush" spacing=".1"><MaskGenerator id="default" type="circle" diameter="1" ratio="1" hfade="1" vfade="1"/></Brush>'
        add('tangent-sharpness-line-pressure-'+pressure,'tangentnormal',{'brush_definition':tip,'PressureSharpness':'true','SharpnessValue':'1','PressureSize':pressure,'SizeUseCurve':pressure})
    for family in('sketchbrush','spraybrush'):
        add('modern-mask-'+family,family,{'Sketch/simpleMode':'false','CompositeOp':'multiply','PaintOpAction':'2','brush_definition':'<Brush type="auto_brush" spacing=".1" density=".8" randomness=".2"><MaskGenerator id="gauss" type="rect" diameter="16" ratio=".6" hfade=".5" vfade=".7" spikes="5" antialiasEdges="1"/></Brush>'})
    add('spray-canonical-source','spraybrush',{'ColorOption/sampleInputColor':'true','ColorOption/mixBgColor':'true','PaintOpSettings/rate':'25','Spray/diameter':'40','Spray/particleCount':'5'})
    add('render-size-time','paintbrush',{'PressureSize':'true','SizeUseCurve':'true','SizeSensor':'<params id="time" duration="100" periodic="1"><curve>0,0;1,1;</curve></params>'})
    for modern in('false','true'):
        add('dulling-wash-source-'+modern,'colorsmudge',{'PaintOpAction':'2','SmudgeRateUseNewEngine':modern,'SmudgeRateMode':'1','PressureSmudgeRadius':'true','SmudgeRadiusUseCurve':'false','SmudgeRadiusValue':'.41','SmudgeRadiusVersion':'2'})
    add('pixel-independent-child-time','paintbrush',{'MaskingBrush/Enabled':'true','MaskingBrush/UseMasterSize':'true','MaskingBrush/MasterSizeCoeff':'.75','MaskingBrush/MaskingCompositeOp':'multiply','MaskingBrush/Preset/brush_definition':TIP,'MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeUseCurve':'true','MaskingBrush/Preset/SizeSensor':'<params id="time" duration="100"><curve>0,0;1,1;</curve></params>'})
    # Reuse independently authored native fixtures, retaining their actual mask,
    # texture, filter and feedback settings; only add the genuine host flag.
    from test_filter_mask192 import fixtures192
    from test_color_smudge193 import native193
    def host(raw):
        image=Image.open(io.BytesIO(raw));image.load();node=ET.fromstring(image.info['preset']);ET.SubElement(node,'param',name='PaintOpSettings/isAirbrushing').text='true';return png_preset(node)
    for label,raw in fixtures192():
        if label in('default','gauss','soft','spikes','pipe-pressure','texture-3','texture-12'):
            rows.append(('whole-filter-'+label,'filter',host(raw)))
    for modern in(False,True):
        rows.append(('whole-smudge-'+str(modern),'colorsmudge',host(native193(modern=modern,smudge=1))))
    return rows


def write_bundle195(path):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED)as archive:
        for name,engine,data in corpus195():archive.writestr(zipfile.ZipInfo('paintoppresets/'+name+'.kpp'),data)
