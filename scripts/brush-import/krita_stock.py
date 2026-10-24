"""Reproduce the pinned official Krita stock catalog; no silent engine fallback."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import urllib.parse
import urllib.request
import zipfile
import subprocess
from contextlib import ExitStack
from brush_contract import Catalog
from krita_import import convert_krita

LOCK = Path(__file__).with_name('krita-stock-sources.json')


def verified_source(entry, commit, cache):
    relative = PurePosixPath(entry['path'])
    if relative.is_absolute() or '..' in relative.parts or '\\' in entry['path']:
        raise ValueError('Unsafe stock source path')
    target = cache.joinpath(*relative.parts)
    if target.exists():
        data = target.read_bytes()
    else:
        url = 'https://raw.githubusercontent.com/KDE/krita/'+commit+'/'+urllib.parse.quote(entry['path'], safe='/')
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(entry['bytes']+1)
    blob = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256'] or blob != entry['gitBlobSha1']:
        raise ValueError('Stock source integrity mismatch: '+entry['path'])
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return target


def build(lock, cache, output, include_legacy=False):
    catalog = Catalog(output)
    sources = []
    duplicates = []
    seen = set()
    # Loose installed presets resolve resources from installed default bundles.
    # Keep those bundles open while lazy readers serve the per-preset converter.
    with ExitStack() as stack:
        external = {}
        selected = [entry for entry in lock['files'] if entry['group']!='legacy' or include_legacy]
        paths = {entry['path']:verified_source(entry,lock['sourceCommit'],cache) for entry in selected}
        for entry in selected:
            path=paths[entry['path']]
            if path.suffix!='.bundle':
                continue
            archive=stack.enter_context(zipfile.ZipFile(path))
            for name in archive.namelist():
                if name.lower().endswith(('.gbr','.gih','.png','.pat','.jpg','.jpeg','.webp')):
                    external[path.name+'/'+name]=lambda z=archive,n=name:z.read(n)
        return _convert_selected(lock,output,include_legacy,catalog,sources,duplicates,seen,selected,paths,external)


def _convert_selected(lock,output,include_legacy,catalog,sources,duplicates,seen,selected,paths,external):
    for entry in selected:
        path = paths[entry['path']]
        before, skipped = len(catalog.brushes), len(catalog.skipped)
        convert_krita(path, catalog, external)
        incoming = catalog.brushes[before:]
        del catalog.brushes[before:]
        for brush in incoming:
            identity = (brush['descriptor']['id'], brush['descriptor']['version'])
            if identity in seen:
                duplicates.append({'source':entry['path'], 'name':brush['name'], 'id':identity[0]})
            else:
                seen.add(identity)
                catalog.brushes.append(brush)
        sources.append({**entry, 'imported':len(catalog.brushes)-before,
                        'skipped':len(catalog.skipped)-skipped})
    manifest = catalog.write()
    report = {'schemaVersion':1, 'kritaVersion':lock['kritaVersion'],
              'sourceCommit':lock['sourceCommit'], 'includeLegacy':include_legacy,
              'sources':sources, 'duplicates':duplicates,
              'imported':len(manifest['brushes']), 'skipped':manifest['skipped'],
              'assets':len(manifest['assets']),
              'fidelity':'Translation only; unsupported engines/tips are skipped. Imported presets retain compatibility warnings.'}
    (output/'stock-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--include-legacy', action='store_true')
    args = parser.parse_args()
    report = build(json.loads(LOCK.read_text()), args.cache, args.output, args.include_legacy)
    # Python parsing is not sufficient: validate recursive dual descriptors and
    # all asset references with the application's authoritative TS contract.
    subprocess.run(['node',str(Path(__file__).with_name('validate_catalog.mjs')),
                    str(args.output/'manifest.json'),str(args.output/'validation.json')],check=True)
    print(json.dumps({key:report[key] for key in ('imported','assets')}, ensure_ascii=False))
    print('Skipped:', len(report['skipped']))


if __name__ == '__main__':
    main()
