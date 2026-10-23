#!/bin/bash
# Каждый относительный путь в vi.mock/doMock/importActual и import() в тестах должен указывать на файл.
root=$1; shift
cd "$root"
grep -rnoE "vi\.(mock|doMock|importActual|importMock)(<[^>]*>)?\(\s*['\"]\.[^'\"]+|import\(\s*['\"]\.[^'\"]+" "$@" --exclude-dir=node_modules --include=*.ts --include=*.tsx | while IFS=: read f l m; do
  spec=$(echo "$m" | sed -E "s/.*\(\s*['\"]//"); base="$(dirname "$f")/${spec}"; b2="${base%.js}"
  ok=; for c in "$base" "$b2.ts" "$b2.tsx" "$base.ts" "$base.tsx" "$base/index.ts" "$base/index.tsx"; do [ -f "$c" ] && ok=1 && break; done
  [ -z "$ok" ] && echo "BROKEN $f:$l $spec"
done
echo "mock check done"
