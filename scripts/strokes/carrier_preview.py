"""Build a separate comparison page; never register CPU renders as engine versions."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('renders', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()
    dest = args.output
    dest.mkdir(parents=True, exist_ok=True)
    archive = json.loads((ROOT / 'docs/reference/strokes/archive.json').read_text())
    sheet = next(s for s in archive['sheets'] if s['id'] == '9')
    digest = hashlib.sha256()
    for name in ['carrier.py', 'carrier_replay.py']:
        digest.update((Path(__file__).parent / name).read_bytes())
    digest.update((args.renders / 'report.json').read_bytes())
    version = 'cpu-carrier-' + digest.hexdigest()[:12]
    rows = []
    for stroke in sheet['strokes']:
        n = stroke['n']
        names = {'photo': f'{n:03d}-photo.jpg', 'before': f'{n:03d}-before.jpg',
                 'after': f'{n:03d}.png', 'motion': f'{n:03d}-motion.gif', 'wet': f'{n:03d}-wet.png'}
        for key, src in [('photo', stroke['dry']['src']), ('before', stroke['app']['0a78ab53']['src'])]:
            shutil.copyfile(ROOT / 'docs/reference/strokes' / src, dest / names[key])
        for key in ['after', 'motion', 'wet']:
            shutil.copyfile(args.renders / names[key], dest / names[key])
        rows.append({'n': n, **names})
    shutil.copyfile(args.renders / 'report.json', dest / 'report.json')
    template = (Path(__file__).parent / 'carrier_preview.html').read_text()
    (dest / 'index.html').write_text(template.replace('__DATA__', json.dumps(rows)).replace('__VERSION__', json.dumps(version)))
    print(version)


if __name__ == '__main__':
    main()
