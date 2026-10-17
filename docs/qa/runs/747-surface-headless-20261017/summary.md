# Surface Iris Xe: аппаратный identity и граница headless SSH

17.10.2026, Surface Pro 8 / Intel Iris Xe 0x9A49, driver 32.0.101.6737, Windows Chrome 155.0.8059.82. Chrome запускался собственным профилем из SSH session 0; interactive UI не использовался.

**Identity PASS, dimension A/B INCONCLUSIVE.** Первый отдельный запуск создал WebGL1 и WebGL2 с `failIfMajorPerformanceCaveat=true`. UNMASKED_RENDERER: `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Clear/readPixels вернул `[51,76,102,255]`, GL error 0, contextLost false; MAX_TEXTURE_SIZE 16384.

Разрешённый следующий X A/B, включая один чистый повтор в новом профиле/default browser context, остановился до создания PencilEngine: `getContext('webgl', {premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false})` вернул null. Отдельная диагностика browser context creation сообщила `Web page caused context loss and was blocked`. Stderr первого A/B запуска: `GPU process exited unexpectedly: exit_code=34`. SystemInfo продолжал перечислять Iris Xe/D3D11; это не доказывает работоспособность контекста solver. Повторный X тоже не достиг shader; Y и 1536 не запускались.

Первый A/B HEAD cd4460ed (runtime physics 0f0dd9c1); чистый повтор HEAD 1af85f06 с approvedM70 S1. Plan SHA256 повторного запуска `3d9053f52fa79d592c9e90aad5df89c1d0a5b2addee1344fba354f1f6ad7e817`. Passes SHA256 `b21106f380ef20b58962b25419494b5c875ae6c86b718cca9461322b2be3cff3`, shaders `cb7b7b06f539bf1cbcbdb2ad393de004a453da07a26e12e75026acab08a3c501`. QA POINT_FRONT/FIELD/DIFFUSE, MANUAL_MODE6 и NATIVE_FRONT выключены. Использованы существующие nonzero-origin-ab harness и Android raw CDP transport; чистый повтор — оригинальный Playwright harness.

Intel source inputs/reference/stage/output hashes не получены: выполнение остановилось до построения fixture. Поэтому сравнение Intel/Samsung reference hashes не выполнено; #748 не считается решённым. Samsung runtime-default reference P `98165bd5c3eada765d1950e5e3a7db50e9cc875609dd94fef4d2e142ab05d8b3`, C `cfe8cec826962ba1edbf4b753c42686a4339c2dc61858e45018b37cc6de4e256`, coverage `85d3577bf7ab45e38ef7db80435173ca9a876b8052de5c7f75d195f3802e7110` — только существующий Samsung baseline.

Все собственные Chrome trees, watchdog/launch processes, профили и SSH tunnels закрыты. Финальная проверка: profileRemaining=false, remainingChrome=[], listening=[] на своём CDP порту. Чужие Chrome, Scheduled Tasks, PIN, настройки, роутер и другие устройства не менялись. UI/производительность не проверены.

Компактная приватная диагностика сохранена в `~/.local/share/codex-qa-evidence/surface-747-20261017`. Одноразовые registered QA caches удалены после сохранения результата.
