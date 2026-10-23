QA #689, сценарий QA-015. Последний main8990c479 + локальные QA fixes, real headed Chrome/AMD, HTTPS5288/API4593.

Шаги:
1. Автор рисует на слое и открывает «Filters…», Gaussian Blur Radius6.
2. Второй участник удаляет этот слой.
3. Диалог у автора исчезает.
4. Второй участник отменяет своё удаление (undo).

Фактически: диалог фильтра сам открывается снова, перехватывает input/focus, хотя пользователь его не открывал. `filterLayerId` остаётся в Room; условный render просто скрывает FilterPanel на время отсутствия слоя. Undo снова делает условие истинным.
Ожидание: удаление целевого слоя завершает диалог и его preview; восстановление слоя не открывает UI без нового действия пользователя.

Регрессия `layerFilter.spec.ts` «a deleted filter target stays dismissed…» воспроизводит FAIL на последнем assertion (layer restored, dialog visible). Screenshot/video/trace сохранены в temp/device-runs/qa-2026-10-02/fixed-e2e-artifacts/. Локальная узкая правка будет сбрасывать target, когда диалог больше недоступен.
