import { resolve, sep, extname } from 'node:path'

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.paper': 'application/octet-stream', '.preview': 'application/octet-stream', '.png': 'image/png', '.woff2': 'font/woff2' }
/** Only immutable renderer resources, never server files or uploaded brush data. */
export function previewResource(root: string, href: string): { file: string; contentType: string } | undefined {
  let pathname: string
  try { pathname = decodeURIComponent(new URL(href).pathname) } catch { return }
  if (pathname.includes('\\') || pathname.split('/').some(p => p === '..' || p === '.')) return
  if (pathname !== '/brush-preview.html' && !/^\/(assets|paper|brush-kernels)\//.test(pathname)) return
  const directory = resolve(root), file = resolve(directory, '.' + pathname)
  if (!file.startsWith(directory + sep)) return
  const contentType = TYPES[extname(file)]
  return contentType ? { file, contentType } : undefined
}
