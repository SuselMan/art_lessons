import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path('temp/contact-budget/load-results')
off = np.asarray(Image.open(root / 'off.png').convert('RGBA')).astype(np.int16)
on = np.asarray(Image.open(root / 'on.png').convert('RGBA')).astype(np.int16)
assert off.shape == on.shape == (2480, 1754, 4), off.shape
delta = np.abs(off - on)
rgb = off[:, :, :3]
colored = (rgb.max(axis=2) - rgb.min(axis=2) > 25) & (rgb.min(axis=2) < 230)
result = {'shape': list(off.shape), 'differentPixels': int(np.count_nonzero(delta.max(axis=2))),
          'maxChannelDelta': int(delta.max()), 'coloredPixels': int(np.count_nonzero(colored))}
result['pass'] = result['differentPixels'] == 0 and result['coloredPixels'] > 1000
(root / 'comparison.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
assert result['pass'], 'Nonempty full-image parity gate failed'
