"""Offline functional text-mask capture; never a system-font identity claim."""
import hashlib
import io
import math
from pathlib import Path
import subprocess
import unicodedata
from PIL import Image, ImageDraw, ImageFont, features


def render_text_source(definition):
    pipe=definition.get('pipe','false')
    if pipe not in ('true','false'):raise ValueError('Invalid native text pipe flag')
    pipe=pipe=='true'
    text=definition.get('text','The quick brown fox ate your text')
    original_font=definition.get('font','')
    if len(text.encode('utf-16-le',errors='surrogatepass'))>8192 or len(original_font)>4096:
        raise ValueError('Text/font metadata exceeds limit')
    if any(unicodedata.category(c)=='Cc' or not pipe and unicodedata.category(c)=='Cs' for c in text):
        raise ValueError('Control/multiline text layout is not captured')
    fields=original_font.split(',')
    family=fields[0].strip() or 'sans-serif'
    if len(family)>256 or any(c in family for c in '\n\r\0'):
        raise ValueError('Invalid requested font family')
    def scalar(index,default):
        try: result=float(fields[index]) if len(fields)>index else default
        except ValueError: raise ValueError('Malformed serialized font')
        if not math.isfinite(result): raise ValueError('Nonfinite serialized font')
        return result
    points,pixels=scalar(1,12),scalar(2,-1)
    pixels=pixels if pixels>0 else (points if points>0 else 12)*96/72
    pixel_size=math.floor(pixels+.5)
    if not 1<=pixel_size<=2048: raise ValueError('Text font resolution exceeds limit')
    weight,style=scalar(4,50),scalar(5,0)
    if not 0<=weight<=1000 or style not in (0,1,2):raise ValueError('Unsupported serialized font style')
    escaped=family.replace('\\','\\\\').replace(':','\\:').replace(',','\\,').replace('-','\\-')
    pattern=escaped+':weight='+str(200 if weight>=63 else 80)+':slant='+str(100 if style else 0)+':pixelsize='+str(pixel_size)+':dpi=96'
    # No shell or caller-supplied file path; read only a resolver-selected font
    # below explicit font roots. The selected bytes, not the family alias, bind
    # the actual raster provenance.
    result=subprocess.run(['fc-match','-f','%{file}\n%{index}\n%{family}\n%{style}\n',pattern],capture_output=True,timeout=5,check=True)
    if len(result.stdout)>32768 or len(result.stderr)>32768:raise ValueError('Font resolver output exceeds limit')
    lines=result.stdout.decode('utf-8',errors='strict').splitlines()
    if len(lines)!=4:raise ValueError('Font resolver did not return one font')
    path=Path(lines[0]).resolve(strict=True)
    roots=[Path('/usr/share/fonts'),Path('/usr/local/share/fonts'),Path.home()/'.local/share/fonts',Path.home()/'.fonts']
    if not any(path.is_relative_to(root.resolve()) for root in roots) or not path.is_file():
        raise ValueError('Selected font is outside allowed font roots')
    if not 0<path.stat().st_size<=32*1024*1024:raise ValueError('Selected font bytes exceed limit')
    with path.open('rb') as stream:font_bytes=stream.read(32*1024*1024+1)
    if len(font_bytes)>32*1024*1024:raise ValueError('Selected font changed beyond byte limit')
    if not lines[1].isdigit() or not 0<=int(lines[1])<=65535:raise ValueError('Unsupported font face index')
    face=int(lines[1]);raqm=features.check_feature('raqm')
    # BASIC is deliberately limited to unshaped Latin/Greek/Cyrillic text. It
    # must not silently draw joining/RTL/complex scripts as disconnected glyphs.
    if not raqm and any(ord(c)>0x052f or unicodedata.combining(c) for c in text):
        raise ValueError('This text requires the unavailable RAQM shaping backend')
    layout=ImageFont.Layout.RAQM if raqm else ImageFont.Layout.BASIC
    font=ImageFont.truetype(io.BytesIO(font_bytes),size=pixel_size,index=face,layout_engine=layout)
    encoded=text.encode('utf-16-le',errors='surrogatepass')
    units=[int.from_bytes(encoded[i:i+2],'little') for i in range(0,len(encoded),2)]
    glyphs=[];sequence=[];unique={}
    if pipe and units:
        for unit in units:
            if unit not in unique:
                if len(unique)>=256:raise ValueError('Text pipe exceeds original frame limit')
                unique[unit]=len(glyphs)
                # QChar selection remains UTF16-unit based. FreeType receives a
                # declared replacement glyph for isolated surrogate units; the
                # original sequence/XML and captured output remain authoritative.
                glyphs.append('\ufffd' if 0xd800<=unit<=0xdfff else chr(unit))
            sequence.append(unique[unit])
    else:
        glyphs=[text];sequence=[0]
    images=[];total_pixels=0
    for glyph in glyphs:
        left,top,right,bottom=font.getbbox(glyph,anchor='ls')
        width,height=max(1,right-left),max(1,bottom-top)
        if max(width,height)>2048 or width*height>1048576:raise ValueError('Text mask exceeds resolution/pixel budget')
        total_pixels+=width*height
        if total_pixels>64*1024*1024:raise ValueError('Text pipe cumulative pixels exceed import budget')
        image=Image.new('L',(width,height),255)
        ImageDraw.Draw(image).text((-left,-top),glyph,font=font,fill=0,anchor='ls')
        images.append(image)
    selected_family,selected_style=lines[2],lines[3]
    if len(selected_family)>1024 or len(selected_style)>1024:raise ValueError('Resolved font metadata exceeds limit')
    substituted=family.casefold() not in [name.strip().casefold() for name in selected_family.split(',')]
    provenance={'kind':'fontconfig-pillow-text-mask-v1','originalFont':original_font,'fontSha256':hashlib.sha256(font_bytes).hexdigest(),'faceIndex':face,'pixelSize':pixel_size,'dpi':96,'family':selected_family,'style':selected_style,'layout':'raqm' if raqm else 'basic','substituted':substituted}
    return images,provenance,sequence if pipe else None


def render_static_text(definition):
    if definition.get('pipe','false')!='false':raise ValueError('Static text capture received a pipe')
    images,provenance,_=render_text_source(definition)
    return images[0],provenance
