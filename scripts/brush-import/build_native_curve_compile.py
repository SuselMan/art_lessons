"""Explicit build of the optional offline curve tool using preinstalled headers."""
import argparse
import subprocess
from pathlib import Path


def build(eigen_include, output, compiler='c++'):
    include = Path(eigen_include).resolve()
    if not (include / 'Eigen/Sparse').is_file():
        raise ValueError('Provide the existing Eigen3.4.0 include directory')
    target = Path(output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([compiler, '-std=c++17', '-O2', '-ffp-contract=off', '-fno-fast-math',
                    '-fno-unsafe-math-optimizations', '-I' + str(include),
                    str(Path(__file__).with_name('native_curve_compile.cpp')), '-o', str(target)],
                   check=True, timeout=120)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--eigen-include', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--compiler', default='c++')
    args = parser.parse_args()
    print(build(args.eigen_include, args.output, args.compiler))
