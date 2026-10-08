# OFF: показать эволюцию материала без RGBA8 feedback-заморозки

Измеренный pending alpha max31 после16шагов и support108worldpx, но экран почти неподвижен. Production `_advanceWashReveal` использует `step=1-exp(-dt/1400)` при held.startedAt=null. При16ms step≈0.01136; с нулевого пикселя alpha31×step≈0.352 округляется в0. Повторение111раз остаётся0. Это конкретный Q8 feedback механизм, не доказательство точного расписания каждого аппаратного frame.

OFF QA `diagnosticDirectPreview` показывает принадлежащий sealed-owner pending, который уже меняется существующей материальной диффузией. Дополнительного fade/blur нет. Первый pending копируется из LAST VISIBLE, а не из пониженного material: seal не меняет изображение. Первый diffusion-step может иметь ошибку low-resolution approximation; аппаратный filmstrip должен оценить её, CPU тесты этого не доказывают.

Перед source rebase pending(действительно показанный target) копируется в held.before; затем отсоединяется/retire. Canonical finish также переносит фактически видимый pending. После detach используется существующий reveal canonical endpoint. Все source fields/solver остаются прежними; defaultfalse. Пул/лимит3admissions/cleanup/fence прежние.

CPU:5runtime tests, включая last-visible initialcopy, exactdisplayed→before continuity, detachedfallback и численный threshold. ActualRoom installer7PASS. Hardware ещё не выполнен. Следующий ONE water400→pigment70 UP6frames + parentland/Dryhistory; source8 scope отдельно.
