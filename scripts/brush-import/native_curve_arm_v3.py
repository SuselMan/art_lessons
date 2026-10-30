"""Explicit trusted offline mapped-ARM provider. No importer/profile activation.

Raw points bind coefficients; executable/profile/build identity comes from trusted
configuration, never from a brush or portable bundle. Old3.4 provider is separate.
"""
import json
import math
import os
import re
import selectors
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

from native_curve_compile import _input

PROFILE = 'eigen-5.0.1-mapped-arm64-f64-v3'
INPUT = MappingProxyType({'minimumKnots': 2, 'maximumKnots': 9, 'maximumCurves': 64,
         'maximumTotalKnots': 4096, 'cornerEndpoints': False})
MAX_RESPONSE_BYTES = 128 * 1024
MAX_ERROR_BYTES = 16 * 1024


@dataclass(frozen=True)
class MappedCurveProvider:
    executable: str | Path
    expected_build_id: str

    def __post_init__(self):
        if not isinstance(self.executable, (str, Path)) or not Path(self.executable).is_absolute():
            raise ValueError('An explicit absolute mapped curve compiler is required')
        if type(self.expected_build_id) is not str or not re.fullmatch(r'[0-9a-f]{64}', self.expected_build_id):
            raise ValueError('A trusted mapped compiler build ID is required')

    @property
    def profile(self):
        return PROFILE


def _run(executable, arguments, payload, *, timeout, maximum_output):
    """Bound all three pipes concurrently and reap only this owned child."""
    process = None
    selector = selectors.DefaultSelector()
    stdout, stderr = bytearray(), bytearray()
    try:
        process = subprocess.Popen([str(executable), *arguments], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
        for stream in (process.stdin, process.stdout, process.stderr):
            os.set_blocking(stream.fileno(), False)
        selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
        selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
        if payload:
            selector.register(process.stdin, selectors.EVENT_WRITE, 'stdin')
        else:
            process.stdin.close()
        position, deadline = 0, time.monotonic() + timeout
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError('Mapped curve compiler timed out')
            for key, _ in selector.select(min(remaining, .2)):
                if key.data == 'stdin':
                    try:
                        position += os.write(key.fd, payload[position:position + 65536])
                    except BrokenPipeError:
                        position = len(payload)
                    except BlockingIOError:
                        continue
                    if position == len(payload):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                    continue
                try:
                    chunk = os.read(key.fd, 65536)
                except BlockingIOError:
                    continue
                if not chunk:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                output, limit = (stdout, maximum_output) if key.data == 'stdout' else (stderr, MAX_ERROR_BYTES)
                if len(output) + len(chunk) > limit:
                    raise ValueError('Mapped curve compiler output exceeds budget')
                output.extend(chunk)
        try:
            code = process.wait(timeout=max(.001, deadline - time.monotonic()))
        except subprocess.TimeoutExpired as error:
            raise ValueError('Mapped curve compiler timed out') from error
        if code:
            detail = stderr.decode('ascii', errors='replace').strip()
            if re.fullmatch(r'unsupported-source-branch:[a-z0-9-]{1,120}', detail):
                raise ValueError(detail)
            raise ValueError('Mapped curve compiler failed')
        if stderr:
            raise ValueError('Unexpected mapped curve compiler diagnostics')
        return bytes(stdout)
    except OSError as error:
        raise ValueError('Mapped curve compiler failed') from error
    finally:
        selector.close()
        if process is not None:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=2)
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream is not None and not stream.closed:
                    stream.close()


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate mapped response key')
        result[key] = value
    return result


def _nonfinite(_):
    raise ValueError('Nonfinite mapped response')


def _decode(raw, *, coefficients=False):
    try:
        # Integer coefficient tokens include -0; parse them as binary64 too.
        return json.loads(raw.decode('ascii'), object_pairs_hook=_object,
                          parse_constant=_nonfinite, parse_int=float if coefficients else int)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError('Invalid mapped curve compiler response') from error


def _description(provider):
    raw = _run(provider.executable, ['--describe'], b'', timeout=3, maximum_output=4096)
    value = _decode(raw)
    expected = {'profile': PROFILE, 'buildId': provider.expected_build_id, 'input': dict(INPUT)}
    if type(value) is not dict or set(value) != set(expected) or value != expected:
        raise ValueError('Mapped compiler profile/build identity differs')
    if type(value['input']) is not dict or any(type(value['input'][key]) is not type(item) for key, item in INPUT.items()):
        raise ValueError('Mapped compiler input grammar differs')


def compile_curves_arm_v3(curves, provider):
    """Return exact supplied-profile polynomials or fail before admission.

    Valid grammar is separate from the runtime supported branch domain: a valid
    2..9-knot curve can be rejected by a closed Eigen branch guard. Never fallback.
    """
    payload = _input(curves)
    for points in curves:
        if not 2 <= len(points) <= 9 or points[0][2] or points[-1][2]:
            raise ValueError('Unsupported mapped curve grammar')
    if type(provider) is not MappedCurveProvider:
        raise ValueError('An explicit trusted mapped provider is required')
    _description(provider)
    value = _decode(_run(provider.executable, [], payload.encode('ascii'), timeout=15,
                         maximum_output=MAX_RESPONSE_BYTES), coefficients=True)
    if (type(value) is not dict or set(value) != {'profile', 'buildId', 'curves'}
            or value['profile'] != PROFILE or value['buildId'] != provider.expected_build_id
            or type(value['curves']) is not list or len(value['curves']) != len(curves)):
        raise ValueError('Mapped compiler profile/build response differs')
    coefficients = value['curves']
    for points, pieces in zip(curves, coefficients):
        if type(pieces) is not list or len(pieces) != len(points) - 1:
            raise ValueError('Invalid mapped coefficient intervals')
        for piece in pieces:
            if (type(piece) is not list or len(piece) != 4
                    or any(type(number) not in (int, float) or not math.isfinite(number) for number in piece)):
                raise ValueError('Invalid mapped coefficients')
    return coefficients
