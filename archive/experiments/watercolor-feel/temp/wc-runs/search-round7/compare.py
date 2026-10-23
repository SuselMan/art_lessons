from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageOps

p = Path('temp/wc-runs/search-round7')
tests = {t['id']:t for t in json.loads((p/'inputs.json').read_text())['cases']}
comparisons = json.loads((p/'publish-config.json').read_text())['comparisons']
canvas = Image.new('RGB', (1050, 240*len(comparisons)), 'white')
draw = ImageDraw.Draw(canvas)
stats = []
for i, comparison in enumerate(comparisons):
    t = tests[comparison['case']]
    images = [Image.open(Path('docs/reference/strokes')/t['reference']),
              Image.open(p/comparison['baseline']/(t['id']+'.png')).crop(t['box']),
              Image.open(p/comparison['candidate']/(t['id']+'.png')).crop(t['box'])]
    diff = np.abs(np.asarray(images[1].convert('RGB'),dtype=float)-np.asarray(images[2].convert('RGB'),dtype=float))
    stats.append({'case':t['id'],'meanDifference':float(diff.mean()),'maxDifference':float(diff.max())})
    for j, img in enumerate(images):
        img = ImageOps.contain(img.convert('RGB'),(330,210))
        canvas.paste(img,(350*j+(350-img.width)//2,240*i+25))
        draw.text((350*j+8,240*i+5),t['id']+' '+['Photo',comparison['baseline'],comparison['candidate']][j],fill='black')
canvas.save(p/'comparison.jpg')
(p/'differences.json').write_text(json.dumps(stats,indent=2))
print(stats)
