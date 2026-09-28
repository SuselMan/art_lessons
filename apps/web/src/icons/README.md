---
layer: platform
summary: иконки
tags: [иконки]
---
# icons — иконки

Список иконок, из которого печётся 5 КБ subset Material Symbols. `IconName` — union-тип, поэтому
неописанная иконка это ошибка типизации, а не невидимая кнопка.

## Заметки

- Добавить иконку = дописать имя в iconNames.ts и запустить `npm run bake:icon-font`. Никогда не
  расширяй проп `icon` обратно до string.
