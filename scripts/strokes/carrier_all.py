"""Render recorded reference slots chronologically in the isolated CPU model.

No engine changes. Different colours share water, but retain separate pigment
amounts. Operation timestamps approximate end times, with overlapping intervals
clamped to zero gap and reported explicitly.
"""
import argparse
from dataclasses import replace
import json
from pathlib import Path
import time

import numpy as np
from PIL import Image

from carrier import Brush, Carrier, Params, footprint
from carrier_replay import ROOT, RecordedClock, active_strokes, decode, paper_for


def mix_levels(preset):
    parts = (preset or '').split(':')
    return tuple(float(np.clip(float(parts[i]) / 100, 0, 1)) if len(parts) > i else 1. for i in (1, 2))


def group_gestures(ops):
    """Chunks carry elapsed time from the gesture start, not chunk-local time."""
    groups = []
    for op in ops:
        key = (op['userId'], op['layerId'], op.get('strokeId', op['id']))
        if groups and groups[-1][0] == key:
            groups[-1][1].append(op)
        else:
            groups.append((key, [op]))
    result = []
    for _, chunks in groups:
        ds = np.concatenate([decode(o) for o in chunks])
        if np.any(np.diff(ds[:, 9]) < 0):
            raise ValueError('Gesture chunks have reversed recorded time')
        result.append((chunks, ds))
    return result


def paint_components(mass, paper, colours):
    tau = -np.log(np.clip(np.asarray(colours), .02, 1))
    optical = np.einsum('khw,kc->hwc', mass, tau)
    rgb = (.975 + .025 * paper[..., None]) * np.exp(-optical)
    return Image.fromarray(np.round(255 * np.clip(rgb, 0, 1)).astype(np.uint8))


def simulate_sequence(ops, bounds, cell=2., dt=1/120, dry_seconds=45):
    colours = list(dict.fromkeys(tuple(op['color']) for op in ops))
    shape = (int(np.ceil((bounds[3]-bounds[1])/cell)), int(np.ceil((bounds[2]-bounds[0])/cell)))
    params = replace(Params(flow=3, brush_exchange=.6, brush_drag=.35),
                     flow=3*(2/cell)**2, diffusion=.12*(2/cell)**2)
    model = Carrier(paper_for(bounds, cell, shape), params, pigments=len(colours))
    area = np.pi * (42/cell)**2 * 1.4
    stock = np.zeros(2)
    brushes = []
    timeline = []
    reports = []
    previous_end = None

    def rest(seconds):
        for _ in range(round(seconds/dt)):
            if model.w.max() <= 1e-8:
                break
            model.step(dt)

    for chunks, dabs in group_gestures(ops):
        op = chunks[0]
        duration = float(dabs[-1, 9]) / 1000
        raw_gap = 0 if previous_end is None else (chunks[-1]['timestamp'] - previous_end)/1000-duration
        gap = max(0, raw_gap)
        rest(gap)
        water, pigment = mix_levels(op.get('preset'))
        loaded = np.zeros(len(colours))
        loaded[colours.index(tuple(op['color']))] = area*7*.65*pigment
        brush = Brush(area*7*water, np.zeros(len(colours)), area*7, loaded)
        stock += [brush.water, brush.loaded_pigment.sum()]
        brushes.append(brush)
        clock = RecordedClock(dt)
        previous = None
        samples = list(clock.feed(dabs)) + list(clock.finish())
        # A recorded zero-duration tap is one contact tick, explicitly reported.
        if not samples and len(dabs):
            samples = [dabs[-1]]
        for tick, dab in enumerate(samples):
            velocity = (0, 0) if previous is None else ((dab[0]-previous[0])/(cell*dt), (dab[1]-previous[1])/(cell*dt))
            contact = footprint(shape, (dab[0]-bounds[0])/cell, (dab[1]-bounds[1])/cell, dab[5]/(2*cell), dab[6], dab[7])
            contact *= np.clip(dab[2], 0, 1)
            model.step(dt, contact, velocity, brush)
            previous = dab
            if tick % 12 == 0:
                timeline.append(paint_components(model.p+model.d, model.paper, colours))
        reports.append({'seq': op['seq'], 'chunks': [o['seq'] for o in chunks], 'ticks': len(samples), 'waterLevel': water,
                        'pigmentLevel': pigment, 'gapSeconds': gap,
                        'overlappingTimestampSeconds': max(0, -raw_gap), 'zeroDurationTap': duration == 0})
        previous_end = chunks[-1]['timestamp']
    wet = paint_components(model.p+model.d, model.paper, colours)
    timeline.append(wet)
    rest(dry_seconds)
    remaining = float(model.w.sum())
    model.dry_all()
    totals = np.array(model.totals())
    for b in brushes:
        totals += [b.water, np.sum(b.pigment+b.loaded_pigment)]
    error = np.divide(totals-stock, stock, out=np.zeros(2), where=stock>0)
    report = {'operations': reports, 'initial': stock.tolist(), 'final': totals.tolist(),
              'relativeWaterError': float(error[0]), 'relativePigmentError': float(error[1]),
              'minimum': float(min(model.d.min(), *(min(b.water, float(np.min(b.pigment)), float(np.min(b.loaded_pigment))) for b in brushes))),
              'waterAtForcedDry': remaining, 'colours': colours, 'steps': model.steps}
    return paint_components(model.d, model.paper, colours), wet, timeline, report


