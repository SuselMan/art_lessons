"""Capture image particles from the existing validated resource resolver only.

Krita imageUrl is a reference here, never a path/URL opened by this adapter.
No Qt renderer/parser implementation is copied. Canonical RGBA retains source
channel bytes; ICC and Qt's resize/rotation filtering are not reproduced.
"""
import base64
import hashlib
import io
import xml.etree.ElementTree as ET
from PIL import Image
from brush_contract import MAX_PIXELS


def capture_spray_image(root, reference, resolve_resource):
    if not reference or not callable(resolve_resource):
        raise ValueError('Spray image shape requires a captured portable image resource')
    payload=resolve_resource(reference)
    if not isinstance(payload,(bytes,bytearray)):
        raise ValueError('Spray image resource must contain captured bytes')
    # BytesIO is intentional: imageUrl is NEVER passed to Image.open/open.
    image=Image.open(io.BytesIO(payload))
    if min(image.size)<1 or image.width*image.height>MAX_PIXELS:
        raise ValueError('Spray image resource exceeds pixel limit')
    image.load()
    # L/P/LA sources are still images, not coverage masks. Force explicit RGBA
    # so common brush application1 preserves black/white as RGB with true alpha.
    rgba=Image.frombytes('RGBA',image.size,image.convert('RGBA').tobytes())
    encoded=io.BytesIO();rgba.save(encoded,format='PNG');png=encoded.getvalue()
    filename='grafetto-captured-spray-'+hashlib.sha256(png).hexdigest()+'.png'
    resources=root.find('resources')
    if resources is None:resources=ET.SubElement(root,'resources')
    # Deterministic key includes actual bytes; a colliding original key is not
    # trusted. The canonical captured bytes are appended and MD5-validated by
    # the SAME existing preset reader on its normal second pass.
    ET.SubElement(resources,'resource',{'filename':filename,'md5sum':hashlib.md5(png).hexdigest()}).text=base64.b64encode(png).decode('ascii')
    definition=ET.Element('Brush',{'type':'png_brush','filename':filename,'brushApplication':'1','scale':'1','ratio':'1','spacing':'0.1','useAutoSpacing':'0','angle':'0'})
    return ET.tostring(definition,encoding='unicode'),image.size


def spray_image_bounds(source_size,side):
    """Tight original rectangle in the existing tip_asset padding.

    The common Pixel maskBounds is a square long-axis envelope. An independent
    image particle must crop that padding before stretching to width/height.
    Reuse tip_asset's exact integer sizes and Python half-even resize rounding.
    """
    width,height=source_size
    initial=max(2,min(2048,1<<(max(width,height)-1).bit_length()))
    scale=min(1,initial/max(width,height))
    w,h=(max(1,round(n*scale))for n in source_size)
    if not isinstance(side,int) or side<max(w,h):
        raise ValueError('Spray image canonical storage mismatch')
    return{'x':((side-w)//2)/side,'y':((side-h)//2)/side,'width':w/side,'height':h/side}
