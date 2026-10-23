import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageOps

p = Path('temp/wc-runs/search-round4')
tests = json.loads((p/'screen-inputs.json').read_text())['cases']
stats = []
for spec in sorted((p/'candidates').glob('*.json')):
    variant = json.loads(spec.read_text())['id']
    report = p/variant/'report.json'
    if not report.exists() or not json.loads(report.read_text()).get('complete'):
        continue
    canvas = Image.new('RGB', (1050, 240*len(tests)), 'white')
    draw = ImageDraw.Draw(canvas)
    for i, test in enumerate(tests):
        ident = test['id']
        images = [Image.open(Path('docs/reference/strokes')/test['reference']),
                  Image.open(p/'combined-gentle'/(ident+'.png')).crop(test['box']),
                  Image.open(p/variant/(ident+'.png')).crop(test['box'])]
        diff = np.abs(np.asarray(images[1].convert('RGB'), dtype=float)-np.asarray(images[2].convert('RGB'), dtype=float))
        stats.append({'variant': variant, 'case': ident, 'meanDifference': float(diff.mean()), 'maxDifference': float(diff.max())})
        for j, img in enumerate(images):
            img = ImageOps.contain(img.convert('RGB'), (330, 210))
            canvas.paste(img, (350*j+(350-img.width)//2, 240*i+25))
            draw.text((350*j+8, 240*i+5), ident+' '+['Photo','Parent',variant][j], fill='black')
    canvas.save(p/(variant+'-comparison.jpg'))
(p/'screen-differences.json').write_text(json.dumps(stats, indent=2))
print(json.dumps(stats, indent=2))
