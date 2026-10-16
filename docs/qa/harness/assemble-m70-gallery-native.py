"""Assemble native-scale crops in archive geometry without resizing simulation inputs."""
import json
import sys
from pathlib import Path
from PIL import Image

work = Path(sys.argv[1])
archive = json.loads((work / 'archive-source.json').read_text())
output = work / 'output'
samples = work / 'samples'
for sheet in archive['sheets']:
    slots = [(s['n'], sheet['board']['slots'][str(s['n'])]) for s in sheet['strokes']
             if str(s['n']) in sheet.get('board', {}).get('slots', {})]
    if not slots:
        continue
    board = Image.new('RGBA', tuple(sheet['board']['roomPx']), 'white')
    reports = []
    for number, rect in slots:
        name = f'sample{sheet["id"]}-{number}'
        report = json.loads((samples / (name + '.json')).read_text())
        if report['gl'] or report['lost'] or report['errors'] or report['scale'] != 1:
            raise ValueError('Invalid native sample: ' + name)
        im = Image.open(samples / (name + '.png')).convert('RGBA')
        if im.size != (1024, 1024) or report['rect'] != rect:
            raise ValueError('Wrong sample geometry: ' + name)
        ox, oy = report['origin']
        box = (rect[0]-ox, rect[1]-oy, rect[2]-ox, rect[3]-oy)
        if min(box) < 0 or max(box) > 1024:
            raise ValueError('Crop outside native window')
        crop = im.transform((rect[2]-rect[0], rect[3]-rect[1]), Image.Transform.EXTENT,
                            box, resample=Image.Resampling.BICUBIC)
        board.paste(crop, (rect[0], rect[1]))
        reports.append(report)
    if len({r['inputSha'] for r in reports}) != 1:
        raise ValueError('Mixed sheet inputs')
    output.mkdir(exist_ok=True)
    board.save(output / f'sheet{sheet["id"]}.png')
    combined = {k: reports[0][k] for k in ('inputSha', 'renderer', 'model', 'scale')}
    combined.update(gl=0, lost=False, errors=[], renderMode='native-samples',
                    nativeSamples=len(reports), elapsedMs=sum(r['elapsedMs'] for r in reports),
                    samples=reports)
    (output / f'sheet{sheet["id"]}.json').write_text(json.dumps(combined, indent=2))
print('Assembled all native samples')
