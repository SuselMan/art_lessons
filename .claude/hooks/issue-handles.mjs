// Warns when a reply names a GitHub issue by bare number.
//
// `.claude/rules.md` → "Naming issues in conversation": the first mention of
// an issue in a message to Ilya carries a short handle — `#314 (релиз-трек)`
// — because a bare `#N` costs him a trip to the tracker to read one sentence.
// The rule predates this hook and was still broken repeatedly across a long
// session (2026-07-31): the failure is drift, not ignorance, so another
// paragraph of prose would not have helped. This is the mechanical check.
//
// Deliberately a warning and not a block (Ilya's call, 31.07): the message
// goes out as written, and the notice reaches the assistant on its next turn,
// where it costs one corrected habit rather than a re-generated answer.
//
// Two hooks, one file:
//   Stop              — inspect the reply that just went out, leave a note.
//   UserPromptSubmit  — hand that note to the assistant, then drop it.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mode = process.argv[2]

/** One note per project directory, so two checkouts don't read each other's. */
function notePath(cwd) {
  const key = createHash('sha1').update(cwd ?? '').digest('hex').slice(0, 12)
  return join(tmpdir(), `claude-issue-handles-${key}.txt`)
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

/** Everything a bare `#123` can hide inside without being a reference to
 *  issue 123: fenced and inline code, and URLs — `issues/314#issuecomment-…`
 *  is a link, not a mention, and flagging it would train the reader to
 *  ignore this hook. */
function stripNonProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
}

/** Issue numbers whose *first* mention has no handle after it. The rule only
 *  binds the first one — repeating `#230` three lines later is fine. */
export function bareIssueRefs(text) {
  const prose = stripNonProse(text)
  const seen = new Set()
  const bare = []
  for (const match of prose.matchAll(/(^|[^\w/#])#(\d{1,6})\b/g)) {
    const number = match[2]
    if (seen.has(number)) continue
    seen.add(number)
    const after = prose.slice(match.index + match[0].length)
    // The canonical shape from rules.md is `#314 (релиз-трек)`. A handle in
    // parentheses right after the number is the whole check: anything looser
    // (a nearby noun, a dash) matches ordinary sentences too and would make
    // this silent.
    if (!/^\s*\(/.test(after)) bare.push(number)
  }
  return bare
}

/** The assistant's last reply — text blocks only, so nothing here reads tool
 *  inputs. Commit messages and issue bodies are allowed bare numbers (they
 *  sit next to the tracker already); chat is not. */
function lastAssistantText(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return ''
  const lines = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry
    try { entry = JSON.parse(lines[i]) } catch { continue }
    if (entry?.type !== 'assistant') continue
    const content = entry.message?.content
    if (!Array.isArray(content)) continue
    const text = content.filter(c => c?.type === 'text').map(c => c.text).join('\n').trim()
    if (text) return text
  }
  return ''
}

if (mode === 'stop') {
  const input = readStdin()
  // Already re-entering from a stop hook: say nothing, or a loop is possible.
  if (!input.stop_hook_active) {
    const bare = bareIssueRefs(lastAssistantText(input.transcript_path))
    if (bare.length > 0) {
      writeFileSync(notePath(input.cwd), [
        `Your previous reply named ${bare.length === 1 ? 'an issue' : 'issues'} by bare number:`,
        `${bare.map(n => `#${n}`).join(', ')}.`,
        '',
        '.claude/rules.md → "Naming issues in conversation": the first mention of each',
        'issue in a message to Ilya carries a short handle — `#314 (релиз-трек)` — because',
        'a bare number costs him a trip to the tracker to read one sentence.',
        '',
        'Do it from here on. Do not apologise for the previous message or re-send it;',
        'this is a habit correction, not an error to report.',
      ].join('\n'), 'utf8')
    }
  }
  process.exit(0)
}

if (mode === 'prompt') {
  const input = readStdin()
  const path = notePath(input.cwd)
  if (existsSync(path)) {
    // stdout from UserPromptSubmit is added to the assistant's context, which
    // is the whole point: the Stop hook can only write a file, this is what
    // puts it in front of the model.
    process.stdout.write(readFileSync(path, 'utf8'))
    unlinkSync(path)
  }
  process.exit(0)
}
