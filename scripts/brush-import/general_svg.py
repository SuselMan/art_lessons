"""Closed offline vector subset. No importer authorization is implied by a PNG."""
import hashlib
import json
import math
import os
import re
import selectors
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PROFILE = 'librsvg-gray-vector-subset-v1'
MAX_INPUT = 256 * 1024
NS = 'http://www.w3.org/2000/svg'
ELEMENTS = {'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'use', 'symbol', 'mask'}
COMMON = {'id', 'transform', 'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'mask', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit'}
ATTRS = {
    'svg': {'viewBox', 'width', 'height', 'preserveAspectRatio'}, 'g': set(), 'defs': set(),
    'path': {'d'}, 'rect': {'x', 'y', 'width', 'height', 'rx', 'ry'},
    'circle': {'cx', 'cy', 'r'}, 'ellipse': {'cx', 'cy', 'rx', 'ry'},
    'line': {'x1', 'x2', 'y1', 'y2'}, 'polyline': {'points'}, 'polygon': {'points'},
    'linearGradient': {'x1', 'x2', 'y1', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href'},
    'radialGradient': {'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'href'},
    'stop': {'offset', 'stop-color', 'stop-opacity'}, 'clipPath': {'clipPathUnits'},
    'use': {'href', 'x', 'y', 'width', 'height'},
    'symbol': {'viewBox', 'preserveAspectRatio'},
    'mask': {'x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits', 'mask-type'},
}
NUMBER = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?')
REF = re.compile(r'url\(\s*#([A-Za-z_][A-Za-z0-9_.-]{0,63})\s*\)')


def sanitize_svg(original: bytes):
    if not 0 < len(original) <= MAX_INPUT:
        raise ValueError('SVG input size')
    text = original.decode('utf-8', 'strict')
    if '<!' in text or '<?' in text or '\x00' in text:
        raise ValueError('Declarations/entities/processing instructions forbidden')
    root = ET.fromstring(text)
    if root.tag != '{' + NS + '}svg':
        raise ValueError('SVG namespace/root required')
    nodes, ids, edges = [], {}, {}
    stack = [(root, 1)]
    commands, node_costs = 0, {}
    while stack:
        node, depth = stack.pop()
        tag = node.tag.removeprefix('{' + NS + '}')
        if depth > 32 or len(nodes) >= 4096 or tag not in ELEMENTS:
            raise ValueError('SVG element/depth/count')
        if node.text and node.text.strip() or node.tail and node.tail.strip():
            raise ValueError('Text/font content forbidden')
        nodes.append(node)
        references = []
        node_cost = 1
        attributes = list(node.attrib.items())
        if 'href' in node.attrib and '{http://www.w3.org/1999/xlink}href' in node.attrib:
            raise ValueError('Duplicate SVG href')
        for raw_key, value in attributes:
            key = 'href' if raw_key == '{http://www.w3.org/1999/xlink}href' else raw_key
            if key not in COMMON | ATTRS[tag] or len(value) > 65536:
                raise ValueError('SVG attribute not allowed')
            if key == 'id':
                if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]{0,63}', value) or value in ids:
                    raise ValueError('SVG id')
                ids[value] = node
            if key == 'href':
                if not re.fullmatch(r'#[A-Za-z_][A-Za-z0-9_.-]{0,63}', value):
                    raise ValueError('Only local SVG href allowed')
                references.append(value[1:])
                if raw_key != key:
                    del node.attrib[raw_key]
                    node.set(key, value)
            # Only entire local paint/clip references; no CSS or URL syntax elsewhere.
            elif 'url' in value.lower():
                match = REF.fullmatch(value)
                if key not in {'fill', 'stroke', 'clip-path', 'mask'} or not match:
                    raise ValueError('External/complex reference forbidden')
                references.append(match.group(1))
            elif any(c in value for c in [';', '{', '}', '<', '>', '\\', ':', '&']):
                raise ValueError('CSS/external syntax forbidden')
            for number in NUMBER.findall(value):
                if not math.isfinite(float(number)) or abs(float(number)) > 1e7:
                    raise ValueError('Nonfinite/excessive SVG number')
            if key == 'd':
                if re.sub(NUMBER, '', value).strip(' ,\t\r\nMmZzLlHhVvCcSsQqTtAa'):
                    raise ValueError('Path syntax')
                cost = len(re.findall('[MmZzLlHhVvCcSsQqTtAa]', value)) + len(NUMBER.findall(value))
                commands += cost
                node_cost += cost
        node_costs[node] = node_cost
        edges[node] = references
        stack.extend((child, depth + 1) for child in node)
    if commands > 100000:
        raise ValueError('SVG path complexity')
    # Include structural descendants: clip-path references may point back to ancestors.
    for node in reversed(nodes):
        edges[node] = edges[node] + [child for child in node]
    # Resolve both id names and direct structural edges with bounded traversal.
    visiting, done = set(), {}
    def checked(node, depth):
        if node in visiting or depth > 64:
            raise ValueError('SVG reference cycle/depth')
        if node in done:
            return done[node]
        visiting.add(node)
        expanded_cost = node_costs[node]
        for ref in edges[node]:
            target = ids.get(ref) if isinstance(ref, str) else ref
            if target is None:
                raise ValueError('Missing SVG reference')
            expanded_cost += checked(target, depth + 1)
            if expanded_cost > 200000:
                raise ValueError('SVG reference expansion complexity')
        visiting.remove(node)
        done[node] = expanded_cost
        return expanded_cost
    checked(root, 0)
    box = root.get('viewBox', '').replace(',', ' ').split()
    if len(box) != 4:
        raise ValueError('Finite viewBox required')
    x, y, w, h = map(float, box)
    if not all(math.isfinite(v) and abs(v) <= 1e7 for v in (x,y,w,h)) or w <= 0 or h <= 0:
        raise ValueError('Invalid viewBox')
    width, height = 1000, max(1, round(1000 * h / w))
    if height > 2048 or width * height > 1000000:
        raise ValueError('SVG raster geometry limit')
    root.set('width', str(width)); root.set('height', str(height))
    return ET.tostring(root, encoding='utf-8'), width, height


def rasterize_svg(original: bytes):
    sanitized, width, height = sanitize_svg(original)
    bwrap = shutil.which('bwrap')
    node = shutil.which('node')
    if not bwrap or not node:
        raise RuntimeError('Offline sandbox and Node required; no fallback')
    helper = Path(__file__).with_name('rasterize_general_svg.mjs').resolve()
    command = [bwrap, '--die-with-parent', '--unshare-net', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', node, '--max-old-space-size=32', str(helper)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
    output = bytearray()
    try:
        selector = selectors.DefaultSelector(); selector.register(process.stdout, selectors.EVENT_READ)
        os.set_blocking(process.stdin.fileno(), False)
        selector.register(process.stdin, selectors.EVENT_WRITE)
        remaining = memoryview(sanitized)
        deadline = time.monotonic() + 20
        while selector.get_map():
            if time.monotonic() >= deadline:
                raise TimeoutError('SVG raster timeout')
            # Bound actual resident memory, not Node virtual address reservation.
            pending, seen, resident = [process.pid], set(), 0
            while pending:
                pid = pending.pop()
                if pid in seen: continue
                seen.add(pid)
                try:
                    status = Path('/proc/%s/status' % pid).read_text()
                    rss = re.search(r'^VmRSS:\s+(\d+)', status, re.M)
                    resident += int(rss.group(1)) if rss else 0
                    pending.extend(map(int, Path('/proc/%s/task/%s/children' % (pid,pid)).read_text().split()))
                except FileNotFoundError:
                    pass
            if resident > 96 * 1024:
                raise MemoryError('SVG raster process-tree resident memory limit')
            for key, _ in selector.select(.02):
                if key.fileobj is process.stdin:
                    written = os.write(key.fd, remaining)
                    remaining = remaining[written:]
                    if not remaining:
                        selector.unregister(process.stdin); process.stdin.close()
                    continue
                chunk = os.read(key.fd, 65536)
                if not chunk: selector.unregister(key.fileobj)
                else:
                    output.extend(chunk)
                    if len(output) > 4000000: raise ValueError('SVG output limit')
        if process.wait(timeout=max(.01, deadline-time.monotonic())) != 0:
            raise RuntimeError('SVG raster failed')
        header, separator, png = bytes(output).partition(b'\n')
        if not separator or len(header) > 4096: raise ValueError('Missing renderer provenance')
        renderer = json.loads(header)
        if renderer.get('width') != width or renderer.get('height') != height or not isinstance(renderer.get('versions'), dict): raise ValueError('Raster metric/provenance mismatch')
        output = png
        if not output.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('SVG output is not PNG')
        return bytes(output), {'profile': PROFILE, 'originalSha256': hashlib.sha256(original).hexdigest(), 'sanitizedSha256': hashlib.sha256(sanitized).hexdigest(), 'rasterSha256': hashlib.sha256(output).hexdigest(), 'width':width, 'height':height, 'renderer':'sharp/librsvg', 'rendererVersions':renderer['versions'], 'helperSha256':hashlib.sha256(helper.read_bytes()).hexdigest(), 'nativePixelIdentity':False}
    finally:
        import signal
        if process.poll() is None:
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        process.wait()
        if 'selector' in locals(): selector.close()
        process.stdout.close()
        if not process.stdin.closed: process.stdin.close()
