"""Explicit trusted offline source-functional provider, never brush-selected.

The old mapped ARM provider is unchanged. Both feed the SAME compiled2/query
pipeline; this identity deliberately makes no ISA/vendor coefficient claim.
"""
import math
import re
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from native_curve_compile import _input
from native_curve_arm_v3 import _run, _decode, MAX_RESPONSE_BYTES

PROFILE='eigen-5.0.1-source-functional-f64-v1'
INPUT=MappingProxyType(dict(minimumKnots=2,maximumKnots=32,maximumCurves=64,
                           maximumTotalKnots=4096,cornerEndpoints=False))

@dataclass(frozen=True)
class SourceFunctionalCurveProvider:
    executable:str|Path
    expected_build_id:str

    def __post_init__(self):
        if not isinstance(self.executable,(str,Path)) or not Path(self.executable).is_absolute():
            raise ValueError('An explicit absolute source-functional compiler is required')
        if type(self.expected_build_id) is not str or not re.fullmatch(r'[a-f0-9]{64}',self.expected_build_id):
            raise ValueError('A trusted source-functional build ID is required')

    @property
    def profile(self):
        return PROFILE


def compile_source_functional_result(curves,provider):
    payload=_input(curves)
    for points in curves:
        if not 2<=len(points)<=32 or points[0][2] or points[-1][2]:
            raise ValueError('Unsupported source-functional curve grammar')
    if type(provider) is not SourceFunctionalCurveProvider:
        raise ValueError('An explicit trusted source-functional provider is required')
    description=_decode(_run(provider.executable,['--describe'],b'',timeout=3,maximum_output=4096))
    expected=dict(profile=PROFILE,buildId=provider.expected_build_id,input=dict(INPUT))
    if type(description) is not dict or description!=expected or set(description)!=set(expected) or type(description['input']) is not dict or any(type(description['input'][key]) is not type(value)for key,value in INPUT.items()):
        raise ValueError('Source-functional profile/build/grammar mismatch')
    response=_decode(_run(provider.executable,[],payload.encode('ascii'),timeout=15,maximum_output=MAX_RESPONSE_BYTES),coefficients=True)
    if type(response) is not dict or set(response)!={'profile','buildId','curves','panelProducts','panelWork'} or response['profile']!=PROFILE or response['buildId']!=provider.expected_build_id or type(response['curves']) is not list or len(response['curves'])!=len(curves):
        raise ValueError('Source-functional response identity mismatch')
    for name,maximum in [('panelProducts',65536),('panelWork',16*1024*1024)]:
        value=response[name]
        if type(value) not in (int,float) or not math.isfinite(value) or int(value)!=value or not 0<=value<=maximum:
            raise ValueError('Invalid source-functional work counters')
    for points,pieces in zip(curves,response['curves']):
        if type(pieces) is not list or len(pieces)!=len(points)-1 or any(type(piece) is not list or len(piece)!=4 or any(type(v) not in(int,float) or not math.isfinite(v)for v in piece)for piece in pieces):
            raise ValueError('Invalid source-functional coefficients')
    return response


def compile_source_functional_curves(curves,provider):
    return compile_source_functional_result(curves,provider)['curves']
