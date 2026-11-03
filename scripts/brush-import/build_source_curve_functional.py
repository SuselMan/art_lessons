"""Build the explicit source-functional profile from verified Eigen5 headers.

No downloads, system-header mutations, ISA detection or importer activation.
Only modified Eigen files are copied; the temporary overlay reuses the rest.
"""
import argparse
import hashlib
import json
import re
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILE = 'eigen-5.0.1-source-functional-f64-v1'


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _apply_patch(original, patch_lines):
    """Apply exact-context unified hunks; never use fuzz or external patch tools."""
    source = original.splitlines(keepends=True)
    result, position, i = [], 0, 0
    while i < len(patch_lines):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n?', patch_lines[i])
        if not match:
            raise ValueError('Invalid mapped Eigen patch hunk')
        start = int(match[1]) - 1
        if start < position or start > len(source):
            raise ValueError('Overlapping mapped Eigen patch')
        result.extend(source[position:start])
        position, consumed, produced = start, 0, 0
        i += 1
        while i < len(patch_lines) and not patch_lines[i].startswith('@@ '):
            line = patch_lines[i]
            if not line or line[0] not in ' +-':
                raise ValueError('Invalid mapped Eigen patch line')
            if line[0] in ' -':
                if position >= len(source) or source[position] != line[1:]:
                    raise ValueError('Mapped Eigen patch context differs')
                position += 1
                consumed += 1
            if line[0] in ' +':
                result.append(line[1:])
                produced += 1
            i += 1
        if consumed != int(match[2] or 1) or produced != int(match[4] or 1):
            raise ValueError('Mapped Eigen patch hunk lengths differ')
    result.extend(source[position:])
    return ''.join(result)


def _patches(text):
    result = {}
    sections = re.split(r'(?=^--- a/)', text, flags=re.MULTILINE)
    for section in sections:
        if not section:
            continue
        lines = section.splitlines(keepends=True)
        if len(lines) < 3 or not lines[0].startswith('--- a/') or not lines[1].startswith('+++ b/'):
            raise ValueError('Invalid mapped Eigen patch header')
        name = lines[0][6:].strip()
        if lines[1][6:].strip() != name or name in result:
            raise ValueError('Duplicate or renamed mapped Eigen patch')
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('Invalid mapped Eigen patch path')
        result[name] = lines[2:]
    return result


