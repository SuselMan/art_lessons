"""Independent offline lightness planes; not yet connected to the importer.

Behavior references, Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f:
https://invent.kde.org/graphics/krita/-/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/brush/KisColorfulBrush.cpp
https://invent.kde.org/graphics/krita/-/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/brush/kis_predefined_brush_factory.cpp
KoColorSpaceMaths.h: U8 half is127 (integer255/2), not128.

Uses double tone arithmetic and Qt-style nearest integer rounding; no float32
texture arithmetic and no alpha multiplication of the lightness plane. Native
QImage conversion/ICC and later GPU HSL material are outside this helper.
"""
import math
from PIL import Image
from brush_contract import MAX_PIXELS


def _round(value):
    return math.floor(value+.5) if value>=0 else math.ceil(value-.5)


def adjustment_settings(*, midpoint=127, brightness=0.0, contrast=0.0,
                        adjustment_version=1, auto_midpoint=None):
    """Resolve native migration. None means AutoAdjustMidPoint attr ABSENT.

    Explicit false suppresses legacy migration, just like explicit true.
    Unsupported singular/out-of-range settings are rejected, never guessed.
    """
    if type(midpoint) is not int or not 0<=midpoint<=255:
        raise ValueError('Midpoint must be an unsigned8-bit integer')
    if type(adjustment_version) is not int or not 0<=adjustment_version<=2:
        raise ValueError('Unknown lightness adjustment version')
    if auto_midpoint is not None and type(auto_midpoint) is not bool:
        raise ValueError('Auto midpoint must be absent or boolean')
    for value in (brightness,contrast):
        if not isinstance(value,(int,float)) or not math.isfinite(value) or not -1<=value<=1:
            raise ValueError('Invalid lightness adjustment')
    if adjustment_version<2 and auto_midpoint is None:
        midpoint=min(255,max(0,127+2*(midpoint-127)))
        brightness*=2;contrast*=2
        if contrast<0:
            contrast=1/(1-contrast)-1
    if not -1<=brightness<=1 or not -1<=contrast<=1:
        raise ValueError('Migrated adjustment outside supported bounded range')
    return dict(midpoint=midpoint,brightness=brightness,contrast=contrast,
                auto_midpoint=bool(auto_midpoint))


def compile_lightness_planes(image, *, max_pixels=MAX_PIXELS, **settings):
    """Return (adjustedGray:L, sourceAlpha:L), both native dimensions.

    Auto midpoint uses alpha-weighted, per-pixel rounded Qt gray. Completely
    transparent or endpoint-midpoint inputs with active nonsaturated transfer
    can hit native division-by-zero: reject explicitly instead of fabricating
    an endpoint convention. Contrast1 has a defined step and is supported.
    """
    if not isinstance(image,Image.Image):raise ValueError('Expected decoded PIL image')
    if type(max_pixels) is not int or not 0<max_pixels<=MAX_PIXELS:
        raise ValueError('Invalid lightness pixel budget')
    if min(image.size)<=0 or image.width*image.height>max_pixels:
        raise ValueError('Lightness image exceeds pixel budget')
    resolved=adjustment_settings(**settings)
    rgba=image.convert('RGBA')
    grays=bytearray((11*r+16*g+5*b)//32 for r,g,b,a in rgba.get_flattened_data())
    alpha_plane=rgba.getchannel('A')
    alphas=alpha_plane.tobytes()
    midpoint=resolved['midpoint'];brightness=resolved['brightness'];contrast=resolved['contrast']
    if resolved['auto_midpoint']:
        total_alpha=sum(alphas)
        midpoint=255*sum(_round(gray*alpha/255) for gray,alpha in zip(grays,alphas))/total_alpha if total_alpha else 0
    active=abs(midpoint-127)>.1 or abs(brightness)>1e-12 or abs(contrast)>1e-12
    if active and contrast!=1 and midpoint in (0,255):
        raise ValueError('Singular native lightness midpoint transfer')
    if active:
        mid_y=127+(128*brightness if brightness>0 else 127*brightness)
        if contrast==1:
            grays=bytes(255 if gray>=midpoint else 0 for gray in grays)
        else:
            factor=1/(1-contrast) if contrast>0 else 1+contrast
            low=mid_y*factor/midpoint
            high=(255-mid_y)*factor/(255-midpoint)
            low_intercept=mid_y-midpoint*low
            high_intercept=mid_y-midpoint*high
            grays=bytes(min(255,max(0,_round(high*gray+high_intercept if gray>=midpoint else low*gray+low_intercept))) for gray in grays)
    return Image.frombytes('L',image.size,bytes(grays)),alpha_plane
