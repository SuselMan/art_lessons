"""Build display-only bidirectional flow for captured wet/dry layer PNGs.

Usage: flow.py <directory containing cases.json and wet/dry PNGs>
Requires numpy, Pillow and OpenCV in a separate development venv.
The captured endpoints are never modified. This is an offline presentation
experiment, not a water/pigment simulation or an engine dependency.
"""
import hashlib
import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image


def feature(image):
    rgba = np.asarray(image.convert('RGBA'), dtype=np.float32) / 255
    ink = (1 - rgba[:, :, :3].mean(axis=2)) * rgba[:, :, 3]
    positive = ink[ink > .025]
    scale = float(np.percentile(positive, 85)) if positive.size else 1
    return cv2.GaussianBlur(np.clip(ink / max(scale, .05), 0, 1), (0, 0), 1.5)


def build(root):
    manifest = json.loads((root / 'cases.json').read_text())
    for case in manifest['cases']:
        wet, dry = [Image.open(root / case[k]).convert('RGBA') for k in ('wet', 'dry')]
        if wet.size != dry.size:
            raise ValueError('Mismatched endpoint dimensions')
        w, h = wet.size
        # Flow is deliberately low frequency: avoid moving individual paper grains.
        factor = min(1, 512 / max(w, h))
        size = (max(2, round(w * factor)), max(2, round(h * factor)))
        a, b = [cv2.resize(feature(im), size) * 255 for im in (wet, dry)]
        forward = cv2.calcOpticalFlowFarneback(a, b, None, .5, 4, 25, 5, 7, 1.5, 0)
        backward = cv2.calcOpticalFlowFarneback(b, a, None, .5, 4, 25, 5, 7, 1.5, 0)
        yy, xx = np.mgrid[:size[1], :size[0]].astype(np.float32)
        for name, flow, reverse, image in (
            ('forward', forward, backward, a), ('backward', backward, forward, b),
        ):
            peer = cv2.remap(reverse, xx + flow[:, :, 0], yy + flow[:, :, 1], cv2.INTER_LINEAR)
            error = np.linalg.norm(flow + peer, axis=2)
            confidence = np.exp(-error * error / 4) * np.clip(image / 35, 0, 1)
            flow = cv2.resize(flow / factor, (96, 96))
            confidence = cv2.resize(confidence, (96, 96))
            # Smooth, bounded displacement. Only coloured regions may move.
            flow = np.clip(flow, -16, 16)
            packed = np.empty((96, 96, 4), dtype=np.uint8)
            packed[:, :, :2] = np.rint((flow / 16 + 1) * 127.5).astype(np.uint8)
            packed[:, :, 2] = np.rint(confidence * 255).astype(np.uint8)
            packed[:, :, 3] = 255
            filename = f"{case['id']}-{name}.png"
            Image.fromarray(packed).save(root / filename)
            case[name] = filename
        case['size'] = [w, h]
        case['flowRange'] = 16
        case['endpointSha256'] = {
            k: hashlib.sha256((root / case[k]).read_bytes()).hexdigest() for k in ('wet', 'dry')
        }
    (root / 'cases.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    build(Path(sys.argv[1]))
