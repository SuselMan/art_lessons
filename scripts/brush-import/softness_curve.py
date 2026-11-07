"""Offline affine basis for Krita Pixel soft-mask knot Softness.

Pinned semantics: Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f,
kis_curve_circle_mask_generator.cpp transformCurveForSoftness and
kis_cubic_curve.cpp Data::value/floatTransfer. Natural/corner mathematics is
reused from curve_transfer; this is a functional compiler, not native-byte proof.
No CAS, image library, runtime cache or per-dab compilation is involved.
"""
import bisect
import math
import struct
from curve_transfer import natural_run

MAX_RESOLUTION = 40000
MAX_KNOTS = 256
ENCODING = 'softness-affine-unorm32be-v1'
_U32 = 0xffffffff


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _points(curve):
    if not isinstance(curve, str) or len(curve) > 65536:
        raise ValueError('Invalid softness curve text')
    records = [r.split(',') for r in curve.split(';') if r.strip()]
    if not 1 <= len(records) <= MAX_KNOTS:
        raise ValueError('Softness curve knot count exceeds limit')
    points = []
    for record in records:
        if len(record) not in (2, 3) or len(record) == 3 and record[2].strip() != 'is_corner':
            raise ValueError('Invalid softness curve knot')
        try:
            x, y = map(float, record[:2])
        except ValueError as error:
            raise ValueError('Invalid softness curve knot') from error
        if not all(math.isfinite(v) and 0 <= v <= 1 for v in (x, y)):
            raise ValueError('Softness curve knot outside unit range')
        if points and x - points[-1][0] < 1e-12:
            raise ValueError('Softness curve knots are unordered or too close')
        points.append((x, y, len(record) == 3))
    # Native inserts a smooth midpoint BEFORE scaling the interior ordinates.
    if len(points) == 2:
        first, last = points
        points.insert(1, ((first[0] + last[0]) * .5, (first[1] + last[1]) * .5, False))
    return points


def _raw_samples(points, resolution, softness):
    transformed = [(x, y if i in (0, len(points)-1) else y * softness)
                   for i, (x, y, _corner) in enumerate(points)]
    ends = [0] + [i for i in range(1, len(points)-1) if points[i][2]] + [len(points)-1]
    if len(points) == 1:
        runs = [(points[0][0], natural_run(transformed))]
    else:
        runs = [(points[end][0], natural_run(transformed[start:end+1]))
                for start, end in zip(ends, ends[1:])]
    boundaries = [end for end, _evaluate in runs]
    result = []
    for i in range(resolution + 2):
        x = max(points[0][0], min(points[-1][0], i / (resolution + 1)))
        index = min(len(runs)-1, bisect.bisect_left(boundaries, x))
        value = runs[index][1](x)
        if not math.isfinite(value):
            raise ValueError('Nonfinite softness basis')
        result.append(value)  # Deliberately NOT clamped: clamp and mix do not commute.
    return tuple(result)


def raw_softness_basis(curve, resolution):
    if type(resolution) is not int or not 1 <= resolution <= MAX_RESOLUTION:
        raise ValueError('Invalid softness basis resolution')
    points = _points(curve)
    return _raw_samples(points, resolution, 0), _raw_samples(points, resolution, 1)


def compile_softness_basis(curve, diameter):
    if not _number(diameter) or not 0 < diameter <= 10000:
        raise ValueError('Invalid softness authored diameter')
    resolution = math.floor(diameter * 4 + .5)
    zero, one = raw_softness_basis(curve, resolution)
    minimum = min(0.0, min(zero), min(one))
    maximum = max(1.0, max(zero), max(one))
    span = maximum - minimum
    if span == 0:
        span = 1.0
    if not math.isfinite(span) or not -65536<=minimum<=65536 or not 1<=span<=131072:
        raise ValueError('Unrepresentable softness basis range')
    payload = bytearray()
    for pair in zip(zero, one):
        for value in pair:
            normalized = (value - minimum) / span
            encoded = max(0, min(_U32, math.floor(normalized * _U32 + .5)))
            payload.extend(struct.pack('>I', encoded))
    return {'resolution': resolution, 'encoding': ENCODING, 'minimum': minimum,
            'span': span, 'payload': bytes(payload)}


def sample_softness_basis(basis, q, softness):
    """Coverage, with native clamp of each LUT value BEFORE radial interpolation."""
    if not isinstance(basis, dict) or set(basis) != {'resolution', 'encoding', 'minimum', 'span', 'payload'}:
        raise ValueError('Invalid softness basis fields')
    resolution = basis['resolution']
    if (type(resolution) is not int or not 1 <= resolution <= MAX_RESOLUTION
            or basis['encoding'] != ENCODING
            or not _number(basis['minimum']) or not _number(basis['span']) or basis['span'] <= 0
            or not math.isfinite(basis['minimum'] + basis['span'])
            or type(basis['payload']) is not bytes or len(basis['payload']) != (resolution+2)*8):
        raise ValueError('Invalid softness basis encoding')
    if not _number(q) or not _number(softness) or not 0 <= softness <= 1:
        raise ValueError('Invalid softness sample')
    if not 0 <= q <= 1:
        return 0.0
    position = q * resolution
    index = math.floor(position)
    def value(i):
        a, b = struct.unpack_from('>II', basis['payload'], i*8)
        raw = basis['minimum'] + basis['span'] * ((a + (b-a)*softness) / _U32)
        return max(0.0, min(1.0, raw))
    left, right = value(index), value(index+1)
    return left + (right-left)*(position-index)
