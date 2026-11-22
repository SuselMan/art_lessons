"""Original KPP190 assembly. Components reuse the existing Pixel parser, while
original KPP bytes (not synthetic bridges) remain the final identity authority.
"""
import io,math,struct,hashlib,copy,subprocess
from collections import ChainMap
from pathlib import Path
from PIL import Image,ImageFont,ImageDraw,PngImagePlugin
from independent_mask190 import COMPONENT190,MASK_RADIAL190,MODES,independent_mask190_scope

def png_preset(root):
    import xml.etree.ElementTree as ET
    meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',ET.tostring(root,encoding='unicode'),zip=True)
    out=io.BytesIO();Image.new('L',(1,1)).save(out,format='PNG',pnginfo=meta);return out.getvalue()

def text_resource(definition,external):
    """Bounded offline text coverage; deliberately not a Qt/font pixel oracle.
    UTF16 sequence positions are retained, including repeated characters.
    """
    text=definition.get('text','');font=definition.get('font','');pipe=definition.get('pipe','false').lower()in('true','1')
    encoded=text.encode('utf-16-le','surrogatepass');units=[encoded[i:i+2].decode('utf-16-le','surrogatepass')for i in range(0,len(encoded),2)]
    if len(units)>256:raise ValueError('Text pipe exceeds256 UTF16 positions')
    fields=font.split(',');size=fields[2]if len(fields)>2 and fields[2].lstrip('-').isdigit()and int(fields[2])>0 else str(float(fields[1])*96/72)if len(fields)>1 else'16'
    try:px=float(size)
    except ValueError:raise ValueError('Invalid serialized text font size')
    if not math.isfinite(px)or not 1<=px<=512:raise ValueError('Text font size outside1..512')
    family=fields[0]if fields and fields[0]else'DejaVu Sans'
    if len(family)>256 or any(ord(c)<32 for c in family):raise ValueError('Invalid serialized font family')
    try:weight=int(fields[4])if len(fields)>4 else 50;style=int(fields[5])if len(fields)>5 else 0
    except ValueError:raise ValueError('Invalid serialized font weight/style')
    underline=len(fields)>6 and fields[6]=='1';strike=len(fields)>7 and fields[7]=='1'
    pattern=family.replace('\\','\\\\').replace(':','\\:')+(':weight=bold'if weight>=63 else':weight=light'if weight<38 else':weight=regular')+(':slant=italic'if style==1 else':slant=oblique'if style==2 else':slant=roman')
    suffix='-BoldOblique'if weight>=63 and style in(1,2)else'-Bold'if weight>=63 else'-Oblique'if style in(1,2)else''
    fallback='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';fallback_family='DejaVu Sans'
    for filename,name in [('DejaVuSans','DejaVu Sans'),('DejaVuSansMono','DejaVu Sans Mono'),('DejaVuSerif','DejaVu Serif')]:
        candidate='/usr/share/fonts/truetype/dejavu/'+filename+suffix+'.ttf'
        if Path(candidate).is_file():fallback=candidate;fallback_family=name;break
    actual_family=fallback_family;font_path=fallback
    try:
        matched=subprocess.run(['fc-match','--format=%{file}\\n%{family}\\n',pattern],check=True,capture_output=True,text=True,timeout=3).stdout.splitlines()
        if len(matched)>=2 and Path(matched[0]).is_file():font_path,actual_family=matched[:2]
    except(OSError,subprocess.SubprocessError):pass
    face=ImageFont.truetype(font_path,round(px))
    face_style=face.getname()[1].casefold()
    if (style in(1,2)and not any(name in face_style for name in('italic','oblique'))or weight>=63 and'bold'not in face_style)and font_path!=fallback:
        font_path=fallback;actual_family=fallback_family;face=ImageFont.truetype(font_path,round(px))
    final_style=face.getname()[1].casefold()
    missing_style=style in(1,2)and not any(name in final_style for name in('italic','oblique'))or weight>=63 and'bold'not in final_style
    substituted=missing_style or family.casefold()not in [name.strip().casefold()for name in actual_family.split(',')]
    frames=[]
    for part in (units if pipe and units else [text]):
        safe=''.join('\ufffd'if 0xD800<=ord(c)<=0xDFFF else c for c in part)
        rect=face.getbbox(safe);w=max(1,rect[2]-rect[0]);h=max(1,rect[3]-rect[1])
        if max(w,h)>2048:raise ValueError('Text raster exceeds2048 resource bound')
        image=Image.new('L',(w,h));draw=ImageDraw.Draw(image);draw.text((-rect[0],-rect[1]),safe,font=face,fill=255)
        if underline:draw.line((0,h-1,w-1,h-1),fill=255,width=max(1,round(px/16)))
        if strike:draw.line((0,h//2,w-1,h//2),fill=255,width=max(1,round(px/16)))
        name=b'Own text190\0';frames.append(struct.pack('>7I',28+len(name),2,w,h,1,0x47494d50,25)+name+image.tobytes())
    if sum(len(f)for f in frames)>64*1024*1024:raise ValueError('Text frames exceed resource budget')
    # One-position pipe is a static resource, preserving its identical sequence.
    raw=(b'Own Text190\n'+(str(len(frames))+' ncells:'+str(len(frames))+' dim:1 rank0:'+str(len(frames))+' sel0:incremental\n').encode()+b''.join(frames))if len(frames)>1 else frames[0]
    filename='own-text190-'+hashlib.sha256(raw).hexdigest()+('.gih'if len(frames)>1 else'.gbr');external[filename]=raw
    import xml.etree.ElementTree as ET
    lowered=ET.Element('Brush',dict(definition.attrib));lowered.set('type','gbr_brush');lowered.set('filename',filename);lowered.set('brushApplication','0');lowered.set('ColorAsMask','1')
    return lowered,('TextBrush font substituted: '+family+' -> '+actual_family+'; 'if substituted else'TextBrush font resolved: '+actual_family+'; ')+('requested bold/italic unavailable; available style substituted; 'if missing_style else'available requested weight/style selected; ')+'offline coverage retains underline/strike and UTF16 pipe positions; no native Qt/font pixel identity claim.'

def lower_pair(data,name,catalog,external,impl,options,*,revision=190,scope=independent_mask190_scope):
    import xml.etree.ElementTree as ET
    from krita_import import xml,enabled,numeric,compatibility
    from brush_contract import finalize_identity
    from curve_transfer import scaled_curve
    image=Image.open(io.BytesIO(data));image.load();root=xml(image.info.get('preset',''))
    if root.get('paintopid')!='paintbrush':raise ValueError('Mask190 is native Pixel only')
    params={p.get('name'):p.text or''for p in root.findall('param')}
    prefix='MaskingBrush/Preset/'
    child_params={k[len(prefix):]:v for k,v in params.items()if k.startswith(prefix)}
    if not child_params:raise ValueError('Missing native masking component')
    if enabled(child_params.get('MaskingBrush/Enabled')):raise ValueError('Nested native masks unsupported')
    # This is the actual seven-option UI. Active copied foreign options cannot be
    # silently removed to fit a descriptor probe.
    options7={'Opacity','Flow','Size','Ratio','Rotation','Mirror','Scatter'}
    for key,value in child_params.items():
        if key.startswith('Pressure')and enabled(value)and key[8:]not in options7:raise ValueError('Active option outside native masking UI: '+key)
    if any(enabled(child_params.get(k))for k in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Masking UI has no independent child airbrush clock')
    components=[];warnings=[];notes=[];resources=ChainMap({},external)
    for child in (False,True):
        node=ET.Element('Preset',{'paintopid':'paintbrush','name':root.get('name','')+(' masking component'if child else'')})
        values=child_params if child else{k:v for k,v in params.items()if not k.startswith('MaskingBrush/')}
        for key,value in values.items():
            original=next((p for p in root.findall('param') if p.get('name')==(prefix+key if child else key)),None)
            attributes=dict(original.attrib) if original is not None else {}
            attributes['name']=key
            ET.SubElement(node,'param',attributes).text=value
        for record in root:
            if record.tag!='param':node.append(copy.deepcopy(record))
        definition=xml(values.get('brush_definition',''))
        if definition.get('type')=='kis_text_brush':
            definition,warning=text_resource(definition,resources);warnings.append(warning)
            next(p for p in node.findall('param')if p.get('name')=='brush_definition').text=ET.tostring(definition,encoding='unicode')
        token=COMPONENT190.set(True);radial_token=MASK_RADIAL190.set(True)
        try:
            result=impl(png_preset(node),name,catalog,resources,0,**{**options,'stroke_input':False,'timed_input':True,'_allow_texture_material':True,'_native_sampling_candidate':None,'_primary_clock_read':False,'_default_input_policy':None})
        finally:MASK_RADIAL190.reset(radial_token);COMPONENT190.reset(token)
        bad=[n for n in result['compatibility']if n['status']=='unsupported']
        if bad:raise ValueError('Unlowered native190 component options: '+', '.join(n['feature']for n in bad))
        components.append(result);notes.extend({**n,'feature':('masking.'if child else'')+n['feature']}for n in result['compatibility'])
        warnings.extend(result.get('warnings',[]))
    parent,child=(c['descriptor']for c in components)
    parent['version']=child['version']=revision
    dual={'brush':child,'blendMode':MODES.get(params.get('MaskingBrush/MaskingCompositeOp','multiply')),'sampling':'independent'}
    if dual['blendMode']is None:raise ValueError('Unknown native masking composite')
    if enabled(params.get('MaskingBrush/UseMasterSize','true')):
        ratio=numeric(params.get('MaskingBrush/MasterSizeCoeff'),1)
        if not math.isfinite(ratio)or not .01<=ratio<=8:raise ValueError('Native master size coefficient outside existing.01..8 bound')
        child['sizeByPressure']=scaled_curve(child['sizeByPressure'],ratio)
    else:
        size=components[1].get('sourceDefaults',{}).get('sizePx')
        if type(size)not in(int,float)or not math.isfinite(size)or not .01<=size<=10000:raise ValueError('Missing native configured child diameter')
        dual['sizePolicy']={'kind':'resource','diameter':size}
    parent['behavior']['dual']=dual
    # Source channel capture belongs to the whole root, not merely to the child.
    if any(c['descriptor'].get('behavior',{}).get('speedInput')for c in components):parent['behavior']['speedInput']={'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'}
    if not scope(parent):raise ValueError('Native190 whole role scope rejected')
    child_seed=data+b'\0MaskingBrush/Preset/'
    finalize_identity(child,child_seed);finalize_identity(parent,data)
    notes.append(compatibility('masking190','Native Pixel seven masking options retained with independent component cursor/state, accumulated GrayA and ten factory mask operations. Perspective uses native default1 without an external assistant scene. No font/ICC/native random or pixel identity claim.','supported'))
    result={**components[0],'descriptor':parent,'name':root.get('name')or name,'source':Path(name).name,'compatibility':notes,'warnings':list(dict.fromkeys(warnings))}
    # The author's actual PNG preview is preserved, not the bridge thumbnail.
    from krita_import import preset_preview
    result['preview']=preset_preview(image)
    return result
