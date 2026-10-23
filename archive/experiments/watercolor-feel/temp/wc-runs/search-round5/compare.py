from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageOps

p = Path('temp/wc-runs/search-round5')
tests = json.loads((p/'inputs.json').read_text())['cases']
parents = {'6': 'gentle-turn-trail', '2': 'combined-soft', '9': 'gentle-film-dose', '10': 'gentle-film-dose', '7': 'combined-gentle'}
stats = []
for variant in ['stack-gentle', 'stack-soft', 'stack-balanced']:
    canvas = Image.new('RGB', (1050, 240*len(tests)), 'white')
    draw = ImageDraw.Draw(canvas)
    for i, t in enumerate(tests):
        parent = parents[t['sheet']]
        images = [Image.open(Path('docs/reference/strokes')/t['reference']),
                  Image.open(p/parent/(t['id']+'.png')).crop(t['box']),
                  Image.open(p/variant/(t['id']+'.png')).crop(t['box'])]
        diff = np.abs(np.asarray(images[1].convert('RGB'), dtype=float)-np.asarray(images[2].convert('RGB'), dtype=float))
        stats.append({'case': t['id'], 'candidate': variant, 'parent': parent, 'meanDifference': float(diff.mean()), 'maxDifference': float(diff.max())})
        for j, img in enumerate(images):
            img = ImageOps.contain(img.convert('RGB'), (330, 210))
            canvas.paste(img, (350*j+(350-img.width)//2, 240*i+25))
            draw.text((350*j+8, 240*i+5), t['id']+' '+['Photo', parent, variant][j], fill='black')
    canvas.save(p/(variant+'-comparison.jpg'))
(p/'differences.json').write_text(json.dumps(stats, indent=2))
