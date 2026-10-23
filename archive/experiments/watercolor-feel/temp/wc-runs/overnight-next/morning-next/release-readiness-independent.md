# Независимая проверка требований релиза

Сверены текущие CLAUDE.md/.claude/rules.md и .github/workflows/ci.yml/deploy.yml. PR CI: Node20/npmci, bakedpaper action до тестов, npm run typecheck/lint/test; архитектурная карта проверяется workflow block. Playwright Chromium single всегда: npx playwright test --project=chromium --grep-invert @two-browsers. Two-browser запускается по e2e-full/manual, continue-on-error advisory; зелёный общий workflow не доказывает его успешность.

Main push запускает Deploy: те же npm проверки, build только после test, deploy только после build. Concurrency deploy cancel-in-progress:false. Не повторять старый deploy, чтобы случайно не откатить production. Root владеет PR/merge/push, этот аудит не исполняет GH действия.

До утверждения готовности необходимы: полный порт50 точных патчей, marker/nonWC ограничение, жизненный цикл encodedphysical*.5/decode2/Cdecode8 и минимальная инвалидация старых transient/checkpoint физических записей; Samsung salted реальная компиляция всех выросших шейдеров; actual Vega port vs runtime artifact; свежий live/append/coalesced undo/redo/load parity, chunk6 и mixed7. Типы/unit и desktop pictures сами этого не доказывают.

H67 имеет человеческий better, но это fixtureCPU arrays injection с normalGPUfinish, а не GPU solver в живом движке. Его нельзя перенести как пять исходных файлов50 или автоматически включить в productionbest. Нужно отдельно реалистичное исполнение H/chronology/codec/state/closure и соответствующие проверки. Блокер реальной реализации обозначать прямо; не объявлять H67 уже работающим при рисовании.

Home актуальные устройства/endpoint через home-device-access refs; реальные device GPU/latency после version/context check, не headlessVPS. Cached endpoint/mDNS прежде новогоpairing, VOROBRO не менять. Графический тест не должен перезапускать чужой dev/production.

Votes193 exactparent snapshot сохранён; поддержку65/66 и H67 не превращать в глобальную похожесть всех листов. Плотный центр4 из ordinary50 остаётся отдельным H исследованием.
