# Супербыстрая акварель — план ночи 07→08 октября

Илья согласовал запуск23:34Europe/Vilnius. Publication/main/deploy не разрешены.
Baseline6aa14a43; safe pack ffd3fdc8 (runtime), rootf7dc9c3d (docs).
Принцип: сохранить каноническую модель и отделить математическое вычисление,
управление ресурсами и presentation; измеренный выигрыш принимается вместе с
проверкой прежнего результата, а не вместо неё.

- [x] Зафиксировать работающийbaseline иsafe pack;106combinedCPUtests/types/lint.
- [x] WholeRGBA samejournal Surface baseline/safepack совпадает.
- [ ] Root: локализовать615ms Skiawait абляцией display/solver/copygroups.
- [ ] CPUagent: geometry/_paintDabs/contact/wet-overlay exactreuse.
- [ ] GPUagent: exact pixels/copy/flow/state workelimination, безQ8потерь.
- [ ] WebGL2agent: isolatedbrush двухpass same-math, затемMRTbenchmark.
- [ ] Ограниченныйsuperoptimizationexperiment толькоизмеренногоpurekernel.
- [ ] Samsung/Surface brush400: dryfirst, wetnext, zigzag, wateronly,puddlepigment.
- [ ] Операции/undo/redo/rejoin/multiuser иконтекст поscopeкаждогокандидата.
- [ ] Итоговыйотчет: выигрыш/отклонение/непроверенное, лучшийстенд.

ЦелевыеUX ориентиры: первоеappearance≤50ms, нопаузы>100ms. Метрикиhandler/rAF
невыдаватьзапрямоеphysicalpen→screenвремя. GPUservicewalltime неshaderexec.
Всеdeviceпрогоныпоследовательно; проектыагентоввразныхworktree. Каждыйкандидат
отдельнымcommit, пачкисbinarybisection+interactioncheck. Неизменятьанимацию
сушки/schedulerбезотдельныхгейтов. Неускорять ценойпрозрачного/позднегомазка.

Контролькаждые45–60мин: новоеизмерение/кандидат/отклонение; после2цикловбезновых
данных сменитьэксперимент. Артефактыtemp/fast-watercolor-night, дисковыене/tmp.
ПредварительнодоступныSurface/Samsung; Lanpadнедоступен. iPadнезаявленпроверенным.

БазовыйSurfaceAB: tail617/617ms, nextfullhandler121.7/132.2ms. Safechangesглавную
паузунеисправили. ДлинныйSkiafinish615ms — зацепкадлядиагностики, непричинадоказана.

## Контрольная точка: аппаратные эксперименты

Surface: отключение финального screen blit (239 вызовов) оставило хвост667ms;
отключение preserveDrawingBuffer —633ms. Brush-pass ablation —450ms,
water-front —334ms, diffuse —600ms. Это диагностическое изменение картинки,
не готовые оптимизации; сравнения однократные, причинность неаддитивная.

WebGL2/MRT isolated brush: все четыре RGBA fixtures побайтно совпали на Surface.
GPU timer доступен,45 valid samples (5 на режим/повтор), disjoint/loss отсутствуют.
Для2/4/8 пар медианы WebGL1:7.209/13.879/18.311ms,
WebGL2:6.936/14.094/17.584ms, MRT:4.117/8.000/10.357ms.
MRT сокращает этот оператор приблизительно на42%; это не измерение Room/FPS.
Артефакт:temp/fast-watercolor-night/webgl2-surface-1791406339462.json.

CPU typed writer и paired wet raster включены локально, GPU кандидаты пока
под diagnostic flags OFF. Следующий гейт — frozen combined аппаратный replay,
потом undo/redo и живое рисование. 65selectedtests/types/lint прошли;
новые добавленные позже файлы требуют соответствующих дополнительных гейтов.
