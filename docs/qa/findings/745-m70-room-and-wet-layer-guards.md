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

Аппаратная проверка runtime1e521993, Vega realGPU, два автора:

| Ограничение | Вода | Сохранность соседнего слоя / pencil recovery | Остаточная проблема |
|---|---|---|---|
| Третий мокрый слой512² | reject в source | оба wet canonical hash неизменны; socketOPEN; pencil работает | известный productlimit #747 |
|512×768 | reject в _puddleFor | pencil hash неизменен; socketOPEN; pencil работает |24unhandled pageerrors на обоих авторах |
|1536² через1024worldpx | reject в accept/_flushLiveComposite | pencil hash неизменен; socketOPEN; pencil работает | afterAttempt._strokeId осталсяnon-null, scratch безготовогоgoal; очистка при отказе не доказана |
| infinite512² | reject в _puddleFor | pencil hash неизменен; socketOPEN; pencil работает |24unhandled pageerrors на обоих авторах |

Все попытки оставили journal operation count неизменным до recovery pencil и
GLerror0. PASS recoverycase не означает поддержку геометрии или корректный UI
отказа. Неперехваченные ошибки non-square/infinite возникают у обоих участников
и во время обычных фоновых/pencil задач; это требует отдельного восстановления
ошибок/UIguard даже до реализации полного multi-tile pipeline. Legacyfallback
и implicitdry не применялись. Oversize partialgesture отмечен как риск;
постоянная утечка слотов этой проверкой не доказана.

Evidence: temp/device-runs/745-final5-guard-{third-wet,nonsquare,oversize,infinite}/report.json.
Contexts закрыты. Третья wet/oversize комнаты удалены после capture; failed
non-square/infinite сохранены для координатора с private auth (в Git не входит).
