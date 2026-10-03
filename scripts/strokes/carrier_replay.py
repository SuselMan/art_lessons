"""Recorded-dab replay for the isolated CPU carrier, never a room renderer."""
import argparse
import base64
import gzip
import json
from pathlib import Path
import struct
import time

import numpy as np
from PIL import Image

from carrier import Brush, Carrier, Params, footprint

ROOT = Path(__file__).resolve().parents[2]


class RecordedClock:
    """One-group lookahead; identical samples for any partition of input dabs.

    Dabs sharing a timestamp are sealed only when the next timestamp arrives.
    The final member defines that timestamp's footprint; no wall-clock/FPS input.
    """
    def __init__(self, dt=1 / 120):
        if not np.isfinite(dt) or dt <= 0:
            raise ValueError('Clock step must be finite and positive')
        self.dt = dt
        self.tick = 0
        self.pending = None
        self.previous = None

    def _seal(self):
        current = self.pending
        if self.previous is not None:
            start = self.previous
            span = current[9] - start[9]
            while self.tick * self.dt * 1000 < current[9] - 1e-8:
                alpha = max(0, min(1, (self.tick * self.dt * 1000 - start[9]) / span))
                dab = start + alpha * (current - start)
                angle = (current[7] - start[7] + np.pi) % (2 * np.pi) - np.pi
                dab[7] = start[7] + angle * alpha
                dab[9] = self.tick * self.dt * 1000
                self.tick += 1
                yield dab
        self.previous = current

    def feed(self, dabs):
        for dab in dabs:
            dab = np.array(dab, dtype=np.float64)
            if self.pending is not None:
                if dab[9] < self.pending[9]:
                    raise ValueError('Dab timestamps must be nondecreasing')
                if dab[9] > self.pending[9]:
                    yield from self._seal()
            self.pending = dab

    def finish(self):
        if self.pending is not None:
            yield from self._seal()


def decode(op):
    version, encoded = op['dabsPacked'].split(':', 1)
    if version != '1':
        raise ValueError('Unknown dab codec')
    return np.array(list(struct.iter_unpack('<10f', base64.b64decode(encoded))), dtype=np.float64)


def active_strokes(ops):
    # Enough operation semantics to select the current reference inputs. This
    # is not checkpoint/undo integration of the simulation into the engine.
    undone = {o['targetOpId'] for o in ops if o['type'] == 'operation_undo'}
    if any(o['type'] == 'operation_redo' for o in ops):
        raise ValueError('Redo input selection is not implemented in this stand')
    active = []
    for op in ops:
        if op['id'] in undone:
            continue
        if op['type'] == 'layer_clear':
            active = [o for o in active if o['layerId'] != op['layerId']]
        elif op['type'] == 'layer_delete':
            active = [o for o in active if o['layerId'] not in op['layerIds']]
        elif op['type'] == 'stroke' and op.get('tool') == 'watercolor':
            active.append(op)
    return active


def paper_for(bounds, cell, shape):
    path = ROOT / 'apps/web/public/paper'
    name = json.loads((path / 'manifest.json').read_text())['assets']['medium']['texture']
    raw = np.frombuffer(gzip.decompress((path / name).read_bytes()), dtype=np.uint8).reshape(2048, 2048)
    yy, xx = np.indices(shape)
    # Fixed world sampling of the existing CPU-baked paper. This optical
    # height proxy is not a measurement of hydraulic permeability.
    px = ((bounds[0] + (xx + .5) * cell) / 3508 * 2048).astype(int) % 2048
    py = ((bounds[1] + (yy + .5) * cell) / 2480 * 2048).astype(int) % 2048
    return raw[py, px].astype(np.float64) / 255


