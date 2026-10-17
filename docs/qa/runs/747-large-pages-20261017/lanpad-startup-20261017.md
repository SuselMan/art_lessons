# Lanpad: второй настоящий GPU, startup only

2026-10-17. Навыки home-device-access и grafetto-device-testing, access/device refs и tablet-debugging прочитаны. home-devices status подтвердил Lanpad SSH. Cached laptop tunnel22022 отказал, cached home-laptop SSH недоступен; Lanpad runbook на ноутбуке прочитать не удалось. Использована ранее подтверждённая Interactive Scheduled Task по SID процедура, документированная linux-setup/docs/watercolor-m70-room-qa-2026-10-16.md; task снята сразу после запуска. Session0/headless не использовались.

ОС Windows11Pro, Win32 driver32.0.101.7088, Intel UHD Graphics. Собственный Chrome154.0.8037.97 в interactive session1, отдельный новый профиль и loopbackCDP; пользовательский Chrome не изменялся. Actual WebGL1: ANGLE Intel UHD0x46D1 Direct3D11 vs_5_0/ps_5_0, maxTexture16384, DPR1.5, maxTouchPoints0. Транзиентный WebGL context на own about:blank освобождён через WEBGL_lose_context. Grafetto не открывался, операций/комнат не создавалось.

Foreground пока НЕ подтверждён: own tab document.hidden=true даже после Page.bringToFront, document.hasFocus=true. CDP сообщает normal window1050×652; Win32 Get-Process для own browser не даёт MainWindowHandle, GetForegroundWindow из SSH0 возвращает0, монитор Availability8/StatusOK. Эти факты не доказывают причину (lock/desktop/power); PIN/настройки экрана/сети не менялись. Такой запуск не является foreground performance proof; correctness GPU gate требует отдельного GO с указанной квалификацией.

Owned PID/profile/forward/TTL и полная приватная диагностика: ~/.cache/codex-qa/747-lanpad-20261017 (registered4h). Task уже удалена; Chrome+forward остаются по поручению root до следующего gate/cleanup. Ни проектор/IR, ни роутер, ни Samsung CDP mapping не затронуты.

## Проверка истёкших ресурсов 2026-10-17T18:47:48+03:00

Без GPU. VPS PID182926 и listener19346 отсутствуют; соответствующий SSH forward уже не работает. Старый cache `747-lanpad-20261017` и его registry entry уже отсутствовали ДО проверки; причину прежнего удаления здесь не устанавливаем. Ничего не удаляли. Текущие compactproofs/source fixtures и `puddle-747-active-20261017` с auth сохранены.

Lanpad недоступен: штатный status и один запрос cached SSH вернули `No route to host`. Поэтому текущая принадлежность Chrome8364/profile `C:\Windows\Temp\grafetto747-lanpad-20261017` и keepawake4720 (записанный TTL истёк16:35) НЕ подтверждена; процессы не останавливали, профиль не удаляли. Их состояние остаётся UNKNOWN до восстановления обычного доступа и проверки PID+cmdline/profile. Не будили устройство, не меняли роутер/проектор/чужие окна. Коммит не выполнялся. Санитизированный ledger: `lanpad-resource-cleanup-20261017.json`.
