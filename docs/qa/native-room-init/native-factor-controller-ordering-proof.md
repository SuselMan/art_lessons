# Исправление порядка проверки interactive factor

Два прогона (086c и d353) остановились из-за ошибки контроллера: проверка factorObserved выполнялась раньше извлечения combinedConsumption. CDP-запрос метаданных не был достигнут; причина не в сериализации.

Реальный controller теперь вызывает общий post-input phase: canonical idle → существующий backend ACK → CDP metadata → запись response shape и parsed consumption → проверки factor/observed → snapshots. Невалидные метаданные сохраняются до assertion. Общий finally восстанавливает собственные hooks через closeOwn до закрытия WebSocket и освобождает pending requests.

Subprocess запускает настоящий controller.mjs с отдельной offline fixture entry. Он использует тот же post-input phase и тот же transport finally; CDP и owned descriptor restoration моделируются. Это доказательство порядка orchestration, сохранения ошибок и cleanup, а не проверки UI, GPU или модели. Отрицательный legacy-order сценарий воспроизводит прежнюю ошибку до CDP. Другие случаи: invalid encoded count с сохранёнными metadata и CDP exception без придуманных данных.

Targeted tests: 10 PASS; app TypeScript (`tsconfig.app.json`) PASS. Новые аппаратные прогоны не выполнялись. Два исторических interactive результата остаются INVALID; подтверждённая точность отдельной factor OFF/ON пары не меняется.
