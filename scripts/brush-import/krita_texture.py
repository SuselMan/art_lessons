"""Offline texture tone compilation, independently implemented from native math.

Reference (not incorporated code): Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f,
plugins/paintops/libpaintop/KisTextureMaskInfo.cpp, recalculateMask:
https://invent.kde.org/graphics/krita/-/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/libpaintop/KisTextureMaskInfo.cpp

No scaling/application/offsets here. Supply already decoded native pattern pixels,
NOT positive GBR brush coverage. This module is deliberately not wired into import.
"""
import math
import struct
from PIL import Image
from brush_contract import MAX_PIXELS


def _float32(value):
    return struct.unpack('=f', struct.pack('=f', value))[0]


def _byte(value):
    return min(255, max(0, math.floor(value * 255 + .5)))


def preprocess_texture(image, *, brightness=0.0, contrast=1.0,
                       neutral_point=0.5, invert=False, cutoff_policy=0,
                       cutoff_left=0, cutoff_right=255, preserve_alpha=False,
                       max_pixels=MAX_PIXELS):
    """Return L coverage or grayscale RGBA when preserving source alpha.

    Cutoff0 leaves values,1 makes outside values transparent,2 makes them opaque.
    In RGBA the cutoff changes alpha only; in L it changes the scalar instead.
    Source alpha is composited over white BEFORE tone adjustment, even when it
    is also retained in RGBA. Native float intermediates are explicitly rounded.
    Geometry/resampling is intentionally the caller's responsibility.
    """
    if not isinstance(image, Image.Image):
        raise ValueError('Expected a decoded PIL image')
    if not isinstance(max_pixels, int) or not 0 < max_pixels <= MAX_PIXELS:
        raise ValueError('Invalid texture pixel budget')
    if min(image.size) <= 0 or image.width * image.height > max_pixels:
        raise ValueError('Texture exceeds pixel budget')
    for name, value, low, high in [('brightness',brightness,-1,1),
                                  ('contrast',contrast,0,100),
                                  ('neutral_point',neutral_point,0,1)]:
        if not isinstance(value,(int,float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Invalid '+name)
    if type(cutoff_policy) is not int or cutoff_policy not in (0,1,2):
        raise ValueError('Invalid cutoff policy')
    if any(type(x) is not int or not 0 <= x <= 255 for x in (cutoff_left,cutoff_right)):
        raise ValueError('Invalid cutoff bounds')
    if type(invert) is not bool or type(preserve_alpha) is not bool:
        raise ValueError('Expected boolean texture options')
    use_alpha = preserve_alpha and ('A' in image.getbands() or 'transparency' in image.info)
    result = bytearray()
    for r,g,b,a in image.convert('RGBA').get_flattened_data():
        alpha = _float32(a / 255)
        gray = (11*r + 16*g + 5*b) // 32
        # Initial composite is float arithmetic; subsequent tone parameters are
        # qreal (double), assigned back to the native float temporary each step.
        value = _float32(_float32(_float32(gray / 255) * alpha) + _float32(1-alpha))
        value = _float32(value - brightness)
        value = _float32((value - .5) * contrast + .5)
        value = min(1.0,max(0.0,value))
        if invert:
            value = _float32(1-value)
        if neutral_point == 1 or (neutral_point != 0 and value <= neutral_point):
            value = _float32(value / (2*neutral_point))
        else:
            value = _float32(.5 + (value-neutral_point) / (2-2*neutral_point))
        outside = value < cutoff_left/255 or value > cutoff_right/255
        if cutoff_policy and outside:
            alpha = float(cutoff_policy == 2)
            if not use_alpha:
                value = alpha
        tone = _byte(value)
        result.extend((tone,tone,tone,_byte(alpha)) if use_alpha else (tone,))
    return Image.frombytes('RGBA' if use_alpha else 'L',image.size,bytes(result))
