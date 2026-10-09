"""Exact audit of QA premult RGBA -> white RGB PNG, flipY, nearest4x.
No image dependencies: reads this diagnostic's filter-zero RGB8 PNG only.
"""
import json
import pathlib
import struct
import zlib

root = pathlib.Path(__file__).parent / 'dual-ink-evidence'
rows = []
for name in ['ordinary', 'centre']:
    data = (root / (name + '.png')).read_bytes()
    pos, compressed = 8, b''
    while pos < len(data):
        length = struct.unpack('!I', data[pos:pos + 4])[0]
        kind, block = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b'IHDR':
            width, height, depth, color, *_ = struct.unpack('!2I5B', block)
            assert (width, height, depth, color) == (512, 512, 8, 2)
        if kind == b'IDAT':
            compressed += block
    pixels = zlib.decompress(compressed)
    rgba = (root / (name + '.rgba')).read_bytes()
    assert len(rgba) == 65536
    changed, maximum, nonpremult, spikes = 0, 0, 0, []
    for y in range(height):
        row = pixels[y * (1 + width * 3):(y + 1) * (1 + width * 3)]
        assert row[0] == 0
        for x in range(width):
            offset = ((127 - y // 4) * 128 + x // 4) * 4
            r, g, b, a = rgba[offset:offset + 4]
            expected = [min(255, v + 255 - a) for v in (r, g, b)]
            for value, reference in zip(row[1 + x * 3:4 + x * 3], expected):
                changed += value != reference
                maximum = max(maximum, abs(value - reference))
    for offset in range(0, len(rgba), 4):
        r, g, b, a = rgba[offset:offset + 4]
        nonpremult += max(r, g, b) > a
        if a > 200 and min(r, g, b) == 0:
            spikes.append({'xy': [offset // 4 % 128, offset // 4 // 128], 'rgba': [r, g, b, a]})
    rows.append({'name': name, 'changedRGBBytes': changed, 'maxAbsDiff': maximum,
                 'nonPremultPixels': nonpremult, 'rawHighAlphaExtremeColourPixels': len(spikes), 'samples': spikes})
print(json.dumps({'formula': 'min(255, rawRGB + 255 - alpha)', 'flipY': True,
                  'scale': 'nearest4x', 'rows': rows}, indent=2))
assert all(r['changedRGBBytes'] == 0 for r in rows)
