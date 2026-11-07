"""Bounded captured SVG subset. No filename/path/URL reaches the rasterizer.

Policies are explicit: native SVG brush mask (white1000px), or captured image
RGBA with declared pixel dimensions. Functional librsvg, not Qt/ICC identity.
"""
import io
import math
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image

MAX_INPUT=1024*1024
MAX_ELEMENTS=4096
MAX_PIXELS=4*1024*1024
SVG='http://www.w3.org/2000/svg'
TAGS={'svg','g','defs','path','rect','circle','ellipse','line','polyline','polygon','linearGradient','radialGradient','stop','clipPath'}
ATTRS={'id','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fx','fy','width','height','viewBox','preserveAspectRatio','d','points','transform','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','clip-path','clip-rule','clipPathUnits','gradientUnits','gradientTransform','spreadMethod','offset','stop-color','stop-opacity','color','href'}
STYLE={'fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','clip-path','clip-rule','stop-color','stop-opacity','color'}
REF=re.compile(r'url\(\s*#([A-Za-z_][A-Za-z0-9_.:-]*)\s*\)',re.I)
NUMERIC_ATTRS={'x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fx','fy','width','height','viewBox','d','points','transform','fill-opacity','stroke-width','stroke-opacity','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','gradientTransform','offset','stop-opacity'}
EDITOR_NAMESPACES={'http://www.inkscape.org/namespaces/inkscape','http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd'}
NUMBER=re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?')

def _length(value):
    text=value.strip()
    if text.endswith('px'):text=text[:-2]
    if not NUMBER.fullmatch(text):raise ValueError('SVG requires explicit pixel dimensions')
    n=float(text)
    if not math.isfinite(n)or n<=0 or n>4096:raise ValueError('SVG dimension exceeds limit')
    return n

