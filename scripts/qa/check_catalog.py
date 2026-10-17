#!/usr/bin/env python3
"""Read-only QA catalogue checks. --suite prints a selection; never starts product tests."""
import argparse
import hashlib
from functools import cache
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import unicodedata
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
CAT = ROOT / 'docs/qa/catalog'


def read_json(name):
    return json.loads((CAT / name).read_text())


def slug(text):
    text = re.sub(r'<[^>]*>', '', text).lower().replace(' ', '-')
    return ''.join(c for c in text if c in '-_' or unicodedata.category(c)[0] in 'LN')


@cache
def anchors(path):
    content = path.read_text()
    result = set(re.findall(r'<a id="([^"]+)"', content))
    counts = {}
    for title in re.findall(r'^#{1,6} (.+)$', content, re.M):
        base = slug(title)
        count = counts.get(base, 0)
        result.add(base + (f'-{count}' if count else ''))
        counts[base] = count + 1
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=list(read_json('suites.json')))
    parser.add_argument('--discovery', type=Path, help='Playwright --list --reporter=json output to compare with browser cases')
    args = parser.parse_args()
    errors = []
    cases = read_json('cases.json')
    suites = read_json('suites.json')
    mapping = read_json('e2e-map.json')
    manifest = read_json('sources.json')
    night = read_json('night-cases.json')
    definitions = {}
    docs = sorted({(CAT / data['file']).resolve() for data in cases.values()})
    for path in docs:
        content = path.read_text()
        for match in re.finditer(r'^## (QA-\d+) — (.+)$', content, re.M):
            case = match[1]
            if case in definitions:
                errors.append(f'Duplicate ID {case}')
            definitions[case] = (path, match[2])
            end = content.find('\n## ', match.end())
            block = content[match.end():end if end >= 0 else len(content)]
            for field in ('**Действия:**', '**Ожидание:**', '**Автоматизация'):
                if field not in block:
                    errors.append(f'{case}: missing {field}')
            if case.lower() not in anchors(path):
                errors.append(f'{case}: missing stable anchor')
    if set(definitions) != set(cases):
        errors.append('Definitions do not match cases.json')
    for case, data in cases.items():
        expected = (CAT / data['file']).resolve()
        if case in definitions and (definitions[case][0] != expected or definitions[case][1] != data['title']):
            errors.append(f'{case}: path/title mismatch')
    legacy = ROOT / 'docs/qa/sources/collaboration-before-793.md'
    current = ROOT / 'docs/qa/scenarios/collaboration.md'
    if not anchors(legacy).difference({slug('Совместная работа: регрессионные сценарии')}) <= anchors(current):
        errors.append('Legacy heading anchor was lost')
    old_bytes = subprocess.check_output(['git', '-C', str(ROOT), 'show', manifest['base_commit'] + ':docs/qa/scenarios/collaboration.md'])
    if legacy.read_bytes() != old_bytes:
        errors.append('Legacy source changed')
    for case, data in cases.items():
        if data.get('kind') not in {'case', 'group', 'alias'}:
            errors.append(f'{case}: missing case/group/alias classification')
        if data.get('kind') == 'alias' and cases.get(data.get('alias_of'), {}).get('kind') != 'case':
            errors.append(f'{case}: alias must point to an individual case')
    for name, suite in suites.items():
        if len(suite['cases']) != len(set(suite['cases'])):
            errors.append(f'{name}: duplicate case')
        for case in suite['cases']:
            if case not in cases:
                errors.append(f'{name}: unknown {case}')
            elif cases[case].get('kind') != 'case':
                errors.append(f'{name}: overview/alias cannot count as a case: {case}')
    selected = {case for suite in suites.values() for case in suite['cases']}
    if selected != {case for case, data in cases.items() if data.get('kind') == 'case'}:
        errors.append('Suite union does not cover all individual cases')
    specs = {str(p.relative_to(ROOT)) for p in (ROOT / 'e2e/specs').glob('*.spec.ts')}
    if specs != set(mapping):
        errors.append(f'E2E mapping differs: unmapped={sorted(specs-set(mapping))}, absent={sorted(set(mapping)-specs)}')
    for source, case in mapping.items():
        if case not in cases:
            errors.append(f'{source}: unknown {case}')
    browser = read_json('browser-cases.json')
    historical = read_json('historical-cases.json')
    unit = read_json('unit-inventory.json')
    audit = read_json('history-audit.json')
    for item in browser:
        if item['id'] not in cases or item['group'] not in cases:
            errors.append(f'Invalid browser case/group: {item["id"]}')
        if item['source'] not in specs:
            errors.append(f'Browser source absent: {item["source"]}')
        if not item['variants'] or not item['steps'] or not item['expected']:
            errors.append(f'Empty browser definition: {item["id"]}')
    if args.discovery:
        actual = set()
        def walk(suite):
            for spec in suite.get('specs', []):
                actual.add((spec['file'], spec['line'], spec['title']))
            for child in suite.get('suites', []):
                walk(child)
        walk(json.loads(args.discovery.read_text()))
        expected = {(Path(r['source']).name, r['line'], title) for r in browser for title in r['variants']}
        if actual != expected:
            errors.append(f'Browser discovery differs: missing={len(expected-actual)}, new={len(actual-expected)}')
    source_tools = set(manifest['source_tools'])
    for item in historical:
        if item['id'] not in cases:
            errors.append(f'Unknown historical case {item["id"]}')
        for path in item['unit_support']:
            if not (ROOT / path).is_file():
                errors.append(f'Missing unit support: {path}')
        for path in item.get('source_only_support', []):
            if path not in source_tools:
                errors.append(f'Missing pinned support: {path}')
    current_units = {str(p.relative_to(ROOT)) for folder in ('apps/web/src', 'apps/server/src', 'packages/shared') for p in (ROOT / folder).rglob('*.test.ts')}
    if current_units != {r['path'] for r in unit}:
        errors.append('Unit inventory is stale')
    for item in unit:
        if hashlib.sha256((ROOT / item['path']).read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Unit source changed: {item["path"]}; refresh inventory and review scope')
        for case in item['case_support']:
            if case not in cases:
                errors.append(f'Unknown unit-support case: {case}')
    for item in audit:
        for case in item['cases']:
            if case not in cases:
                errors.append(f'Unknown historical mapping: {case}')
        if item['bug_candidate'] and not item['cases'] and (item['disposition'] != 'excluded' or not item['reason']):
            errors.append(f'Bug without disposition: #{item["number"]}')

    for item in night:
        if item['id'] not in cases:
            errors.append(f'Unknown NIGHT case {item["id"]}')
        if item['source_tool'] and item['source_tool'] not in source_tools:
            errors.append(f'Absent source tool: {item["source_tool"]}')
    for item in manifest['files']:
        path = ROOT / item['copy']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            errors.append(f'Source copy/hash mismatch {path}')
    # Git objects may be absent in a fresh clone: retained documents still work.
    probe = subprocess.run(['git', '-C', str(ROOT), 'cat-file', '-e', manifest['source_commit'] + '^{commit}'], capture_output=True)
    if probe.returncode == 0:
        tree = set(subprocess.check_output(['git', '-C', str(ROOT), 'ls-tree', '-r', '--name-only', manifest['source_commit']], text=True).splitlines())
        for path in source_tools:
            if path not in tree:
                errors.append(f'Source manifest path not in pinned Git tree: {path}')
        for item in manifest['files']:
            original = subprocess.check_output(['git', '-C', str(ROOT), 'show', manifest['source_commit'] + ':' + item['source']])
            if hashlib.sha256(original).hexdigest() != item['sha256']:
                errors.append(f'Pinned Git blob hash mismatch: {item["source"]}')
    else:
        print('NIGHT Git objects unavailable: source-only automation BLOCKED; copied evidence verified.')
    authored = list(CAT.glob('*.md')) + [ROOT / 'docs/qa/README.md', current, ROOT / 'e2e/README.md']
    link_count = 0
    for path in authored:
        for target in re.findall(r'\[[^\]]*\]\(([^\s)]+)\)', path.read_text()):
            if re.match(r'[a-zA-Z][\w+.-]*:', target):
                continue
            file, _, anchor = unquote(target).partition('#')
            dest = (path.parent / file).resolve() if file else path
            link_count += 1
            if not dest.exists():
                errors.append(f'{path.relative_to(ROOT)}: missing link {target}')
            elif anchor and dest.suffix == '.md' and anchor not in anchors(dest):
                errors.append(f'{path.relative_to(ROOT)}: missing anchor {target}')
    for path in authored:
        # No private local stand URL or storage-state cookie is allowed in authored docs.
        if re.search(r'https?://(?:127\.0\.0\.1|localhost|192\.168\.|10\.\d+\.)', path.read_text()):
            errors.append(f'{path.relative_to(ROOT)}: private stand URL')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f'PASS: {sum(r.get("kind")=="case" for r in cases.values())} individual cases + {sum(r.get("kind")=="group" for r in cases.values())} groups; {len(suites)} suites; {len(browser)} browser scenarios/{sum(len(r["variants"]) for r in browser)} variants; {len(unit)} unit files; {link_count} local links; {len(manifest["files"])} pinned copies.')
    if args.suite:
        suite = suites[args.suite]
        print(f'\n{args.suite}: {suite["resources"]}\n{suite["duration"]}')
        for case in suite['cases']:
            print(f'{case} — {cases[case]["title"]}')
        files = sorted({source for source, case in mapping.items() if case in suite['cases']} | {r['source'] + ':' + str(r['line']) for r in browser if r['id'] in suite['cases']})
        if args.suite == 'full':
            files = sorted(mapping)
        print('\nBrowser automation subset (manual/device gates remain):')
        if files:
            print('npx playwright test ' + ' '.join(shlex.quote(f) for f in files) + ' --project=chromium --list')
        units = sorted({path for item in historical if item['id'] in suite['cases'] for path in item['unit_support']})
        if units:
            print('\nPartial unit support (prepare isolated DB where required; manual acceptance remains):')
            print('npx vitest run ' + ' '.join(shlex.quote(path) for path in units) + ' --maxWorkers=1')
        print('No product test was executed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
