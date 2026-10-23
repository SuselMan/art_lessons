import json
import re
import subprocess
from pathlib import Path

root = Path.cwd()
round_dir = root / 'temp/wc-runs/search-round4'
state = []
for spec in sorted((round_dir/'candidates').glob('*.json')):
    candidate = json.loads(spec.read_text())
    ident = candidate['id']
    if ident in ('gentle-directional', 'gentle-turn-trail'):
        continue
    assert re.fullmatch(r'[a-z0-9-]+', ident)
    with (root/'temp/wc-logs'/f'search-round4-{ident}.log').open('w') as log:
        result = subprocess.run(['node', 'scripts/strokes/search_render.mjs',
                                 'temp/wc-runs/screen-inputs.json',
                                 str(round_dir/ident), str(spec)], stdout=log, stderr=subprocess.STDOUT)
    state.append({'id': ident, 'exitCode': result.returncode})
    (round_dir/'sweep-status.json').write_text(json.dumps(state, indent=2))
    print(json.dumps(state[-1]), flush=True)
