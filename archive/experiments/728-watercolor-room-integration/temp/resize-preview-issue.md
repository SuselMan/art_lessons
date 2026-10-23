## Реальный Samsung baseline

Samsung Adreno 650, настоящий Chrome WebGL, M70. У автора перо удерживается, очередь live-dabs пуста; наблюдатель сначала получает два пакета и создаёт film. Через ~0,6 с естественный ResizeObserver вызывает `resizeCanvas` дважды. Тот же engine остаётся жив; `_peerLiveStrokes` содержит активный жест, но `WatercolorLivePreview.clear(false)` удаляет все streams. Серый след воды исчезает до UP; фактический ROI снова имеет 0 изменённых каналов. GL errors отсутствуют.

Прямые Node control sockets убраны из water-stage; эффект сохранился, поэтому это не артефакт присутствия второго сокета.

## Причина / ожидается

При смене viewport нужно пересоздать временный framebuffer и перерисовать сохранённые незаписанные dabs. Нельзя забывать сами dabs и received/committed cursors: resize не отменяет чужой мазок. Canonical слой/export должны остаться прежними. Cancel/peer leave/context loss по-прежнему очищают film.

Исполняемый engine regression отдельно проверяет незаписанный хвост после частичного commit, смену размера и последующее корректное погашение остатка.