def select_slots(sheet, ops):
    selected = {n: [] for n in sheet['board']['slots']}
    for chunks, ds in group_gestures(ops):
        x, y = np.median(ds[:, :2], axis=0)
        for n, box in sheet['board']['slots'].items():
            if box[0] <= x <= box[2] and box[1] <= y <= box[3]:
                selected[n].extend(chunks)
                break
    return selected


def render_sheet(sheet, dest):
    dest.mkdir(parents=True, exist_ok=True)
    room = sheet.get('board', {}).get('room', '').rstrip('/').split('/')[-1]
    source = ROOT/'temp/strokes-app'/f'ops_{room}.json'
    if not room or not source.exists():
        result = {'sheet': sheet['id'], 'status': 'no-recorded-room', 'strokes': []}
        (dest/'report.json').write_text(json.dumps(result, indent=2))
        return result
    selected = select_slots(sheet, active_strokes(json.loads(source.read_text())))
    reports = []
    for n, bounds in sheet['board']['slots'].items():
        output = dest/f'{int(n):03d}.png'
        cached = dest/f'{int(n):03d}-report.json'
        if output.exists() and cached.exists():
            reports.append(json.loads(cached.read_text()))
            continue
        ops = selected[n]
        if not ops:
            reports.append({'n': int(n), 'status': 'no-recorded-stroke'})
            continue
        if len({op['layerId'] for op in ops}) != 1:
            raise ValueError(f'Sheet {sheet["id"]} slot {n}: separate layers need separate state')
        start = time.monotonic()
        dry, wet, timeline, report = simulate_sequence(ops, bounds)
        size = (bounds[2]-bounds[0], bounds[3]-bounds[1])
        dry.resize(size, Image.Resampling.LANCZOS).save(output)
        wet.resize(size, Image.Resampling.LANCZOS).save(dest/f'{int(n):03d}-wet.png')
        frames = [im.resize(size) for im in timeline]
        frames[0].save(dest/f'{int(n):03d}-motion.gif', save_all=True, append_images=frames[1:], duration=100, loop=0)
        report.update(n=int(n), status='rendered', seconds=time.monotonic()-start)
        cached.write_text(json.dumps(report, indent=2))
        reports.append(report)
        print(f'Sheet {sheet["id"]} stroke {n}: {report["seconds"]:.1f}s errors {report["relativeWaterError"]:.2g}/{report["relativePigmentError"]:.2g}', flush=True)
    result = {'sheet': sheet['id'], 'status': 'rendered', 'strokes': reports,
              'params': {'cell': 2, 'dt': 1/120, 'flow': 3, 'exchange': .6, 'drag': .35,
                         'drySeconds': 45, 'nominalRadius': 42, 'concentration': .65},
              'timing': 'Operation timestamp treated as end; negative inter-operation gaps clamped to zero. This is a stand assumption, not a network contract.'}
    (dest/'report.json').write_text(json.dumps(result, indent=2))
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('output', type=Path)
    ap.add_argument('--sheets', nargs='*')
    args = ap.parse_args()
    for sheet in json.loads((ROOT/'docs/reference/strokes/archive.json').read_text())['sheets']:
        if not args.sheets or sheet['id'] in args.sheets:
            render_sheet(sheet, args.output/sheet['id'])


if __name__ == '__main__':
    main()
