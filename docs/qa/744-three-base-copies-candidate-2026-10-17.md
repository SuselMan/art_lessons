# #744: три полные base-copy без переопределения storage

Изолированная agents/744-perf-copies, base717506a8. Только три callsites:
filmBuffers P→inkBase/C→colorBase и solventFilm load→solventBase. Destination
уже pool.acquire(tile.width,tile.height). Вместо copyTo/copyTexImage2D берётся
существующий copyRegionInto/copyTexSubImage2D с полным extent и нулевыми offsets.
Не меняет shader, порядок операций, округление, полный набор копируемых pixels,
не объединяет ops, не вводит ROI, не меняет общий AccumulationBuffer.copyTo.

Unit20/4filesPASS, webTYPECHECKPASS, scopedoxlint--fixPASS. Новый MockGL pixel
тест512²/512×768/768×512/1024² сравнивает полные copied scalar-RGBA pixels
и нулевые films на двух жестах; проверяет отсутствие storage redefinition.
MockGL не доказывает физический RGBA8driver результат и не моделирует shader.

До продвижения: actualphysicalGPU before/after exact allRGBA на обоихGPU,
включая square/portrait/landscape/1024; затем ИСХОДНЫЙ undo100-cache сценарий
100×4moves1024→B Dry→A Undo своего далёкого red. Сравнить swapMs и readyDisplay,
а не только первый ROI. Экономия allocations/bandwidth пока НЕ измерена.
Не смешивать с hidden-replay candidate или CPU undo cache при первом A/B.
Новых runtime/contexts/fixtures нет; только сохранённый WT и совместимые deps.