def build(eigen_include, output, compiler='g++'):
    headers, target = Path(eigen_include).resolve(), Path(output).resolve()
    lock_path = ROOT / 'source_curve_functional.lock.json'
    lock_bytes = lock_path.read_bytes()
    lock = json.loads(lock_bytes)
    if lock['version'] != 1 or lock['profile'] != PROFILE:
        raise ValueError('Unsupported mapped compiler manifest')
    for name, expected in lock['sources'].items():
        if _sha((ROOT / name).read_bytes()) != expected:
            raise ValueError('Mapped compiler source SHA differs: ' + name)
    for entry in lock['eigen']['headers']:
        path = headers / entry['path']
        if not path.is_file() or _sha(path.read_bytes()) != entry['sha256']:
            raise ValueError('Provide verified original Eigen5.0.1 headers: ' + entry['path'])
    compiler_path = shutil.which(compiler)
    if not compiler_path:
        raise ValueError('Explicit mapped compiler toolchain is unavailable')
    compiler_path = str(Path(compiler_path).resolve())
    cc1 = subprocess.check_output([compiler_path, '-print-prog-name=cc1plus'], text=True).strip()
    toolchain = {
        'version': subprocess.check_output([compiler_path, '--version'], text=True).splitlines()[0],
        'target': subprocess.check_output([compiler_path, '-dumpmachine'], text=True).strip(),
        'compilerSHA256': _sha(Path(compiler_path).read_bytes()),
        'cc1SHA256': _sha(Path(cc1).read_bytes()),
    }
    if toolchain != lock['toolchain']:
        raise ValueError('Unreviewed mapped compiler toolchain')
    patch_bytes = (ROOT / lock['patch']['path']).read_bytes()
    if _sha(patch_bytes) != lock['patch']['sha256']:
        raise ValueError('Mapped Eigen patch SHA differs')
    patches = _patches(patch_bytes.decode('utf-8'))
    entries = {entry['path']: entry for entry in lock['patch']['files']}
    if set(entries) != set(patches):
        raise ValueError('Mapped Eigen patch file set differs')
    if target.exists() or target.with_name(target.name+'.build.json').exists():
        raise ValueError('Refuse an existing compiler artifact')
    target.parent.mkdir(parents=True, exist_ok=True)
    flags = lock['flags']
    with tempfile.TemporaryDirectory(prefix='.functional-curve-', dir=target.parent) as directory:
        temporary = Path(directory)
        overlay = temporary / 'include'
        for entry in lock['eigen']['headers']:
            name = entry['path']
            destination = overlay / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            if name in patches:
                original = (headers / name).read_bytes()
                if _sha(original) != entries[name]['originalSHA256']:
                    raise ValueError('Mapped Eigen original SHA differs: ' + name)
                updated = _apply_patch(original.decode('utf-8'), patches[name]).encode('utf-8')
                if _sha(updated) != entries[name]['guardedSHA256']:
                    raise ValueError('Mapped Eigen overlay SHA differs: ' + name)
                destination.write_bytes(updated)
            else:
                destination.symlink_to(headers / name)
        generated = temporary / 'source_curve_functional_build.h'
        generated.write_text('#pragma once\n#define GRAFETTO_CURVE_BUILD_ID "' + '0' * 64 + '"\n')
        source = ROOT / 'source_curve_functional.cpp'
        remap = ['-ffile-prefix-map=' + str(temporary) + '=/grafetto-source-functional-curve-build',
                 '-ffile-prefix-map=' + str(headers) + '=/grafetto-eigen-5.0.1',
                 '-ffile-prefix-map=' + str(ROOT) + '=/grafetto-curve-source']
        command = [compiler_path, *flags, *remap, '-I' + str(overlay), '-I' + str(temporary)]
        dependencies = subprocess.check_output([*command, '-M', str(source)], text=True, timeout=30)
        dependencies = shlex.split(dependencies.replace('\\\n', '').split(':', 1)[1])
        system = []
        for dependency in sorted(set(dependencies)):
            path = Path(dependency)
            if path == generated:
                continue
            if path.is_relative_to(ROOT):
                name = str(path.relative_to(ROOT))
                if name not in lock['sources'] or _sha(path.read_bytes()) != lock['sources'][name]:
                    raise ValueError('Unreviewed local mapped compiler dependency: ' + name)
                continue
            if path.is_relative_to(overlay) or path.is_relative_to(headers):
                continue
            system.append({'path': str(path), 'sha256': _sha(path.read_bytes())})
        identity = {'sourceLockSHA256': _sha(lock_bytes), 'toolchain': toolchain,
                    'flags': flags, 'systemHeaders': system,
                    'sourcePathRemapping': ['/grafetto-source-functional-curve-build', '/grafetto-eigen-5.0.1', '/grafetto-curve-source']}
        build_id = _sha(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode('ascii'))
        generated.write_text('#pragma once\n#define GRAFETTO_CURVE_BUILD_ID "' + build_id + '"\n')
        staged = temporary / 'compiler'
        subprocess.run([*command, str(source), '-o', str(staged)], check=True, timeout=120)
        # Only publish a complete successfully linked executable.
        staged.replace(target)
    report = {'profile': PROFILE, 'buildId': build_id, 'binarySHA256': _sha(target.read_bytes()), **identity}
    target.with_name(target.name + '.build.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--eigen-include', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--compiler', default='g++')
    args = parser.parse_args()
    result = build(args.eigen_include, args.output, args.compiler)
    print(json.dumps({key: result[key] for key in ('profile', 'buildId', 'binarySHA256')}))
