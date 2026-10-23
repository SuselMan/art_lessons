# Samsung / source3d минимальная проверка (ожидает root grant)

Изучены home-device-access SKILL+access.md, grafetto-device-testing SKILL+
references/device-testing.md и .claude/tablet-debugging.md. Устройство SM-T970,
serial R52RB0JXVSY, Adreno. Перед разрешённым запуском readonly home-devices status
и serial check; существующий root-owned forward9238 не создавать/удалять.
Без restart Chrome, pair, power changes, router. Не менять существующие вкладки:
1164/1166/1121/1143/1150/1131/1110/1106/1090.

1. Root создаёт собственный target через CDP Target.createTarget с уникальным
   https://192.168.1.70:5308/create?qa=android-3d-<unique>, сохраняет exacttargetID.
   Выбираем только этот target, никаких URL substring existingtabs.
2. Page.bringToFront только own target. Actual UI create→join если требуется.
   await __engine.paperReady(); assert __engine._paper.loaded, actualAdreno через
   WEBGL_debug_renderer_info, lostfalse/GL0, production9flag tuple.
   Source passport3файла наhome/VPS до navigation, indexSHA02a461...; actual
   _log.revision number и изменение послеnativeACK/confirm.
3. Через настоящий Room canvas CDP Input.dispatchMouseEvent pointerType:'pen'
   короткая линия (≤36 decoded kept dabs, single operation/chunk), roundsize≤80:
   чистая вода, затем небольшойпигментный штрих. Inputpressure nonzero, rAF между
   moves. Никаких private _onStart bypass. Assert ACKseq вlog, nonemptycanonical,
   positivewet sample. Idle включаетrevealszero+2rAF; неfixed arbitrary8s.
4. UI Dry→ACK paper_dry→oldsample0/peak0. UI Undo→Redo послеDry→oldsample0.
   GL0/lostfalse накаждойфазе, rawoperationJSONcloneinsidepage, decoded counts.
5. CapturecanonicalPNG+hash beforefresh. Убратьsame-room original engine путём
   own target navigation (sameAndroidauth storage) в ту же room?qa=freshunique,
   paperReady/settleidle; freshserverjournal exact и nonempty PNGhash exact.
   Одновременно не создавать второй Androidengine; при новом target первый
   закрыть BEFOREsecond targetcreation. Freshreaderidentity записать.
6. Finally закрыть только созданные targetIDs. Root-owned9238 оставить root.
   Логи/PNG подtemp/device-runs/android-3d, actualrenderer/source/ops/GL хранить.

Без проверкиcoldcompile неclaim saltprograms; source3d меняет metadataonly,
новых shaderprograms нет. Не утверждать SamsungPASS поVega/MockGL.
