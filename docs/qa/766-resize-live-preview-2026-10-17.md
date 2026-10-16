# #766: viewport resize удалял чужую удерживаемую акварель

На настоящем Samsung Adreno 650 подтверждён отдельный дефект. Наблюдатель
получает два live-пакета (1+4 dabs), у автора перо удерживается и очередь пуста.
Затем естественный ResizeObserver дважды вызывает `resizeCanvas` через ~0,6 с.
Тот же engine сохраняет активный `_peerLiveStrokes`, но `clear(false)` удаляет
весь WatercolorLivePreview. На экране ROI снова имеет 0 изменённых каналов.
Прямые control sockets из этапа убраны: эффект сохраняется. GL errors нет.

При resize теперь освобождаются все старые film buffers, затем в рамках того же
лимита 64 MiB выделяются новые. Незаписанные world-space dabs, received/committed
cursors, suppression и маркеры поздних пакетов сохраняются; dabs перерисовываются
от нового origin. Canonical материал, операции и export не получают эти данные.
Cancel/peer leave/context loss по-прежнему очищают временный след.

Engine regression до изменения FAIL: после resize пропадал stream. После
исправления сохраняются два pending dabs после частичного commit, корректные
размеры нового буфера, точные байты канонического слоя; последующее подтверждение
удаляет только оставшийся хвост. 40 тестов в пяти файлах PASS, web TypeScript и scoped lint PASS.
Аппаратный повтор естественного ResizeObserver выполняется отдельно.

Полный engine suite интеграции #747: 2088 PASS и один устаревший assertion,
ожидавший пять аргументов source вместо шести. Assertion теперь также проверяет
pin и strict beforeRecordedOpId; его файл вошёл в повторные 40 PASS. Это не
объявляется полным новым suite PASS до следующего полного запуска.
