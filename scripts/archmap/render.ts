/** Dataset + page assets → one self-contained HTML file. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './model';
import type { Dataset } from './collect';

const PAGE = join(REPO_ROOT, 'scripts', 'archmap', 'page');

/** `git@github.com:owner/name.git` / `https://github.com/owner/name` → browsable base URLs. */
function repoUrls(remote: string, branch: string): { blob: string; issues: string } {
  const m = remote.trim().match(/github\.com[:/](.+?)(?:\.git)?$/);
  const slug = m ? m[1] : 'unknown/unknown';
  const ref = branch && branch !== 'HEAD' ? branch : 'main';
  return {
    blob: `https://github.com/${slug}/blob/${ref}`,
    issues: `https://github.com/${slug}/issues/`,
  };
}

export function render(data: Dataset, remote: string): string {
  const urls = repoUrls(remote, data.branch);
  const payload = { ...data, repo: urls.blob, issuesBase: urls.issues };
  const stamp = `${data.commit} · ${data.generatedAt.slice(0, 16).replace('T', ' ')} UTC`;

  return readFileSync(join(PAGE, 'shell.html'), 'utf8')
    .replace('/*__CSS__*/', () => readFileSync(join(PAGE, 'style.css'), 'utf8'))
    .replace('__STAMP__', () => stamp)
    // `</script>` inside the JSON would close the tag early; `<` is the only character that can.
    .replace('/*__DATA__*/null', () => JSON.stringify(payload).replace(/</g, '\\u003c'))
    .replace('/*__JS__*/', () => readFileSync(join(PAGE, 'app.js'), 'utf8'));
}