def sanitize_svg(data,policy):
    if not isinstance(data,bytes)or not data or len(data)>MAX_INPUT:raise ValueError('SVG input exceeds limit')
    # Expat entities/DOCTYPE are disallowed before parsing, including UTF16/32.
    if b'\x00'in data:raise ValueError('SVG declarations/entities forbidden')
    if data.startswith(b'\xef\xbb\xbf'):data=data[3:]
    # Strip only well-formed comments; double hyphens inside are malformed XML.
    def strip_comment(match):
        if b'--'in match.group(1):raise ValueError('Malformed SVG comment')
        return b''
    data=re.sub(br'<!--(.*?)-->',strip_comment,data,flags=re.S)
    data=re.sub(br'^\s*<\?xml\s+[^?]*\?>',b'',data,count=1)
    if re.search(br'<!|<\?',data,re.I):raise ValueError('SVG declarations/entities forbidden')
    try:root=ET.fromstring(data)
    except ET.ParseError as e:raise ValueError('Malformed captured SVG')from e
    if root.tag not in ('svg','{'+SVG+'}svg'):raise ValueError('Captured resource is not SVG')
    nodes=list(root.iter())
    if len(nodes)>MAX_ELEMENTS:raise ValueError('SVG element limit')
    # Editor metadata cannot contribute rendered content or resource references.
    # Bound all parsed nodes first, even subtrees removed below.
    for parent in nodes:
        for child in list(parent):
            if child.tag in {'title','desc','metadata','{'+SVG+'}title','{'+SVG+'}desc','{'+SVG+'}metadata'}:
                parent.remove(child)
    nodes=list(root.iter())
    ids={};refs=[]
    for node in nodes:
        tag=node.tag
        if tag.startswith('{'+SVG+'}'):tag=tag[len(SVG)+2:]
        if tag not in TAGS:raise ValueError('Unsupported SVG element: '+tag)
        node.tag=tag
        if node.text and node.text.strip()or node.tail and node.tail.strip():raise ValueError('SVG text unsupported')
        if len(node.attrib)>64:raise ValueError('SVG attribute limit')
        raw=dict(node.attrib);node.attrib.clear()
        style=raw.pop('style',None)
        if style:
            for declaration in style.split(';'):
                if not declaration.strip():continue
                key,sep,value=declaration.partition(':');key=key.strip()
                if not sep or key not in STYLE or key in raw:raise ValueError('Unsupported SVG style')
                raw[key]=value.strip()
        for key,value in raw.items():
            if key.startswith('{')and key.partition('}')[0][1:]in EDITOR_NAMESPACES:continue
            if key=='{http://www.w3.org/1999/xlink}href':key='href'
            if key not in ATTRS or len(value)>512*1024:raise ValueError('Unsupported SVG attribute')
            if any(ch in value for ch in ('\\','\x00'))or any(ord(ch)<32 and ch not in '\t\r\n'for ch in value):raise ValueError('Unsafe SVG attribute')
            if key=='id':
                if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.:-]*',value)or value in ids:raise ValueError('Invalid SVG id')
                ids[value]=node
            if key=='href':
                if tag not in ('linearGradient','radialGradient')or not re.fullmatch(r'#[A-Za-z_][A-Za-z0-9_.:-]*',value):raise ValueError('External SVG href forbidden')
                refs.append((node,value[1:],'gradient'))
            elif re.search(r'url\s*\(',value,re.I):
                match=REF.fullmatch(value.strip())
                if not match or key not in ('fill','stroke','clip-path'):raise ValueError('External SVG reference forbidden')
                refs.append((node,match.group(1),'clip'if key=='clip-path'else'gradient'))
            if re.search(r'(?:https?:|file:|data:|@import|var\(|expression\(|calc\(|!important)',value,re.I):raise ValueError('Unsafe SVG value')
            # Reject nonfinite/huge numeric coordinates before native parser.
            if key in NUMERIC_ATTRS and any(not math.isfinite(float(n))or abs(float(n))>1e7 for n in NUMBER.findall(value)):raise ValueError('SVG coordinate exceeds limit')
            node.set(key,value)
    graph={id(n):[]for n in nodes}
    for node,ref,kind in refs:
        target=ids.get(ref)
        if target is None or target.tag not in ({'clipPath'}if kind=='clip'else{'linearGradient','radialGradient'}):raise ValueError('Invalid SVG local reference')
        graph[id(node)].append(id(target))
    for n in nodes:
        graph[id(n)].extend(id(child)for child in n)
    visiting=set();heights={}
    def height(k,depth):
        if depth>64 or k in visiting:raise ValueError('Cyclic/deep SVG references')
        if k in heights:return heights[k]
        visiting.add(k)
        h=0
        for child in graph[k]:h=max(h,1+height(child,depth+1))
        visiting.remove(k);heights[k]=h
        if h>64:raise ValueError('Cyclic/deep SVG references')
        return h
    height(id(root),0)
    view=root.get('viewBox')
    if view:
        parts=re.split(r'[\s,]+',view.strip())
        if len(parts)!=4:raise ValueError('Invalid SVG viewBox')
        try:v=list(map(float,parts))
        except ValueError as e:raise ValueError('Invalid SVG viewBox')from e
        if not all(math.isfinite(x)for x in v)or min(v[2:])<=0:raise ValueError('Invalid SVG viewBox')
    else:
        v=[0,0,_length(root.get('width','')),_length(root.get('height',''))];root.set('viewBox',' '.join(map(str,v)))
    # Explicit dimensions with unresolved CSS units are never silently ignored.
    for attr in ('width','height'):
        if root.get(attr)is not None:_length(root.get(attr))
    if policy=='krita-mask-v1':
        width=1000;height=int(1000*v[3]/v[2])
    elif policy=='captured-image-v1':
        width=max(1,round(_length(root.get('width',str(v[2])))));height=max(1,round(_length(root.get('height',str(v[3])))))
    else:raise ValueError('Unknown SVG application policy')
    if min(width,height)<1 or max(width,height)>4096 or width*height>MAX_PIXELS:raise ValueError('SVG raster exceeds limit')
    root.set('xmlns',SVG);root.set('width',str(width));root.set('height',str(height))
    return ET.tostring(root,encoding='utf-8'),(width,height)

def captured_svg(data,policy):
    sanitized,size=sanitize_svg(data,policy)
    try:
        run=subprocess.run(['node','--jitless','--v8-pool-size=1','--max-old-space-size=96',str(Path(__file__).with_name('rasterize_captured_svg.mjs')),policy],input=sanitized,capture_output=True,timeout=20,check=False)
    except (subprocess.TimeoutExpired,OSError)as e:
        raise ValueError('Captured SVG decoder unavailable or timed out')from e
    if run.returncode or len(run.stdout)>20*1024*1024:raise ValueError('Captured SVG rasterization failed')
    image=Image.open(io.BytesIO(run.stdout));image.load()
    if image.size!=size or image.mode!='RGBA':raise ValueError('Invalid captured SVG raster output')
    return image
