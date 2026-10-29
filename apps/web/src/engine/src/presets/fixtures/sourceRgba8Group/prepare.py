"""Reuse the pinned scalar-colour fixture, then add exact native mask methods."""
from pathlib import Path
import subprocess
import sys

here = Path(__file__).parent
source, build = map(Path, sys.argv[1:])
subprocess.run([sys.executable, str(here.parent/'sourceColorRgba8'/'prepare.py'), str(source), str(build)], check=True)
traits = (source/'KoColorSpaceTraits.h').read_text()
def method(marker):
    start = traits.index(marker)
    i = traits.index('{', start) + 1
    depth = 1
    while depth:
        if traits[i] == '{': depth += 1
        if traits[i] == '}': depth -= 1
        i += 1
    return traits[start:i]
notice = traits[:traits.index('#ifndef')]
body = notice + 'struct NativeMask {using channels_type=quint8;static constexpr int alpha_pos=3,pixelSize=4;static quint8*nativeArray(quint8*p){return p;}\n'
body += method('inline static void setOpacity(quint8 * pixels, quint8 alpha, qint32 nPixels)')+'\n'
body += method('inline static void applyAlphaU8Mask(quint8 * pixels, const quint8 * alpha, qint32 nPixels)')+'\n};\n'
(build/'native-mask.h').write_text(body)
(build/'oracle.cpp').write_bytes((here/'oracle.cpp').read_bytes())
