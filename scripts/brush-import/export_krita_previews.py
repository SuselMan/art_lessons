"""Preserve original preset artwork from the pinned stock sources, without preset XML."""
import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path
from PIL import Image
from krita_stock import LOCK, verified_source


def export(catalog, cache, output):
    lock = json.loads(LOCK.read_text())
    payloads = {}
    for entry in lock['files']:
        if entry['group'] != 'default':
            continue
        source = verified_source(entry, lock['sourceCommit'], cache)
        if source.suffix == '.bundle':
            with zipfile.ZipFile(source) as archive:
                for name in archive.namelist():
                    if name.lower().endswith('.kpp'):
                        payloads.setdefault(Path(name).name, archive.read(name))
        elif source.suffix == '.kpp':
            payloads[source.name] = source.read_bytes()
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for brush in json.loads(catalog.read_text())['brushes']:
        with Image.open(io.BytesIO(payloads[brush['source']])) as image:
            image.load()
            clean = Image.new('RGBA', image.size)
            clean.paste(image.convert('RGBA'))
            filename = brush['descriptor']['id'] + '.png'
            target = output / filename
            clean.save(target, optimize=True)
        records.append(dict(file=filename, name=brush['name'], source=brush['source'],
                            sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (output / 'index.json').write_text(json.dumps(dict(sourceCommit=lock['sourceCommit'], previews=records), ensure_ascii=False, indent=2) + '\n')
    return len(records)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--cache', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(export(args.catalog, args.cache, args.output))
