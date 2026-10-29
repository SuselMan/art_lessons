"""Extract pinned native methods into authored capture stubs; never rewrite bodies.

Usage: python3 assemble.py PINNED_SOURCE_DIRECTORY OUTPUT_CPP
Source files are obtained separately from the official URLs in README.md.
The output contains upstream GPL source and remains an offline native fixture;
none of its implementation is copied into the web helper.
"""
import hashlib
from pathlib import Path
import sys

source_dir, output = map(Path, sys.argv[1:])
here = Path(__file__).parent
import json
proof = json.loads((here / 'consumer.native.json').read_text())
expected = {entry['file']: entry['sha256'] for entry in proof['provenance']['sources']}
sources = {}
for name, digest in expected.items():
    data = (source_dir / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f'Unexpected pinned source: {name}')
    sources[name] = data.decode()

distribution = sources['KisSprayRandomDistributions.cpp']
start = distribution.index('class KisSprayFunctionBasedDistribution::Private')
end = distribution.index('KisSprayFunctionBasedDistribution::KisSprayFunctionBasedDistribution()', start)
body = distribution[start:end].replace('class KisSprayFunctionBasedDistribution::Private', 'class NativeDistribution')
spray = sources['spray_brush.cpp']
start = spray.index('qreal SprayBrush::rotationAngle(')
end = spray.index('void SprayBrush::paint(KisPaintDeviceSP', start)
rotation = spray[start:end]
start = spray.index('template <typename AngularDistribution, typename RadialDistribution>')
end = spray.index('void SprayBrush::paintParticle(', start)
paint = spray[start:end]
notice = ''.join(text[:text.index('#include')] for text in [distribution, spray])
stubs = (here / 'captureStubs.cpp').read_text()
output.write_text(notice + stubs.replace('// SOURCE_DISTRIBUTION', body).replace('// SOURCE_ROTATION_AND_PAINT', rotation + paint))
