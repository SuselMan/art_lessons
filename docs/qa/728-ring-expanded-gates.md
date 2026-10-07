# Расширенный физический контроль каёмки (#728)

CPU подготовка, аппаратный прогон ещё не выполнен. Source: cea6eff7d337b4fd6bd2eefc67404f6d55e91a3e. Runtime и пользовательские стенды не изменены.

## Неизменные данные

Три сценария — оригинальные curated journals sheet3 (42 операции), sheet4 (24), sheet10 (26). Полные байты скопированы в temp/ring-expanded; паспорта и packed/wet SHA — в соседнем tracked JSON. Никаких новых wet, remap timestamp/ID, удаления clear/undo или искусственного Dry. Размер страницы 3508×2480, Medium — из прежнего паспорта галереи; фактический runtime обязан подтвердить эти параметры. Image_import хранится в журнале: если controller не умеет replay изображения, исключение его должно быть явно отражено в отчёте, а material oracle относится только к нарисованному слою.

Sheet3: оригинальные puddle/pigment пары вокруг seq59/61/63/65, crops slots1–4. Sheet4: round pigment seq39/45/47/49, исходная вода и wet сохранены. Sheet10: flex seq25/31/33/35 с водными соседями; 480 dabs у seq31, поэтому это ограниченный crop, а не обещание короткого replay. Sheet9 оставлен следующим независимым контролем chisel98, не заменяет воду sheet4.

## Режимы и выполнение

Последовательно один engine: OFF (phase=false, ADD=false), PHASE (true,false), PHASE_ADD (true,true). Baked фиксирован ON во всех трёх, sourceRebase — одинаковый текущий default; остальные диагностические флаги не менять. Проверить реальные diagnosticPlateauPhase/diagnosticAdditiveZeroFaces и actual tau gate/operator counts; ADD без phase не считать отдельной физической моделью. Заморозить whole source SHA до загрузки. Все arms используют побайтно тот же журнал; reference payload не перепаковывается.

Перед каждым target зафиксировать полные SHA P/C/V/coverage/cost и размеры/fieldRect. Если predecessor outcomes уже отличаются, НЕ утверждать paired same-input target; дополнительно нужен checkpoint одного pre-target состояния и три isolated target arm от него. Такое различие ожидаемо при model ON на предшественниках и должно быть видно отдельно от end-to-end результата.

## Измерения и отрицательные проверки

Сохранить стадии исходного P, carry, diffuse, tide и final. Только непустые реальные buffers, прямой ограниченный readPixels с верным top→GLbottom; region world/UV bounds входят в паспорт. Финальный whole RGBA и отдельные crops. Сумма каждого материального P/C канала и premultiplied цвет сравниваются до/после, без объявления массовой консервативности по PNG. Проверить finite/nonnegative, насыщение byte255 и изменение общей массы; любой delta публикуется, а не скрывается нормализацией картинки.

Каёмка: профиль alpha/P через исходную dab boundary и отдельно outer wet-domain boundary; фиксированные линии из OFF/pre-target, не переизбирать их по результату ON. Измерить глубину локального провала относительно обеих соседних полос, ширину, долю контура с провалом. Цвет: channel ratios на одних и тех же непустых interior/fringe pixels, сумма C, premultiplied RGBA delta. Выцветание центра или исчезновение внешнего переноса не является успехом. Внешнее растекание: масса P вне исходного deposit support, радиус/площадь непустого support и separated-component leakage. Dry-gap/islands обязателен самостоятельный отрицательный reference из уже проверенного original domain oracle; отсутствие отдельной лужи в выбранном crop не доказывает disconnected safety.

Baseline OFF должен совпасть с текущим legacy operator на same fields. Default OFF сохраняется; нет публикации галереи и общего включения. Первым bounded run один sheet3; последующие два только после CLOSED и доступной памяти. Общие GPU времена не выводить из JS submit duration, readback здесь диагностический. Endpoint equality ожидается только OFF/runtime negative и повторе одного режима; различие физического candidate — измеряемый результат, не автоматический FAIL/PASS.
