"""Recreate a previously certified viewer from a durable, SHA-bound package.

This verifies archival integrity; it does not replace original GPU certification.
No services, GPU, input conversions or algorithm execution.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from review_ui_payload import compact_ui_payload


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def render(package, output):
    package=Path(package).resolve();output=Path(output).resolve()
    manifest=json.loads((package/'viewer-manifest.json').read_text())
    def checked(name):
        path=package/name
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('Unsafe archived path')
        payload=path.read_bytes()
        if digest(payload)!=manifest['files'][name]:
            raise ValueError('Archived file SHA mismatch: '+name)
        return payload
    data=json.loads(checked('final-data.json'));template=checked('compare.html').decode()
    assert len(data['scenes'])==7 and len(data['variantCatalog'])==9
    keys={c['key']for c in data['variantCatalog']}
    output.mkdir(parents=True,exist_ok=True)
    for scene in data['scenes']:
        assert len(scene['variants'])==9 and {v['comparisonKey']for v in scene['variants']}==keys
        for variant in scene['variants']:
            name=variant['image'];payload=checked(name)
            if digest(payload)!=variant['imageSHA256']:
                raise ValueError('Variant PNG differs from certified record')
            target=output/name;target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():
                if digest(target.read_bytes())!=variant['imageSHA256']:
                    raise ValueError('Existing output image differs')
            else:
                try:os.link(package/name,target)
                except OSError:target.write_bytes(payload)
    raw=json.dumps(compact_ui_payload(data),ensure_ascii=False,separators=(',',':'))
    marker='/*DATA*/{"scenes":[]}'
    assert template.count(marker)==1
    html=template.replace(marker,raw.replace('<','\\u003c'))
    for name,payload in (('index.html',html),('comparison.json',raw)):
        target=output/name;tmp=target.with_name('.'+name+'.pending');tmp.write_text(payload);os.replace(tmp,target)
    return dict(scenes=7,choices=9,cells=63,htmlSHA256=digest(html.encode()))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args();print(json.dumps(render(args.package,args.output)))
