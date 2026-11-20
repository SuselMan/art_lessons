/** Regression: lazy independent-secondary allocation must not redirect a
 * mixer dab away from its canonical destination framebuffer. Run against an
 * existing QA_URL; optional QA_MODULE_OVERRIDES validates a private candidate.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
async function main() {
    const out = process.env.QA_OUTPUT ?? 'test-results/brush-cold-secondary-gpu';
    const url = process.env.QA_URL;
    if (!url)
        throw Error('Set QA_URL to an existing QA frontend');
    await mkdir(out, {
        recursive: true
    });
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    try {
        const context = await browser.newContext();
        try {
            const overrides: Record<string, string> = JSON.parse(process.env.QA_MODULE_OVERRIDES ?? '{}');
            for (const [modulePath, file] of Object.entries(overrides)) {
                if (modulePath !== '/src/engine/src/dabs/SmudgePainter.ts')
                    throw Error('Only SmudgePainter overrides are supported');
                const candidate = (await transform(await readFile(file, 'utf8'), {
                    loader: 'ts', format: 'esm', target: 'es2022'
                })).code;
                await context.route('**' + modulePath + '*', async (route) => {
                    const response = await route.fetch(), original = await response.text();
                    const imports = [...original.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
                    const code = candidate.replace(/from\s+["']([^"']+)["']/g, (_, specifier: string) => {
                        let resolved = imports.find(p => specifier === '@grafetto/shared' ? p.includes('/packages/shared/') : p.split('?')[0].endsWith('/' + specifier.split('/').at(-1) + '.ts'));
                        if (!resolved && specifier.startsWith('.'))
                            resolved = new URL(specifier + (specifier.endsWith('.ts') ? '' : '.ts'), route.request().url()).pathname;
                        if (!resolved)
                            throw Error('Cannot resolve candidate import ' + specifier);
                        return 'from ' + JSON.stringify(resolved);
                    });
                    await route.fulfill({
                        status: 200, body: code, contentType: 'application/javascript'
                    });
                });
            }
            await context.addInitScript(() => {
                (globalThis as any).__name = (f: unknown) => f;
            });
            const page = await context.newPage();
            await page.goto(new URL('/create', url).href);
            const result = await page.evaluate(async () => {
                const ep = '/src/engine/index.ts', rp = '/src/engine/brushLibrary.ts';
                const { PencilEngine } = await import(ep), registry = await import(rp);
                const descriptor = {
                    id: 'imported-1234567890abcdef12345678', version: 1, model: 'mixer', category: 'paint', tip: {
                        kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0
                    }, paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'stamp', sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]], pressureSmoothingPx: 0, opacity: 1, mixer: {
                        load: 1, pickup: 0, strength: 1
                    }, behavior: {
                        version: 2, wetMix: {
                            charge: 1, dilution: 0, attack: 1, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0
                        }, rendering: {
                            mode: 'buildUp', blendMode: 'normal', wetEdges: 0, burntEdges: 0, burntEdgesMode: 'multiply', gammaCorrect: false
                        }
                    }
                };
                const child = {
                    ...descriptor, id: 'imported-abcdef1234567890abcdef12', model: 'stamp', sizeByPressure: [[0, .05], [1, .05]], behavior: {
                        version: 2
                    }
                };
                const tested = {
                    ...descriptor, behavior: {
                        ...descriptor.behavior, dual: {
                            brush: child, blendMode: 'difference', sampling: 'independent'
                        }
                    }
                };
                registry.installBrushLibrary({
                    schemaVersion: 1, brushes: [{
                            name: 'coldsecondary', source: 'qa', warnings: [], descriptor: tested
                        }], assets: [], skipped: []
                });
                const image = async (engine: any) => {
                    const blob = await engine.exportPNG(), bitmap = await createImageBitmap(blob!), c = document.createElement('canvas');
                    c.width = bitmap.width;
                    c.height = bitmap.height;
                    const ctx = c.getContext('2d')!;
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    return ctx.getImageData(0, 0, c.width, c.height).data;
                };
                const render = async (eager: boolean) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 2048;
                    canvas.height = 1024;
                    canvas.style.cssText = 'width:1024px;height:512px';
                    document.body.append(canvas);
                    const engine = new PencilEngine(canvas, {
                        pageWidth: 2048, pageHeight: 1024, userId: 'coldprobe'
                    });
                    try {
                        await engine.paperReady();
                        engine.setBaseLayers(['ink']);
                        engine.setActiveLayer('ink');
                        engine.setCompositeOrder([{
                                id: 'ink', opacity: 1
                            }]);
                        const before = await image(engine);
                        registry.installBrushLibrary({
                            schemaVersion: 1, brushes: [{
                                    name: 'coldsecondary', source: 'qa', warnings: [], descriptor: tested
                                }], assets: [], skipped: []
                        });
                        const p = (engine as any)._smudge, original = p.drawTransferDab;
                        let preResolvedTransfers = 0;
                        p.drawTransferDab = function (...args: any[]) {
                            if (eager && args[9]?.secondary) {
                                args[9].secondary.tile(args[0].buffer);
                                preResolvedTransfers++;
                            }
                            return Reflect.apply(original, this, args);
                        };
                        engine.appendOperation({
                            id: 'cold-op', type: 'stroke', userId: 'coldprobe', timestamp: 1, seq: 1, strokeId: 'cold-stroke', strokeEnd: true, tool: 'digitalBrush', preset: 'brush:' + descriptor.id + '@1', layerId: 'ink', color: [.1, .3, .7], dabs: [{
                                    x: 1008, y: 512, size: 128, pressure: 1, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 1, t: 0
                                }]
                        }, 'remote');
                        const after = await image(engine), gl = (engine as any).gl;
                        const sample = (a: Uint8ClampedArray, x: number, y: number) => Array.from(a.slice((y * 2048 + x) * 4, (y * 2048 + x) * 4 + 4));
                        return {
                            pixels: after, preResolvedTransfers, GL: gl.getError(), rightBefore: sample(before, 1040, 512), rightAfter: sample(after, 1040, 512)
                        };
                    }
                    finally {
                        engine.destroy();
                        canvas.remove();
                    }
                };
                const a = await render(false), b = await render(true);
                let changed = 0, max = 0;
                for (let i = 0; i < a.pixels.length; i++) {
                    const delta = Math.abs(a.pixels[i] - b.pixels[i]);
                    if (delta) {
                        changed++;
                        max = Math.max(max, delta);
                    }
                }
                return {
                    cold: {
                        ...a, pixels: undefined
                    }, eager: {
                        ...b, pixels: undefined
                    }, changed, max
                };
            });
            await writeFile(out + '/report.json', JSON.stringify(result, null, 2));
            console.log(JSON.stringify(result));
            if (result.cold.GL || result.eager.GL || result.changed || JSON.stringify(result.cold.rightAfter) === JSON.stringify(result.cold.rightBefore))
                throw Error("Cold secondary must match eager allocation and paint the right tile; see report");
        }
        finally {
            await context.close();
        }
    }
    finally {
        await browser.close();
    }
}
main().catch(e => {
    console.error(e);
    process.exitCode = 1;
});
