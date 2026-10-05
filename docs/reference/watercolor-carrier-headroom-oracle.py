"""Replay field-op1 fit from frozen GPU base/film snapshots (NumPy)."""
import json
import sys
from pathlib import Path
import numpy as np

folder = Path(sys.argv[1])
for row in json.loads((folder / 'report.json').read_text()):
    tag = row['variant']
    f = row['fields']['finish1-tile0-inkLoad']
    shape = (f['h'], f['w'], 4)
    def read(name):
        return np.frombuffer((folder / f'{tag}-finish1-tile0-{name}.rgba').read_bytes(), np.uint8).reshape(shape)
    base, film, actual = read('inkBase'), read('strokeInk'), read('inkLoad')
    raw = (base.astype(np.float64) + film.astype(np.float64)) / 255
    peak = raw.max(axis=2, keepdims=True)
    predicted = np.floor(raw / np.maximum(1, peak) * 255 + .5).clip(0, 255).astype(np.uint8)
    delta = np.abs(predicted.astype(int) - actual.astype(int))
    assert delta.max() <= 1
    print(json.dumps({'variant': tag, 'maxCodeDifference': int(delta.max()),
        'overflowPixels': int((peak > 1).sum()), 'sourcePigment': int(film[:, :, 2].sum()),
        'basePigment': int(base[:, :, 2].sum()), 'recombinedPigment': int(actual[:, :, 2].sum())}))
