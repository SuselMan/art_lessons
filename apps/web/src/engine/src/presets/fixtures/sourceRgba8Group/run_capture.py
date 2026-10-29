"""Run the bounded offline native fixture; authored requests are not a PRNG trace."""
from pathlib import Path
import json
import subprocess
import sys

here = Path(__file__).parent
requests = json.loads((here/'requests.json').read_text())
tokens = []
def bounds(r): return [r['x'], r['y'], r['width'], r['height']]
for case in requests['cases']:
    d = case['destination']
    tokens += [case['name'], *bounds(d), *bytes.fromhex(d['pixelsHex']), len(case['particles'])]
    for p in case['particles']:
        m = p['material']
        material = list(bytes.fromhex(m['pixelsHex'])) if m['kind'] == 'pixels' else m['color'] * (p['width'] * p['height'])
        coverage = list(bytes.fromhex(p['coverageHex'])) if 'coverageHex' in p else [255] * (p['width'] * p['height'])
        tokens += [*bounds(p), p['opacity'], *material, m.get('alphaOverride', -1), *coverage]
    group = case.get('groupBounds')
    tokens += [1, *bounds(group)] if group is not None else [0]
    outer = case['outer']
    tokens += [['over', 'add', 'alphaDarken'].index(outer['mode']), outer['opacity'], outer.get('flow', 1), outer.get('averageOpacity', outer['opacity'])]
result = subprocess.run([sys.argv[1]], input=' '.join(map(str, tokens)), capture_output=True, text=True, check=True)
Path(sys.argv[2]).write_text(result.stdout)
