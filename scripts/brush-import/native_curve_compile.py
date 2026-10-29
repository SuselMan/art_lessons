"""Bounded optional offline coefficient provider; no approximation or fixture lookup.

The caller supplies a trusted compiler built from native_curve_compile.cpp with
Eigen3.4.0, binary64 and -ffp-contract=off. No automatic compilation, downloading,
executable search or fallback to the legacy natural-spline tables occurs here.
"""
import json
import math
import subprocess
from pathlib import Path

PROFILE = 'eigen-3.4.0-sparselu-f64-no-fma-v1'
MAX_CURVES = 64
MAX_KNOTS = 4096


def _number(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _input(curves):
    if type(curves) is not list or not 1 <= len(curves) <= MAX_CURVES:
        raise ValueError('Invalid native curve batch')
    records = [str(len(curves))]
    total = 0
    for points in curves:
        if type(points) is not list or not 1 <= len(points) <= 256:
            raise ValueError('Invalid native curve knot count')
        total += len(points)
        if total > MAX_KNOTS:
            raise ValueError('Native curve batch exceeds work budget')
        records.append(str(len(points)))
        previous = -1.0
        for point in points:
            if type(point) not in (list, tuple) or len(point) != 3:
                raise ValueError('Native curve knot requires x/y/corner')
            x, y, corner = point
            if not _number(x) or not _number(y) or not 0 <= x <= 1 or not 0 <= y <= 1 or x <= previous or type(corner) is not bool:
                raise ValueError('Invalid native curve knot')
            previous = x
            records.append(f'{x!r} {y!r} {int(corner)}')
    return '\n'.join(records) + '\n'


def compile_curves(curves, executable):
    """Return polynomial coefficients; failures are explicit before admission.

    The absolute executable is trusted server configuration, never KPP data.
    Returned coefficients use global a*x^3+b*x^2+c*x+d, one set per interval.
    """
    payload = _input(curves)
    if not isinstance(executable, (str, Path)) or not Path(executable).is_absolute():
        raise ValueError('An explicit absolute native curve compiler is required')
    try:
        result = subprocess.run([str(executable)], input=payload, text=True, encoding='ascii', capture_output=True,
                                timeout=15, check=True)
        if len(result.stdout) > 2 * 1024 * 1024:
            raise ValueError('Native curve compiler output exceeds budget')
        coefficients = json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError('Native curve compiler failed') from error
    if type(coefficients) is not list or len(coefficients) != len(curves):
        raise ValueError('Native curve compiler returned an invalid batch')
    for points, pieces in zip(curves, coefficients):
        if type(pieces) is not list or len(pieces) != max(1, len(points) - 1):
            raise ValueError('Native curve compiler returned invalid intervals')
        if any(type(piece) is not list or len(piece) != 4 or not all(_number(v) for v in piece) for piece in pieces):
            raise ValueError('Native curve compiler returned invalid coefficients')
    return coefficients
