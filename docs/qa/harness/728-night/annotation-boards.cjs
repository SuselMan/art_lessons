// Extend only a newly created disposable owned lesson; private identity stays on disk.
const fs = require('node:fs');
const path = require('node:path');
const { request } = require('@playwright/test');
(async () => {
  const dir = process.env.QA_FIXTURE_OUTPUT;
  if (!dir) throw Error('QA_FIXTURE_OUTPUT required');
  const file = path.join(dir, 'fixture.json');
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!fixture.disposable || !fixture.room.startsWith('qa-undo-v1-') || fixture.annotationBoards) throw Error('Fresh disposable fixture required');
  const api = await request.newContext({ baseURL: fixture.backend, storageState: path.join(dir, 'host-state.json') });
  try {
    const boards = [fixture.room];
    for (let i = 1; i <= 2; i++) {
      const response = await api.post('/api/rooms/' + fixture.room + '/boards', { data: { name: 'Disposable annotation QA ' + i } });
      if (response.status() !== 201) throw Error('Board create HTTP ' + response.status());
      const board = await response.json();
      if (!board.id || boards.includes(board.id)) throw Error('Invalid board identity');
      boards.push(board.id);
      // Persist each accepted mutation so cleanup is possible even if the next request fails.
      fixture.annotationBoards = boards;
      fs.writeFileSync(file, JSON.stringify(fixture, null, 2), { mode: 0o600 });
    }
    console.log(JSON.stringify({ lesson: fixture.room, boards }));
  } finally { await api.dispose(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
