import { describe, expect, it } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { qaHttpLessonResolver, qaHttpRoomId } from './qaHttpRoomClassifier.js'

function request(method: string, url: string, values: Record<string, unknown> = {}): FastifyRequest {
  return { method, routeOptions: { url }, params: {}, query: {}, body: undefined, ...values } as unknown as FastifyRequest
}

describe('QA HTTP room classification', () => {
  it('handles lesson and board endpoints and maps a board to its lesson', async () => {
    const r = request('PATCH', '/api/rooms/:id/boards/:boardId', { params: { id: 'lesson', boardId: 'board' } })
    expect(qaHttpRoomId(r)).toBe('lesson')
    expect(await qaHttpLessonResolver(async id => id === 'board' ? 'lesson' : id)(request('GET', '/api/rooms/:roomId/thumbnail', { params: { roomId: 'board' } }))).toBe('lesson')
  })
  it('classifies room IDs carried by brush query and room-open body', () => {
    expect(qaHttpRoomId(request('GET', '/api/brush-library', { query: { roomId: 'lesson' } }))).toBe('lesson')
    expect(qaHttpRoomId(request('POST', '/api/me/room-open', { body: { roomId: 'lesson' } }))).toBe('lesson')
    expect(qaHttpRoomId(request('GET', '/api/brush-library'))).toBeNull()
  })
  it('never confuses folders with rooms and fails closed for future routes', () => {
    expect(qaHttpRoomId(request('PATCH', '/api/rooms/folders/:id', { params: { id: 'folder' } }))).toBeNull()
    expect(() => qaHttpRoomId(request('POST', '/api/surprise'))).toThrow('Unclassified')
    expect(() => qaHttpRoomId(request('PATCH', '/api/rooms/:id'))).toThrow('lacks ID')
    expect(qaHttpRoomId(request('HEAD', '/api/health'))).toBeNull()
  })
})

it('has an explicit classification for every statically declared apiRoute', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { dirname, join, resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(path)
    }
  }
  walk(root)
  const routes = new Set<string>()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/apiRoute\(app\s*,\s*['"]([A-Z]+\s+\/[^'"]+)['"]/g)) routes.add(match[1])
  }
  expect(routes.size).toBeGreaterThan(40)
  for (const route of routes) {
    const [method, url] = route.split(' ')
    expect(() => qaHttpRoomId(request(method, url, {
      params: { id: 'lesson', roomId: 'lesson', boardId: 'board' }, query: { roomId: 'lesson' }, body: { roomId: 'lesson' },
    })), route).not.toThrow()
  }
})
