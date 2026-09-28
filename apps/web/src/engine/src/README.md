---
layer: engine-internals
summary: внутренности движка
issues: [647]
tags: [webgl1]
---
# engine/src — внутренности движка

Внутренности WebGL-движка за фасадом `engine/index.ts`: буферы и тайлы, дабы и геометрия следа,
пресеты инструментов, бумага, ввод указателя, операционный лог и снапшоты, шейдеры, фильтры
слоя. Снаружи движка сюда не импортируют — только через `PencilEngineAPI`.

## Заметки

- Смысловые куски этой папки — группы карты (`docs/architecture/map.yaml` → `groupings`):
  engine-buffers, engine-dabs, engine-presets, engine-paper, engine-input, engine-oplog,
  engine-raster, engine-filters. В коде этих групп нет; когда папку разложат по подпапкам,
  описание группы переедет в README новой подпапки.
