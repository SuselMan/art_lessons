# Prepared peer: один запуск, результат неполный

Surface + отдельный VPS Room sender, коммит контроллера 16fd5af9, собственная комната KRDwTYIU. Это функциональная проверка малой кистью24; не сравнение производительности/GPU.

Структурный второй слой Auy0Vxhy подготовлен настоящим UI. VPS pencil DOWN/MOVE подготовлен до Surface water→pigment. Surface подтвердил pending predecessor и actual lease, активные PNG/snapshot вернули null. VPS UP завершён и реальный pencil контракт XZ8b_ih8xv получен на втором слое с правильным actor/strokeId.

Следующее ожидание — настоящая кнопка Undo на VPS — истекло через30s. Playwright подтвердил visible/enabled/stable и дошёл до performing click action. Нельзя по этому отличить обработчик Undo от занятого renderer/foreign replay. Получение peer source под Surface lease, Undo/Redo FIFO и финальные пиксели не доказаны: INCOMPLETE, не регрессия продукта.

UP VPS занял4.5ms по браузерным marker часам, после него контракт прочитан. Cleanup Surface UP спустя33.5s уже наблюдал lease=false/pending=false; это естественное завершение, не доказательство первоначального момента remote reception. Remote rows до Undo не были сохранены: диагностический пробел контроллера.

Source: Room handleUndo читает peekUndo, для destructive structural target может ждать confirm, иначе вызывает engine.undo. engine.undo вызывает appendOperation; этот путь способен синхронно завершать settle. В этом запуске нет интервалов этих методов, поэтому конкретная причина timeout не установлена.

Оба собственных context закрыты. Подвисший own VPS renderer блокировал finally restore: завершён только собственный child Chrome PID173361 с доказанным PPID172959; пользовательский Chrome не затронут. CDP transport и forward закрыты. RAM после закрытия1704MiB. Артефакт сохранён до finish; registry mixed-prepared-peer-5381 оставлен standard SAFE-HOLD active-process для root cleanup. Повтора не было.

Следующий offline шаг: bounded finally restore/close, сохранение received/source-state перед UI Undo и точные begin/end markers handler/append/settle без fences и изменения runtime. Не увеличивать timeout и не повторять hardware без allocation.

Read-only QA DB после cleanup: seq1 layer_add gM9OQakHNF; seq2 Awater Pi8gNixu6L; seq3 Bpencil XZ8b_ih8xv; seq4 Acleanup pigment g1gCUVTBaE. Operation Undo/Redo отсутствуют. Значит pencil действительно дошёл до сервера; прохождение Undo через emission не доказано. Отсутствие control в DB не отличает задержку до обработки click от синхронной работы перед emission.
