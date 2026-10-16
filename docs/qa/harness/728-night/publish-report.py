#!/usr/bin/env python3
"""Publish the existing private report route; no new server or nginx change."""
from pathlib import Path
from html import escape
import re
import urllib.request

root = Path(__file__).resolve().parents[4]
files = ['745-night-second-wave-2026-10-17.md', '745-watercolor-night-2026-10-17.md']
source = '\n\n'.join((root / 'docs/qa' / name).read_text() for name in files)
body = []
table = False
for line in source.splitlines():
    if line.startswith('|'):
        if not table:
            body.append('<div class="scroll"><table>')
            table = True
        cells = [cell.strip() for cell in line.strip('|').split('|')]
        if all(re.fullmatch(r':?-+:?', cell) for cell in cells):
            continue
        body.append('<tr>' + ''.join('<td>' + escape(cell) + '</td>' for cell in cells) + '</tr>')
        continue
    if table:
        body.append('</table></div>')
        table = False
    if line.startswith('#'):
        n = len(line) - len(line.lstrip('#'))
        if n < 4 and line[n:n+1] == ' ':
            body.append(f'<h{n}>' + escape(line[n+1:]) + f'</h{n}>')
            continue
    body.append('<p>' + escape(line) + '</p>' if line else '<div class="gap"></div>')
if table:
    body.append('</table></div>')
html = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ночная проверка акварели — 17 октября</title><style>body{font:17px/1.55 system-ui;margin:auto;padding:24px 18px;max-width:940px;color:#242424;background:#faf9f5}h1{font-size:28px}h2{font-size:23px;margin-top:32px}p{margin:0;overflow-wrap:anywhere}.gap{height:14px}.scroll{overflow:auto;margin:20px 0}table{border-collapse:collapse;min-width:650px}td{border:1px solid #ccc;padding:10px;vertical-align:top}tr:first-child{font-weight:600;background:#eee}</style>''' + ''.join(body) + '</html>'
dest = Path.home() / '.local/share/stroke-gallery/previews/watercolor-night-20261017'
dest.mkdir(exist_ok=True)
temp = dest / 'index.html.tmp'
temp.write_text(html)
temp.replace(dest / 'index.html')
url = (Path.home() / '.local/share/project-services/watercolor-undo-url').read_text().strip().replace('watercolor-undo/', 'watercolor-night-20261017/')
with urllib.request.urlopen(url) as response:
    assert response.status == 200
    assert len(response.read()) > 1000
print('Private report updated, HTTPS200')
