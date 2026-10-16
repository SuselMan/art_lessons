# М70 недоступен в части обычных комнат и на третьем мокром слое

Кампания #745. Статически подтверждённые явные ограничения; аппаратные repro
будут добавлены после выделения GPU координатором. Не считать guards нормальной
готовностью продукта и не скрывать их неявной сушкой или legacy fallback.

1. `PuddleRoomController.source`: при `layers.size>=2` новый третий мокрый
   слой бросает `M70 QA supports two wet layers at once; dry a layer first`.
2. `PencilEngine._puddleFor`: infinite или неквадратный tile/size>1024 бросает
   `M70 QA needs a square page up to 1024px`.
3. `PuddleRoomController.accept`: больше одного resident tile, другой origin
   или размер tile бросает `M70 QA requires one square page tile`.

Repro: night-wide/prepare-wide.cjs с512×768,1536² или infinite; затем выбрать
М70 и провести штрих. Для1536² провести мазок через tile boundary, иначе первый
тайл может не обнаружить ограничение. Для третьего мокрого слоя создать три
слоя и рисовать по одному мазку, не суша первые два; harness case three-wet-layers.

Без multi-tile/material-lifetime поддержки это блокирует широкую готовность.
Точный охват и пользовательское поведение ошибок требуют реальной проверки.
