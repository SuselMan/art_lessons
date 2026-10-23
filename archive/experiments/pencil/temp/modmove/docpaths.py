#!/usr/bin/env python3
"""Обновить упоминания перенесённых файлов в тексте (доки, комментарии, yaml, база нарушений).

  python3 temp/modmove/docpaths.py <repoRoot> <moves.json>

Запускать ПОСЛЕ move2.mjs (файлы уже на новых местах). Для каждого переноса a -> b
заменяется хвост пути: последняя общая папка + имя файла (`lib/layers.ts` ->
`lib/layers/layers.ts`), если перед ним стоит не-путевой символ или `/`. Хвост берётся
только если он однозначен среди отслеживаемых файлов до переноса — иначе переносится
только полный путь от корня. map.html не трогаем — он пересобирается.
"""
import json, os, re, subprocess, sys

root, moves_file = sys.argv[1], sys.argv[2]
moves = json.load(open(moves_file))
os.chdir(root)
tracked = subprocess.check_output(['git', 'ls-files']).decode().split('\n')
old_all = set(tracked) - {b for _, b in moves} | {a for a, _ in moves}

def tail_pair(a, b):
    ad, bd = a.split('/'), b.split('/')
    i = 0
    while i < min(len(ad), len(bd)) - 1 and ad[i] == bd[i]:
        i += 1
    # хвост начинается с последней общей папки
    k = max(i - 1, 0)
    return '/'.join(ad[k:]), '/'.join(bd[k:])

pairs = []
for a, b in moves:
    ta, tb = tail_pair(a, b)
    ambiguous = sum(1 for f in old_all if f == ta or f.endswith('/' + ta)) > 1
    if ambiguous:
        pairs.append((a, b))
    else:
        pairs.append((ta, tb))
# длинные сначала
# Упоминания без расширения (`lib/hotkeys`): только если старое имя без расширения не стало
# папкой нового модуля (`lib/layers` теперь — папка, такое упоминание остаётся верным).
noext = []
for a, b in list(pairs):
    ea, eb = os.path.splitext(a), os.path.splitext(b)
    if ea[1] in ('.ts', '.tsx', '.mts') and not (eb[0] + '/').startswith(ea[0] + '/'):
        noext.append((ea[0], eb[0]))
pairs += noext
pairs.sort(key=lambda p: -len(p[0]))
rx = re.compile('|'.join(r'(?<![\w.-])' + re.escape(a) + r'(?![\w/-])' for a, _ in pairs)) if pairs else None
repl = dict(pairs)

TEXT = re.compile(r'\.(md|ya?ml|ts|tsx|mts|mjs|cjs|js|json|sh|html|css|conf|prisma|txt)$|Dockerfile$')
changed = {}
for f in tracked:
    if not f or not TEXT.search(f) or f.endswith('map.html') or f.endswith('issue-titles.json'):
        continue
    if not os.path.isfile(f):
        continue
    try:
        s = open(f, encoding='utf-8').read()
    except Exception:
        continue
    n, c = rx.subn(lambda m: repl[m.group(0)], s)
    if c:
        open(f, 'w', encoding='utf-8').write(n)
        changed[f] = c
for f, c in sorted(changed.items()):
    print(c, f)
