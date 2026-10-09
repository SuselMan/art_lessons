# Surface: первый material job после воды400

Один scoped измерительный запуск source68e38ca1. Device timestamp-query включён до READY; source15 и existing3 exact preparation подтверждены. Первый непустой material request16 после настоящего pen DOWN:753 pass, interleaved=false, capacity1024 не превышен. Endpoint24960 purple pixels, GL0, context не lost, export nonempty, owncontext disposed ACK.

| Pass | Count | Total GPU spans, ms | Mean, ms |
|---|---:|---:|---:|
| waterFront |240|976.29|4.068|
| brush single |420|437.26|1.041|
| fieldOp5 |18|51.51|2.862|
| fieldOp15 |16|38.40|2.400|
| fieldOp1 |18|35.26|1.959|
| diffuse |13|11.80|0.907|

Сумма измеренных GPU pass spans1583.48 ms. CPU window prepare:start→finish:done1549.5 ms означает только время постановки original job; это другой clock/очередь, его нельзя приравнивать к сумме GPU spans. Source/live и publication/копии вне pass здесь не измерялись. Прирост производительности и model parity с WebGL не проверены.

Все положительные длительности кратны65536 ns;11 clear pass дали0. Это наблюдаемая дискретность, нулевые значения не доказывают бесплатность clear.

Полные753 rows, source/browser SHA, packed operations и PNG сохранены атомарно в `temp/device-runs/native-timestamp-68e3-promoted-20261009/`; SHA/size проверены. Pretty report659254 bytes нормализован до417750 bytes при проверенном равенстве всего JSON, оригинальный SHA записан в companion result.json. Ownfrontend5380/forward9455/контекст закрыты, Surface RELEASE. Следующий шаг — объяснить240 front и420 brush, выбрать один exact work-reduction candidate по этому ranking.
