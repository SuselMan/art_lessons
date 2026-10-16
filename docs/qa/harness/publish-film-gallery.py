"""Crop hardware gallery exports, then atomically append an immutable version."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import shutil
from pathlib import Path

from PIL import Image


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def publish(work, base, source, version, model='front8-detail-flow-v3'):
    if model not in ('front8-detail-flow-v3', 'front8-detail-flow-v4', 'm70-r2-v1'):
        raise ValueError('Unsupported gallery model')
    archive = json.loads((work / 'archive-source.json').read_text())
    preview = 'gallery-' + version
    dest = base / 'previews' / preview
    stage = work / 'cropped'
    stage.mkdir(exist_ok=False)
    rows, reports, files = [], [], []
    for sheet in archive['sheets']:
        sid = str(sheet['id'])
        image = work / 'output' / ('sheet' + sid + '.png')
        if not image.exists():
            if sheet.get('board', {}).get('room'):
                raise ValueError('Missing sheet ' + sid)
            continue
        report = json.loads(image.with_suffix('.json').read_text())
        if report['gl'] or report['lost'] or report['errors']:
            raise ValueError('GPU failure on sheet ' + sid)
        if report['model'] != model or 'AMD' not in report['renderer']:
            raise ValueError('Wrong material or hardware on sheet ' + sid)
        if report['inputSha'] != sha(work / 'input' / ('ops_' + sid + '.json')):
            raise ValueError('Input changed on sheet ' + sid)
        im = Image.open(image).convert('RGBA')
        if model == 'm70-r2-v1' and report.get('renderMode') == 'native-samples':
            if report.get('scale') != 1 or report.get('nativeSamples') != len([st for st in sheet['strokes'] if str(st['n']) in sheet['board']['slots']]):
                raise ValueError('Incomplete native-scale samples')
        elif model == 'm70-r2-v1':
            expected_scale = 1024 / max(sheet['board']['roomPx'])
            if im.size != (1024, 1024) or abs(report.get('scale', 0) - expected_scale) > 1e-9:
                raise ValueError('Wrong M70 preview scale')
            width, height = sheet['board']['roomPx']
            im = im.crop((0, 0, 1024, round(height * expected_scale))).resize((width, height), Image.Resampling.LANCZOS)
        if list(im.size) != sheet['board']['roomPx']:
            raise ValueError('Wrong sheet dimensions ' + sid)
        white = Image.new('RGBA', im.size, 'white')
        im = Image.alpha_composite(white, im).convert('RGB')
        scale = 12 / sheet['board']['pxPerMm']
        row = {'id': sheet['id'], 'strokes': []}
        for stroke in sheet['strokes']:
            rect = sheet['board']['slots'].get(str(stroke['n']))
            if not rect:
                continue
            if not (0 <= rect[0] < rect[2] <= im.width and 0 <= rect[1] < rect[3] <= im.height):
                raise ValueError('Slot outside sheet ' + sid)
            crop = im.crop(rect)
            crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
            rel = f'img/{sid}/{stroke["n"]:03d}.jpg'
            target = stage / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            crop.save(target, quality=92)
            frame = {'src': 'preview/' + preview + '/' + rel, 'w': crop.width, 'h': crop.height}
            row['strokes'].append({'n': stroke['n'], 'app': {version: frame}})
            files.append({'src': frame['src'], 'sha256': sha(target), 'w': crop.width, 'h': crop.height})
        rows.append(row)
        reports.append({'sheet': sid, **report})
    if len(rows) != 11 or len(files) != 85:
        raise ValueError(f'Incomplete gallery: {len(rows)} sheets / {len(files)} crops')
    native = model == 'm70-r2-v1' and all(r.get('renderMode') == 'native-samples' for r in reports)
    if native and any(r.get('scale') != 1 for r in reports):
        raise ValueError('Mixed native scales')
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    entry = {'id': version, 'commit': source, 'date': now[:10], 'rendered': now,
             'subject': ('М70 R2 — исходный масштаб, выбранные настройки' if native else 'М70 R2 — выбранные настройки; предпросмотр 1024px' if model == 'm70-r2-v1' else 'v4 — вариант Г: плотное начало, прозрачнее хвост; текущий Grafetto QA' if model.endswith('v4') else 'v3 — ускоренная цветовая плёнка; текущий Grafetto QA'),
             'scope': ('Исходный масштаб кисти и полей; каждый образец с пересекающимися мазками рассчитан отдельно в окне1024px, без уменьшения; архивные цвета и дозировки. Параметры эффекта утверждены16.10.' if native else f'М70 R2; AMD hardware; лист уменьшен до 1024px, затем кадры увеличены для сравнения. Цвета и дозировки архивные, параметры эффекта утверждены 16.10. Не точный replay исходного разрешения и не замер скорости.' if model == 'm70-r2-v1' else f'Сохранённые журналы пересчитаны {model}; AMD hardware; не замер отзывчивости Samsung.')}
    manifest = {'source': source, 'version': version, 'model': model,
                'count': len(files), 'reports': reports, 'files': files,
                'replayPolicy': ('M70: native scale1; translation only; overlapping samples grouped; per-sample1024 window; preserved archive doses; ordered Dry; full idle' if native else 'M70: spatial scale 1024/max(page); archive stroke timestamps >=2026-10-06 UTC; 20ms per operation; preserved colours/doses; versioned presets; no images; ordered Dry; full idle' if model == 'm70-r2-v1' else '400ms per operation; versioned watercolor presets; no image imports; ordered Dry and canonical idle')}
    (stage / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    # Build all assets before locking publication. Preserve the existing overlay verbatim in backup.
    with (base / 'update.lock').open('a') as update, (base / 'data/comments.lock').open('a') as comments:
        fcntl.flock(update, fcntl.LOCK_EX)
        fcntl.flock(comments, fcntl.LOCK_EX)
        overlay_path = base / 'data/rendered.json'
        old_bytes = overlay_path.read_bytes()
        overlay = json.loads(old_bytes)
        if dest.exists() or any(v['id'] == version for v in overlay['versions']):
            raise ValueError('Immutable gallery version already exists')
        comments_sha = sha(base / 'data/comments.json')
        backup = base / 'data/backups' / ('rendered-before-' + version + '.json')
        backup.parent.mkdir(exist_ok=True)
        if backup.exists():
            raise ValueError('Backup already exists')
        backup.write_bytes(old_bytes)
        shutil.copytree(stage, dest)
        overlay['versions'].append(entry)
        overlay['sheets'].extend(rows)
        temp = overlay_path.with_suffix('.json.tmp')
        temp.write_text(json.dumps(overlay, ensure_ascii=False, indent=1) + '\n')
        os.replace(temp, overlay_path)
        if sha(base / 'data/comments.json') != comments_sha:
            raise ValueError('Comments changed during publication')
    manifest['commentsShaUnchanged'] = comments_sha
    (work / 'published.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'version': version, 'sheets': len(rows), 'images': len(files), 'commentsUnchanged': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('work', type=Path)
    parser.add_argument('base', type=Path)
    parser.add_argument('source')
    parser.add_argument('version')
    parser.add_argument('--model', default='front8-detail-flow-v3')
    args = parser.parse_args()
    publish(args.work, args.base, args.source, args.version, args.model)
