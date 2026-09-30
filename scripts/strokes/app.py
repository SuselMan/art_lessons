#!/usr/bin/env python3
"""Ilya's repeats in Grafetto, beside the photos, per engine version (#536).

  app.py [sheet ...]

For each sheet with a room (archive.json `board.room`): the room's operation
log is pulled from prod, rendered clean by this checkout's engine
(app_render.mjs, on the local dev stack), and each stroke's repeat is cut out
of its slot on the board (`board.slots`, room pixels) at the archive's
12 px/mm. The version is the last commit that touched the engine or the
shared op types - two renders of the same version are the same picture (the
replay is deterministic), so a version is rendered once and kept.

  archive.json  versions: [{id, commit, date, subject}]
                strokes[].app: {<version id>: {src, w, h}}
"""
import datetime
import json
import os
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import refs  # noqa: E402

REPO = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
WORK = os.path.join(REPO, 'temp', 'strokes-app')
KEY = os.path.expanduser('~/projects/pencil/temp/deploy_key/id_ed25519')
HOST = 'deploy@80.209.232.109'


def version():
    if os.environ.get('STROKES_VERSION'):
        # A working-tree render, to iterate before committing: not a version
        # of record (do not commit its images).
        v = os.environ['STROKES_VERSION']
        return {'id': v, 'commit': v, 'date': datetime.date.today().isoformat(), 'subject': 'working tree'}
    h, date, subj = subprocess.check_output(
        ['git', '-C', REPO, 'log', '-1', '--format=%h%x09%cs%x09%s', '--', 'apps/web/src/engine', 'packages/shared/src'],
        text=True).strip().split('\t', 2)
    return {'id': h, 'commit': h, 'date': date, 'subject': subj}


def pull(room, out):
    sql = f'select coalesce(jsonb_agg(data order by seq),\'[]\') from "Operation" where "roomId"=\'{room}\''
    cmd = f"docker exec art-lessons-postgres-1 psql -U art_lessons -d art_lessons -P pager=off -At -c {json.dumps(sql)}"
    with open(out, 'w') as f:
        subprocess.check_call(['ssh', '-i', KEY, HOST, cmd], stdout=f)


def main(sheets):
    os.makedirs(WORK, exist_ok=True)
    v = version()
    a = refs.load()
    for s in a['sheets']:
        if sheets and s['id'] not in sheets:
            continue
        b = s.get('board') or {}
        if not b.get('room'):
            continue
        room = b['room'].rstrip('/').split('/')[-1]
        ops = os.path.join(WORK, f'ops_{room}.json')
        pull(room, ops)
        png = os.path.join(WORK, f'render_{s["id"]}_{v["id"]}.png')
        env = dict(os.environ, DISPLAY=os.environ.get('DISPLAY', ':0'))
        print(s['id'], subprocess.check_output(['node', os.path.join(os.path.dirname(__file__), 'app_render.mjs'), ops, png], env=env, text=True).strip(), flush=True)
        im = Image.open(png).convert('RGB')
        k = refs.PX_PER_MM / b['pxPerMm']
        for n, (x0, y0, x1, y1) in b['slots'].items():
            st = refs.stroke_of(s, int(n))
            crop = im.crop((x0, y0, x1, y1))
            crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
            out = os.path.join(refs.ROOT, 'img', s['id'], f'{int(n):03d}-app-{v["id"]}.jpg')
            crop.save(out, quality=refs.JPEG_QUALITY)
            st.setdefault('app', {})[v['id']] = {'src': refs.rel(out), 'w': crop.width, 'h': crop.height}
    vs = a.setdefault('versions', [])
    if not any(x['id'] == v['id'] for x in vs):
        vs.append(dict(v, rendered=datetime.date.today().isoformat()))
    refs.save(a)


if __name__ == '__main__':
    main(sys.argv[1:])
