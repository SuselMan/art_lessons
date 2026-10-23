it('#783-probe last seated participant disconnect can evict another pending join room', async () => {
  const lessonId = fresh('last-participant-during-query')
  rows.set(lessonId, row(lessonId))
  const teacher = client('teacher')
  await createLesson(teacher, lessonId)
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const newcomer = client('newcomer')
  const verdict = new Promise(resolve => newcomer.emit('join_room', { roomId: lessonId, name: 'Newcomer' }, resolve))
  await reached
  const serverSocket = io.sockets.sockets.get(teacher.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  teacher.close()
  await disconnected
  await _flushPendingWrites(lessonId)
  release(null)
  expect(await verdict).toEqual({ ok: true, userId: 'newcomer' })
  expect(getParticipant(lessonId, 'newcomer')).toBeDefined()
})