def simulate(op, bounds, cell=2., dt=1 / 120, batch=32, params=Params(), concentration=.65, dry_seconds=45, nominal_radius=42):
    if cell <= 0 or batch < 1 or nominal_radius <= 0 or concentration < 0 or dry_seconds < 0:
        raise ValueError('Invalid simulation dimensions, batch or brush stock')
    dabs = decode(op)
    shape = (int(np.ceil((bounds[3] - bounds[1]) / cell)), int(np.ceil((bounds[2] - bounds[0]) / cell)))
    from dataclasses import replace
    model = Carrier(paper_for(bounds, cell, shape), replace(params,
        flow=params.flow * (2 / cell) ** 2, diffusion=params.diffusion * (2 / cell) ** 2))
    # An explicit brush setting, fixed across all six strokes. Initial supply
    # must not depend on future pressure/radii or on the stroke's final length.
    area = np.pi * (nominal_radius / cell) ** 2 * 1.4
    brush = Brush(area * 7, 0, area * 7, area * 7 * concentration)
    initial = model.totals(brush)
    clock = RecordedClock(dt)
    previous = None
    snapshots = []
    def run(dab):
        nonlocal previous
        x, y = (dab[0] - bounds[0]) / cell, (dab[1] - bounds[1]) / cell
        velocity = (0, 0) if previous is None else ((dab[0] - previous[0]) / (cell * dt), (dab[1] - previous[1]) / (cell * dt))
        contact = footprint(shape, x, y, dab[5] / (2 * cell), dab[6], dab[7])
        contact *= max(0, min(1, dab[2]))
        model.step(dt, contact, velocity, brush)
        previous = dab
        if model.steps % 12 == 0:
            snapshots.append(model.p.copy() + model.d)
    for start in range(0, len(dabs), batch):
        for dab in clock.feed(dabs[start:start + batch]):
            run(dab)
    for dab in clock.finish():
        run(dab)
    wet = model.p.copy() + model.d
    snapshots.append(wet.copy())
    for _ in range(round(dry_seconds / dt)):
        if model.w.max() <= 1e-8:
            break
        model.step(dt)
    remaining_water = float(model.w.sum())
    model.dry_all()
    final = model.totals(brush)
    report = {'seq': op['seq'], 'dabs': len(dabs), 'ticks': clock.tick, 'steps': model.steps,
              'initial': initial, 'final': final, 'relativeWaterError': (final[0] - initial[0]) / initial[0],
              'relativePigmentError': (final[1] - initial[1]) / initial[1],
              'brushWaterLeft': brush.water, 'brushPigmentLeft': brush.pigment,
              'brushLoadedPigmentLeft': brush.loaded_pigment,
              'waterAtForcedDry': remaining_water, 'peakPigment': float(model.d.max()),
              'minimum': float(min(model.d.min(), brush.water, brush.pigment))}
    return model, wet, snapshots, report


def paint(mass, paper, colour, scale=1.):
    tau = -np.log(np.maximum(.02, np.minimum(1, colour)))
    rgb = (.975 + .025 * paper[..., None]) * np.exp(-scale * mass[..., None] * tau)
    return Image.fromarray(np.round(255 * np.clip(rgb, 0, 1)).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('output')
    ap.add_argument('--batch', type=int, default=32)
    ap.add_argument('--cell', type=float, default=2)
    ap.add_argument('--drag', type=float, default=.22)
    ap.add_argument('--concentration', type=float, default=.65)
    ap.add_argument('--optical-scale', type=float, default=1)
    ap.add_argument('--dry-seconds', type=float, default=45)
    ap.add_argument('--nominal-radius', type=float, default=42)
    ap.add_argument('--exchange', type=float, default=6)
    ap.add_argument('--flow', type=float, default=18)
    ap.add_argument('--strokes', type=int, nargs='*')
    args = ap.parse_args()
    dest = Path(args.output)
    dest.mkdir(parents=True, exist_ok=True)
    archive = json.loads((ROOT / 'docs/reference/strokes/archive.json').read_text())
    sheet = next(s for s in archive['sheets'] if s['id'] == '9')
    ops = active_strokes(json.loads((ROOT / 'temp/strokes-app/ops_Trf00NSq.json').read_text()))
    reports = []
    for n, box in sheet['board']['slots'].items():
        if args.strokes and int(n) not in args.strokes:
            continue
        matches = [o for o in ops if box[0] <= np.median(decode(o)[:, 0]) <= box[2] and box[1] <= np.median(decode(o)[:, 1]) <= box[3]]
        if len(matches) != 1:
            raise ValueError(f'Slot {n}: expected one current stroke, got {len(matches)}')
        op = matches[0]
        start = time.monotonic()
        model, wet, snapshots, report = simulate(op, box, args.cell, batch=args.batch,
                    params=Params(brush_drag=args.drag, brush_exchange=args.exchange, flow=args.flow), concentration=args.concentration,
                    dry_seconds=args.dry_seconds, nominal_radius=args.nominal_radius)
        report['seconds'] = time.monotonic() - start
        colour = np.array(op['color'])
        size = (box[2] - box[0], box[3] - box[1])
        paint(model.d, model.paper, colour, args.optical_scale).resize(size, Image.Resampling.LANCZOS).save(dest / f'{int(n):03d}.png')
        paint(wet, model.paper, colour, args.optical_scale).resize(size, Image.Resampling.LANCZOS).save(dest / f'{int(n):03d}-wet.png')
        np.savez_compressed(dest / f'{int(n):03d}-fields.npz', pigment=model.d, wet=wet, paper=model.paper)
        timeline = [paint(m, model.paper, colour, args.optical_scale).resize(size) for m in snapshots]
        if timeline:
            timeline[0].save(dest / f'{int(n):03d}-motion.gif', save_all=True, append_images=timeline[1:], duration=100, loop=0)
        reports.append(report)
        print(n, json.dumps(report), flush=True)
    (dest / 'report.json').write_text(json.dumps({'model': 'CPU carrier experiment, not Grafetto', 'params': vars(args), 'strokes': reports}, indent=2))


if __name__ == '__main__':
    main()
