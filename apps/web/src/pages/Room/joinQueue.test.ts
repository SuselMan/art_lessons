import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { RoomAccessInfo, RoomJoinRequest } from '@grafetto/shared'

import { roomAccessQueryKey } from '../../lib/queryClient'
import { applyJoinRequestCreated } from './joinQueue'

function request(id: string, name = 'Ann'): RoomJoinRequest {
  return { id, userId: `u-${id}`, name, email: null, requestedAt: '2026-08-04T10:00:00.000Z' }
}

function access(pendingRequests: RoomJoinRequest[]): RoomAccessInfo {
  return { accessMode: 'invite_only', hasPassword: false, invites: [], pendingRequests, participants: [] }
}

function read(client: QueryClient, roomId: string): RoomAccessInfo | undefined {
  return client.getQueryData<RoomAccessInfo>(roomAccessQueryKey(roomId))
}

describe('applyJoinRequestCreated', () => {
  it('appends the new request to the cached queue', () => {
    const client = new QueryClient()
    client.setQueryData(roomAccessQueryKey('room-1'), access([request('a')]))

    applyJoinRequestCreated(client, 'room-1', request('b', 'Bob'))

    expect(read(client, 'room-1')?.pendingRequests.map(r => r.id)).toEqual(['a', 'b'])
  })

  // The socket redelivers on reconnect, and the refetch behind every one of
  // these can also land after the event that prompted it — neither may turn
  // one person knocking into two rows with the same two buttons.
  it('ignores a request already in the queue', () => {
    const client = new QueryClient()
    client.setQueryData(roomAccessQueryKey('room-1'), access([request('a')]))
    const before = read(client, 'room-1')

    applyJoinRequestCreated(client, 'room-1', request('a'))

    expect(read(client, 'room-1')).toBe(before)
  })

  // The event is addressed to the owner as a person, so a tab sitting in one
  // project hears about every other project they own. Nothing is cached for
  // those here, and inventing an entry would make this tab answer for a
  // project it isn't showing.
  it('creates nothing for a project this client has no access state for', () => {
    const client = new QueryClient()
    client.setQueryData(roomAccessQueryKey('room-1'), access([]))

    applyJoinRequestCreated(client, 'room-2', request('b'))

    expect(read(client, 'room-2')).toBeUndefined()
    expect(read(client, 'room-1')?.pendingRequests).toEqual([])
  })
})
