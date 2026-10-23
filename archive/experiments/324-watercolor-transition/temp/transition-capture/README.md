Реальные wet/dry endpoints текущего main-движка сняты на headed Chrome/Vega, стенд5289, исходники там не менялись. SHA пяти engine-файлов совпали с рабочей копией main098de86. Домашний checkout формально7ca+пять tracked dirty-файлов; это явно записано вmetadata.

zigzag6 иcross9 — новые синтетические жесты через CDP mouse. Названия описывают форму, это не исходные мазки галереи. Crop top-down world[80,120,600,380], canvas900×600, scale1, rotation0. До досчёта сохранён именно reveal.before; после того же канонического settle — tile.buffer. Не вызывался dev DryWash.

*.rgba — оригинальные premultiplied RGBA bottom-up. PNG assets — flipped top-down, unpremultiplied для обычного HTML canvas/image, alpha сохранена. Paper backdrop добавляет прототип. Endpoint PNG не является экспортом всей комнаты.

Диагноз таймера подтверждён: reveal.startedAt задаётся перед settle. Sweep удаляет reveal спустя1500ms пока settle ещё активен. Finish пытается сбросить startedAt, но entry уже удалена. Zigzag: deletion3.720s, finish16.814s; cross second: deletion8.647s, finish11.159s. Все timings включают диагностический readback перед началом, не являются benchmark/FPS. Во время settle readback не производился; rAF собирал только метаданные.

Оба случаяGL0, context intact, pageerrors[]. Hook wrappers не меняли расчёт endpoint или параметры brush. Собственные браузеры после capture закрыты, сервер5289 оставлен.
