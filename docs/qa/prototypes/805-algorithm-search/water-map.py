#!/usr/bin/env python3
"""Visualize the numeric water plane, with an explicitly exaggerated grey scale."""
from pathlib import Path
import sys, zlib, struct, binascii
source, output = map(Path, sys.argv[1:3])
data = source.read_bytes()
pixels = 1024**2
if len(data) != pixels * 6:
    raise ValueError('Expected packed common1024 fixture')
lookup = bytes(255 - round(110 * (v / 255)**.5) for v in range(256))
water = data[pixels*4:pixels*5].translate(lookup)
rows = b''.join(b'\0' + water[y*1024:(y+1)*1024] for y in range(1024))
def chunk(tag, payload):
    return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', binascii.crc32(tag + payload) & 0xffffffff)
output.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1024, 1024, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))
