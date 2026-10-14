const fs = require('fs');
const expectedModel = 'front8-detail-v1';
const { chromium } = require('@playwright/test');
const out = __dirname + '/room-detail';
const base = 'http://localhost:15384';
fs.mkdirSync(out, { recursive: true });
(async () => {
    const b = await chromium.launch({ headless: false, channel: 'chrome' });
    try {
        const errors = [], entry = { url: base + '/create' };
        const creatorContext = await b.newContext({viewport:{width:1100,height:900}}), creator = await creatorContext.newPage();
        await creator.goto(base + '/create?qaFastDry=detail');
        await creator.locator('form input[type="text"]').first().fill('Detail material hardware smoke');
        await creator.getByText('Fine',{exact:true}).click();await creator.getByText('Custom',{exact:true}).click();
        const dimensions=creator.locator('form input[type="number"]');await dimensions.nth(0).fill('1024');await dimensions.nth(1).fill('1024');
        await creator.locator('form button[type="submit"]').click();await creator.waitForFunction(()=>window.__engine);await creator.evaluate(()=>__engine.paperReady());
        const room=new URL(creator.url()).pathname.split('/').pop(), creatorState=await creatorContext.storageState();
        const hc = await b.newContext({ storageState: creatorState, viewport: { width: 1100, height: 900 } }), host = await hc.newPage();
        const pc = await b.newContext({ viewport: { width: 1100, height: 900 } }), peer = await pc.newPage();
        for (const p of [host, peer])
            p.on('pageerror', e => { errors.push(e.message); console.log('ERROR', e.message); });
        await host.goto(base + '/room/' + room + '?qaFastDry=detail');
        await host.waitForFunction(() => window.__engine || document.querySelector('form input[type="text"]'), null, { timeout: 60000 });
        if (await host.locator('form input[type="text"]').count()) {
            await host.locator('form input[type="text"]').first().fill('QA host');
            await host.locator('form button[type="submit"]').click();
        }
        await pc.request.get(entry.url);
        await peer.goto(base + '/room/' + room);
        await peer.waitForFunction(() => window.__engine || document.querySelector('form input[type="text"]'), null, { timeout: 60000 });
        if (await peer.locator('form input[type="text"]').count()) {
            await peer.locator('form input[type="text"]').first().fill('QA peer');
            await peer.locator('form button[type="submit"]').click();
        }
        console.log('host body', (await host.locator('body').innerText()).slice(0, 450));
        console.log('peer body', (await peer.locator('body').innerText()).slice(0, 450));
        for (const p of [host, peer]) {
            await p.waitForFunction(() => window.__engine && !window.__engine._locked, null, { timeout: 60000 });
            await p.evaluate(() => window.__engine.paperReady());
        }
        await creatorContext.close();console.log('both ready');
        const identity = await host.evaluate(() => ({ model: __engine._watercolorModel, async: __engine._wcAsyncFinish, scheduler: !!__engine._wcDryWorkScheduler, operations: __engine.getOperations().filter(o => o.type === 'stroke').length }));
        if (identity.model !== expectedModel || !identity.scheduler || identity.operations)
            throw Error('Wrong model or nonempty fixture room ' + JSON.stringify(identity));
        await host.evaluate(() => {
            const s = __roomStore.getState();
            s.setTool('watercolor');
            for (const [k, v] of Object.entries({ size: 380, water: 1, pigment: .69, pressureResponse: 'normal', nib: 'round', color: [.9, .8, .05] }))
                s.setToolSetting('watercolor', k, v);
        });
        await host.waitForFunction(() => __engine._opts.tool === 'watercolor');
        const stroke = async (j) => {
            await host.evaluate(j => {
                const color = j ? [.05, .45, .7] : [.9, .8, .05];
                __roomStore.getState().setToolSetting('watercolor', 'color', color);
                __engine.setColor(color);
                const sample = i => ({ x: 120 + 760 * i / 16, y: j ? 400 - 300 * i / 16 : 120 + 760 * i / 16, pressure: .8, tiltX: 0, tiltY: 0, speed: .4, pointerType: 'pen', timeStamp: 1000 + j * 500 + i * 12 });
                __engine._onStart(sample(0));
                for (let i = 1; i <= 16; i++)
                    __engine._onMove(sample(i));
                __engine._onEnd(sample(16));
            }, j);
        };
        await stroke(0);
        await stroke(1);
        await host.getByRole('button', { name: /dry everything|высушить всё/i }).click();
        console.log('two strokes and Dry accepted');
        const idle = async (p) => {
            await p.waitForFunction(() => { const e = __engine; return !e._locked && !e._settle && !e._wcCanonical.pending && !e._rebuildJobs.size && !e._opQueue.length; }, null, { timeout: 180000 });
            await p.evaluate(() => {
                __engine._layers.get(__engine._activeId)?.allResident()[0]?.buffer.readPixelsRegion(0,0,1,1);
                __engine._sweepReveals(performance.now() + 100000);
                __engine._display();
                __engine.gl.finish();
                if (__engine._wcAsyncError)
                    throw __engine._wcAsyncError;
            });
        };
        for (const p of [host, peer]) {
            await p.waitForFunction(() => __engine.getOperations().filter(o => o.type === 'stroke').length === 2, null, { timeout: 180000 });
            await idle(p);
        }
        const ops = await host.evaluate(() => __engine.getOperations().filter(o => o.type === 'stroke').map(o => ({ id: o.id, layerId: o.layerId, preset: o.preset })));
        if (ops.some(o => !o.preset.endsWith(':wc@' + expectedModel)))
            throw Error('Model not persisted');
        const read = async (p) => p.evaluate(layer => { const e = __engine, tiles = e._layers.get(layer).allResident().sort((a, b) => a.originY - b.originY || a.originX - b.originX); return tiles.map(t => ({ x: t.originX, y: t.originY, pixels: (() => { const bytes=t.buffer.readPixels(); let value=''; for(let i=0;i<bytes.length;i+=8192) value+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(value); })() })); }, ops[0].layerId);
        const diff = (a, c) => { const maps = [a, c].map(tiles => new Map(tiles.map(t => [t.x + ',' + t.y, Buffer.from(t.pixels, 'base64')]))); let max = 0, n = 0; for (const key of new Set([...maps[0].keys(), ...maps[1].keys()])) {
            const left = maps[0].get(key), right = maps[1].get(key);
            if (left && right && left.length !== right.length)
                return { mismatch: 'dimensions' };
            for (let i = 0; i < (left?.length ?? right.length); i++) {
                const d = Math.abs((left?.[i] ?? 0) - (right?.[i] ?? 0));
                max = Math.max(max, d);
                if (d)
                    n++;
            }
        } return { differentChannels: n, maxDelta: max, residentTiles: [a.length, c.length] }; };
        const baseline = await read(host), peerDiff = diff(baseline, await read(peer));
        console.log('peer', peerDiff);
        const result = { room, scope: 'Full Grafetto QA room; headed Chrome AMD hardware; 1024 Fine, two 380px crosses; version front8-detail-v1', identity, ops, peerDiff, front: await host.evaluate(() => __engine._watercolorPasses._frontPaths?.stats), scheduler: await host.evaluate(() => __engine._wcDryWorkScheduler.stats), errors };
        await host.screenshot({ path: out + '/room-painted.png' });
        await host.evaluate(() => __engine.undo());
        for (const p of [host, peer])
            await idle(p);
        result.undoDiff = diff(await read(host), await read(peer));
        await host.evaluate(() => __engine.redo());
        for (const p of [host, peer])
            await idle(p);
        result.redoDiff = diff(baseline, await read(host));
        result.redoPeerDiff = diff(await read(host), await read(peer));
        console.log('history', result.undoDiff, result.redoDiff, result.redoPeerDiff);
        await host.reload();
        await host.waitForFunction(() => window.__engine || document.querySelector('form input[type="text"]'), null, { timeout: 60000 });
        if (await host.locator('form input[type="text"]').count()) {
            await host.locator('form input[type="text"]').first().fill('QA host');
            await host.locator('form button[type="submit"]').click();
        }
        await host.waitForFunction(() => window.__engine && !__engine._locked, null, { timeout: 60000 });
        await host.evaluate(() => __engine.paperReady());
        await host.waitForFunction(() => __engine.getOperations().filter(o => o.type === 'stroke').length === 2, null, { timeout: 60000 });
        await idle(host);
        result.reenterDiff = diff(baseline, await read(host));
        result.export = await host.evaluate(async () => { const image = await __engine.exportPNG(); const snapshot = __engine.bakeNetworkSnapshot(__engine.getOperations().find(o => o.type === 'stroke').layerId); return { pngBytes: image?.size ?? 0, pngType: image?.type, snapshotBytes: snapshot?.length ?? 0 }; });
        if (!result.export.pngBytes || !result.export.snapshotBytes)
            throw Error('Export/snapshot unavailable after Dry');
        await host.evaluate(() => { const extension = __engine.gl.getExtension('WEBGL_lose_context'); if (!extension)
            throw Error('Context loss unavailable'); window.__qaRestoreExtension = extension; extension.loseContext(); });
        await host.waitForFunction(() => __engine.gl.isContextLost());
        await host.evaluate(() => window.__qaRestoreExtension.restoreContext());
        await host.waitForFunction(() => !__engine.gl.isContextLost() && !__engine._locked, null, { timeout: 60000 });
        await idle(host);
        result.contextRestoreDiff = diff(baseline, await read(host));
        result.gl = await host.evaluate(() => __engine.gl.getError());
        console.log('reenter', result.reenterDiff);
        fs.writeFileSync(out + '/report.json', JSON.stringify(result, null, 2));
        await host.close();
        await peer.close();
        await hc.close();
        await pc.close();
        if (errors.length || result.gl || [peerDiff, result.undoDiff, result.redoDiff, result.redoPeerDiff, result.reenterDiff, result.contextRestoreDiff].some(d => d.mismatch || d.differentChannels))
            throw Error('Pixel validation failed; report saved');
    }
    finally {
        await b.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
