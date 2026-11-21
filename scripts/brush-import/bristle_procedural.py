"""Bounded initial raster for the standard circular Krita Bristle source.

The source mask is sampled once at the authored size. Randomness is seeded
from pixel coordinates so every client receives the same hair population.
"""
import hashlib
import math
from PIL import Image


def standard_circle(definition, side):
    generator = definition.find('MaskGenerator')
    if generator is None or generator.get('id', 'default') != 'default' or generator.get('type', 'circle') not in ('circle','rect','rct'):
        raise ValueError('Bristle procedural source requires a standard circular or rectangular generator')
    rectangle = generator.get('type', 'circle') in ('rect','rct')
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
    if not (0.0625 <= ratio <= 1 and 0 <= hf <= 1 and 0 <= vf <= 1 and 0 <= density <= 1 and 0 <= randomness <= 1 and spikes == int(spikes) and 2 <= spikes <= 20):
        raise ValueError('Bristle procedural source settings outside supported bounds')
    angle=math.remainder(angle,2*math.pi)
    cosine,sine=math.cos(angle),math.sin(angle)
    extent=max(abs(cosine)+ratio*abs(sine),abs(sine)+ratio*abs(cosine))
    canvas_side=side if angle==0 else max(side,math.ceil(side*extent))
    aa = generator.get('antialiasEdges', '0').lower() in ('1', 'true')
    radius = side / 2
    ry = radius * ratio
    n = 6 if aa and side * ratio < 1 else 3 if aa and side * ratio < 10 else 1
    def transparency(x, y):
        x,y=cosine*x+sine*y,-sine*x+cosine*y
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
        distance = max(u,v) if rectangle else u*u + v*v
        if distance > 1:
            return 255
        fx = (ax + aa) * (1 if hf == 0 else 1 / (hf * radius))
        fy = (ay + aa) * (1 if vf == 0 else 1 / (vf * ry))
        if rectangle:
            # Native scalar selection: an undefined axis is never selected.
            a = u*(fx-1)/(fx-u) if fx != u else float('-inf')
            b = v*(fy-1)/(fy-v) if fy != v else float('-inf')
            value = a if fx > 1 else 0
            undefined_x = fx == u and (u == 0 or fx == 1)
            if fy > 1 and not undefined_x and a < b:
                value = b
            return math.floor(255*max(0,min(1,value)))
        q = fx*fx + fy*fy
        value = 0 if q < 1 else 255 if q == distance else 255 * distance * (q - 1) / (q - distance)
        return math.floor(max(0, min(255, value)))
    pixels = bytearray(canvas_side * canvas_side)
    for y in range(canvas_side):
        for x in range(canvas_side):
            seed = hashlib.sha256(f'bristle-mask:{x},{y}'.encode()).digest()
            if int.from_bytes(seed[:4], 'big') / 2**32 >= density:
                continue
            total = sum(transparency(x-canvas_side//2+sx/n, y-canvas_side//2+sy/n) for sy in range(n) for sx in range(n))
            alpha = 255 - total // (n*n)
            attenuation = int.from_bytes(seed[4:8], 'big') / 2**32
            pixels[y*canvas_side+x] = round(alpha * (1 - randomness * attenuation))
    return Image.frombytes('L', (canvas_side, canvas_side), bytes(pixels))
