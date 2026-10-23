#!/usr/bin/env python3
"""Ilya's repeats painted by the #679 physics sandbox, into the strokes gallery
as one more version beside the engine's.

  sim_app.py [sheet ...]

Runs replay.mts per sheet (all slots), crops each slot out of the sim canvas,
scales it to the archive's 12 px/mm and records it under version SIM_ID.
"""
import datetime
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'scripts', 'strokes'))
import refs  # noqa: E402

SRC = open(os.path.join(HERE, '..', 'SOURCE')).read().split()[0]
SIM_ID = f'sim-{SRC}'
R, W = os.environ.get('SIM_R', '0.6'), os.environ.get('SIM_W', '0.6')


def main(sheets):
    a = refs.load()
    for s in a['sheets']:
        if sheets and s['id'] not in sheets:
            continue
        b = s.get('board') or {}
        if not b.get('room'):
            continue
        out = os.path.join(REPO, 'temp', 'wc-sim-replay', 'out', 'all', s['id'])
        env = dict(os.environ, DISPLAY=os.environ.get('DISPLAY', ':0'), SIM_R=R, SIM_W=W)
        subprocess.run(['npx', 'tsx', os.path.join(HERE, 'replay.mts'), s['id'], out], env=env, cwd=REPO, check=True)
        a = refs.load()  # re-read: keep whatever else changed meanwhile
        sh = next(x for x in a['sheets'] if x['id'] == s['id'])
        k = refs.PX_PER_MM / b['pxPerMm']
        for n, (x0, y0, x1, y1) in b['slots'].items():
            png = os.path.join(out, f'{n}.png')
            if not os.path.exists(png):
                continue
            rect = json.load(open(os.path.join(out, f'{n}.json')))['rect']
            crop = Image.open(png).convert('RGB').crop(tuple(round(v) for v in rect))
            crop = crop.resize((round((x1 - x0) * k), round((y1 - y0) * k)), Image.LANCZOS)
            dst = os.path.join(refs.ROOT, 'img', s['id'], f'{int(n):03d}-app-{SIM_ID}.jpg')
            crop.save(dst, quality=refs.JPEG_QUALITY)
            refs.stroke_of(sh, int(n)).setdefault('app', {})[SIM_ID] = {'src': refs.rel(dst), 'w': crop.width, 'h': crop.height}
        vs = a.setdefault('versions', [])
        if not any(x['id'] == SIM_ID for x in vs):
            vs.append({'id': SIM_ID, 'commit': SRC, 'date': datetime.date.today().isoformat(),
                       'subject': f'#679 физическая песочница (Curtis), кисть x{R}, вода x{W}', 'rendered': datetime.date.today().isoformat()})
        refs.save(a)
        print('sheet', s['id'], 'saved', flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
