"""Bounded initial raster for the standard circular Krita Bristle source.

The source mask is sampled once at the authored size. Randomness is seeded
from pixel coordinates so every client receives the same hair population.
"""
import hashlib
import math
from PIL import Image


def standard_circle(definition, side):
    generator = definition.find('MaskGenerator')
    if generator is None or generator.get('id', 'default') != 'default' or generator.get('type', 'circle') != 'circle':
        raise ValueError('Bristle procedural source requires a standard circular generator')
    def number(node, key, default):
        value = float(node.get(key, default))
        if not math.isfinite(value):
            raise ValueError('Non-finite Bristle source setting')
        return value
    ratio = number(generator, 'ratio', 1)
    hf, vf = (number(generator, key, 1) for key in ('hfade', 'vfade'))
    density, randomness = (number(definition, key, default) for key, default in (('density', 1), ('randomness', 0)))
    spikes = number(generator, 'spikes', 2)
    angle = number(definition, 'angle', 0)
    if not (angle == 0 and 0.0625 <= ratio <= 1 and 0 <= hf <= 1 and 0 <= vf <= 1 and 0 <= density <= 1 and 0 <= randomness <= 1 and spikes == int(spikes) and 2 <= spikes <= 20):
        raise ValueError('Bristle procedural source settings outside supported bounds')
    aa = generator.get('antialiasEdges', '0').lower() in ('1', 'true')
    radius = side / 2
    ry = radius * ratio
    n = 6 if aa and side * ratio < 1 else 3 if aa and side * ratio < 10 else 1
    def transparency(x, y):
        if spikes > 2:
            y = abs(y)
            angle = math.atan2(y, x)
            sector = math.pi / spikes
            step = 2 * sector
            while angle > sector:
                c, s = math.cos(-step), math.sin(-step)
                x, y = c*x-s*y, s*x+c*y
                angle -= step
        ax, ay = abs(x), abs(y)
        u, v = ax / radius, ay / ry
        distance = u*u + v*v
        if distance > 1:
            return 255
        fx = (ax + aa) * (1 if hf == 0 else 1 / (hf * radius))
        fy = (ay + aa) * (1 if vf == 0 else 1 / (vf * ry))
        q = fx*fx + fy*fy
        value = 0 if q < 1 else 255 if q == distance else 255 * distance * (q - 1) / (q - distance)
        return math.floor(max(0, min(255, value)))
    pixels = bytearray(side * side)
    for y in range(side):
        for x in range(side):
            seed = hashlib.sha256(f'bristle-mask:{x},{y}'.encode()).digest()
            if int.from_bytes(seed[:4], 'big') / 2**32 >= density:
                continue
            total = sum(transparency(x-side//2+sx/n, y-side//2+sy/n) for sy in range(n) for sx in range(n))
            alpha = 255 - total // (n*n)
            attenuation = int.from_bytes(seed[4:8], 'big') / 2**32
            pixels[y*side+x] = round(alpha * (1 - randomness * attenuation))
    return Image.frombytes('L', (side, side), bytes(pixels))
