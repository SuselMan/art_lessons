"""Resolve Krita's declared ABR collection and native sample name.

Krita bd6e8d0 kis_abr_brush_collection.cpp uses collectionStem_ordinal for
modern samples; legacy v2 may retain the record's Unicode name. Collections
are supplied resources, never guessed filesystem paths. Photoshop dynamics
are deliberately not used as Krita preset dynamics.
"""
import hashlib
import re
from pathlib import PurePosixPath
from PIL import Image, ImageOps

MAX_COLLECTION_BYTES = 128 * 1024 * 1024
MAX_COLLECTIONS = 16
MAX_RECORDS = 4096


def _selected_sample(data, collection_name, selector):
    # Lazy import avoids convert.py -> krita_import -> this module cycles.
    from convert import Reader, abr_sample, read_pixels
    if not isinstance(data, bytes) or not 4 <= len(data) <= MAX_COLLECTION_BYTES:
        raise ValueError('Declared ABR collection exceeds byte limit')
    reader = Reader(data)
    major, minor = reader.num('H'), reader.num('H')
    stem = PurePosixPath(collection_name).stem
    matches = []
    if major in (1, 2):
        if minor > MAX_RECORDS:
            raise ValueError('ABR record count exceeds limit')
        for ordinal in range(1, minor + 1):
            kind, size = reader.num('H'), reader.u32()
            record = Reader(reader.take(size))
            if kind != 2:
                continue
            record.take(4)
            record.num('H')  # Native tip selection does not replace KPP spacing.
            name = ''
            if major == 2:
                units = record.u32()
                if units > 1024:
                    # This record cannot match the bounded declared selector.
                    record.take(units * 2)
                    continue
                name = record.take(units * 2).decode('utf-16-be').rstrip('\0')
            name = name or stem + '_' + str(ordinal)
            if name != selector:
                continue
            record.take(9)
            top, left, bottom, right = [record.num('i') for _ in range(4)]
            depth, compression = record.num('H'), record.num('B')
            width, height = right - left, bottom - top
            pixels = read_pixels(record, width, height, depth, compression, max_side=2048, max_pixels=1048576)
            if record.pos != len(record.data):
                raise ValueError('Selected legacy ABR record has trailing bytes')
            matches.append((ordinal, 'legacy-' + str(ordinal - 1), Image.frombytes('L', (width, height), pixels)))
        if reader.pos != len(data):
            raise ValueError('Legacy ABR collection has trailing records')
    elif major in (6, 7, 9, 10) and minor in (1, 2):
        selected = re.fullmatch(re.escape(stem) + r'_([1-9][0-9]{0,3})', selector)
        if not selected:
            return None
        target = int(selected.group(1))
        if target > MAX_RECORDS:
            raise ValueError('Selected ABR ordinal exceeds limit')
        ordinal = 0
        while reader.pos < len(data):
            if reader.take(4) != b'8BIM':
                raise ValueError('Invalid declared ABR section')
            key, length = reader.take(4), reader.u32()
            body = Reader(reader.take(length))
            if key == b'samp':
                while body.pos < len(body.data):
                    ordinal += 1
                    if ordinal > MAX_RECORDS:
                        raise ValueError('ABR sample count exceeds limit')
                    length_record = body.u32()
                    item = body.take(length_record)
                    if ordinal == target:
                        sample_id, image = abr_sample(item, minor, max_side=2048, max_pixels=1048576, strict_record=True)
                        matches.append((ordinal, sample_id, image))
                    body.take((-length_record) % 4)
            if reader.pos < len(data):
                reader.take((-length) % 4)
    else:
        raise ValueError('Unsupported declared ABR collection version')
    if len(matches) > 1:
        raise ValueError('Ambiguous sample name inside declared ABR collection')
    if not matches:
        return None
    ordinal, sample_id, density = matches[0]
    if max(density.size) > 2048 or density.width * density.height > 1048576:
        raise ValueError('Selected Krita ABR tip exceeds original image limit')
    if not isinstance(sample_id, str) or not 1 <= len(sample_id) <= 256:
        raise ValueError('Invalid declared ABR sample identity')
    # Native converts Adobe density to an opaque inverse-gray MASK. Keep that
    # convention so the existing image_coverage and original image path apply.
    image = ImageOps.invert(density)
    proof = {'kind': 'krita-abr-sample-v1', 'collectionFilename': PurePosixPath(collection_name).name,
             'collectionSha256': hashlib.sha256(data).hexdigest(),
             'sampleOrdinal': ordinal, 'sampleId': sample_id, 'sampleName': selector,
             'width': image.width, 'height': image.height,
             'coverageSha256': hashlib.sha256(density.tobytes()).hexdigest()}
    return image, proof


def resolve_abr_tip(definition, resources):
    selector = definition.get('filename') or definition.get('name')
    if not isinstance(selector, str) or not 1 <= len(selector) <= 1024 or '\x00' in selector:
        raise ValueError('Missing declared Krita ABR sample name')
    candidates = [(name, payload) for name, payload in resources.items()
                  if isinstance(name, str) and PurePosixPath(name).suffix.lower() == '.abr']
    if not 1 <= len(candidates) <= MAX_COLLECTIONS:
        raise ValueError('Krita ABR tip requires bounded declared collection resources')
    matches, total, seen = [], 0, set()
    for name, payload in candidates:
        if not 1 <= len(name) <= 1024 or '\x00' in name:
            raise ValueError('Invalid declared ABR collection filename')
        data = payload() if callable(payload) else payload
        if not isinstance(data, bytes):
            raise ValueError('Declared ABR collection must contain original bytes')
        total += len(data)
        if total > MAX_COLLECTION_BYTES * 2:
            raise ValueError('Aggregate declared ABR collection byte limit')
        identity = (PurePosixPath(name).name, hashlib.sha256(data).hexdigest())
        if identity in seen:
            continue
        seen.add(identity)
        selected = _selected_sample(data, name, selector)
        if selected is not None:
            matches.append(selected)
    if not matches:
        raise ValueError('Declared Krita ABR sample was not found')
    if len(matches) != 1:
        raise ValueError('Ambiguous declared Krita ABR sample across collections')
    return matches[0]
