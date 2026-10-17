#!/usr/bin/env python3
"""Publish the existing private report route; no new server or nginx change."""
from pathlib import Path
from html import escape
import re
import urllib.request

root = Path(__file__).resolve().parents[4]
def inline(value):
    value = escape(value)
    value = re.sub(r'`([^`]+)`', r'<code>\1</code>', value)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)


def render(source):
    body, paragraph = [], []
    table = False

    def flush():
        if paragraph:
            body.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            paragraph.clear()

    for line in source.splitlines():
        if line.startswith('|'):
            flush()
            if not table:
                body.append('<div class="scroll"><table>')
                table = True
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?', cell) for cell in cells):
                body.append('<tr>' + ''.join('<td>' + inline(cell) + '</td>' for cell in cells) + '</tr>')
            continue
        if table:
            body.append('</table></div>')
            table = False
        heading = re.match(r'^(#{1,3}) (.+)$', line)
        if heading:
            flush()
            n = len(heading[1])
            body.append(f'<h{n}>' + inline(heading[2]) + f'</h{n}>')
        elif not line:
            flush()
        else:
            paragraph.append(line)
    flush()
    if table:
        body.append('</table></div>')
    return ''.join(body)


main = (root / 'docs/qa/745-watercolor-night-readable-2026-10-17.md').read_text()
archive = '\n\n'.join((root / 'docs/qa' / name).read_text() for name in [
    '745-night-second-wave-2026-10-17.md', '745-watercolor-night-2026-10-17.md',
])
html = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Акварель: проблемы и проверки — 17 октября</title><style>
*{box-sizing:border-box}body{font:17px/1.6 system-ui;margin:auto;padding:24px 18px 64px;max-width:820px;color:#242424;background:#faf9f5}h1{font-size:29px;line-height:1.25}h2{font-size:24px;line-height:1.35;margin:48px 0 22px;padding-top:18px;border-top:2px solid #d5d0c6}h3{font-size:19px;line-height:1.4;margin:30px 0 10px}p{margin:0 0 14px;overflow-wrap:anywhere}code{font-size:.85em;background:#eeeae2;padding:1px 4px;border-radius:3px}details{margin-top:48px;border-top:1px solid #ccc;padding-top:20px}summary{cursor:pointer;font-weight:600;padding:12px 0}.scroll{overflow:auto;margin:20px 0}table{border-collapse:collapse;min-width:650px}td{border:1px solid #ccc;padding:10px;vertical-align:top}tr:first-child{font-weight:600;background:#eee}@media(max-width:480px){body{font-size:16px;padding:18px 16px 48px}h1{font-size:26px}h2{font-size:22px}h3{font-size:18px}}
</style><main>''' + render(main) + '</main><details><summary>Технический журнал и история проверок</summary>' + render(archive) + '</details></html>'
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
