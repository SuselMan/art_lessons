# Lanpad: второй настоящий GPU, startup only

2026-10-17. Навыки home-device-access и grafetto-device-testing, access/device refs и tablet-debugging прочитаны. home-devices status подтвердил Lanpad SSH. Cached laptop tunnel22022 отказал, cached home-laptop SSH недоступен; Lanpad runbook на ноутбуке прочитать не удалось. Использована ранее подтверждённая Interactive Scheduled Task по SID процедура, документированная linux-setup/docs/watercolor-m70-room-qa-2026-10-16.md; task снята сразу после запуска. Session0/headless не использовались.

ОС Windows11Pro, Win32 driver32.0.101.7088, Intel UHD Graphics. Собственный Chrome154.0.8037.97 в interactive session1, отдельный новый профиль и loopbackCDP; пользовательский Chrome не изменялся. Actual WebGL1: ANGLE Intel UHD0x46D1 Direct3D11 vs_5_0/ps_5_0, maxTexture16384, DPR1.5, maxTouchPoints0. Транзиентный WebGL context на own about:blank освобождён через WEBGL_lose_context. Grafetto не открывался, операций/комнат не создавалось.

Foreground пока НЕ подтверждён: own tab document.hidden=true даже после Page.bringToFront, document.hasFocus=true. CDP сообщает normal window1050×652; Win32 Get-Process для own browser не даёт MainWindowHandle, GetForegroundWindow из SSH0 возвращает0, монитор Availability8/StatusOK. Эти факты не доказывают причину (lock/desktop/power); PIN/настройки экрана/сети не менялись. Такой запуск не является foreground performance proof; correctness GPU gate требует отдельного GO с указанной квалификацией.

Owned PID/profile/forward/TTL и полная приватная диагностика: ~/.cache/codex-qa/747-lanpad-20261017 (registered4h). Task уже удалена; Chrome+forward остаются по поручению root до следующего gate/cleanup. Ни проектор/IR, ни роутер, ни Samsung CDP mapping не затронуты.
