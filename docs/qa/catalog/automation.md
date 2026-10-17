# Автоматизация: покрытие и запуск

Все 56 E2E specs baseline имеют владельца в [e2e-map.json](e2e-map.json). Это связь с кейсом, а не утверждение полного покрытия всех ручных перестановок. Запуск конкретного файла: `npx playwright test <путь> --project=chromium`; список без исполнения — добавить `--list`. Предусловия и ограничения: [execution](execution.md).

| Файл | Кейс | Вид покрытия |
|---|---|---|
| [allToolsCollaboration.spec.ts](../../../e2e/specs/allToolsCollaboration.spec.ts) | [QA-003](../scenarios/collaboration.md#qa-003) | Браузер; устройство/GPU и вариант фиксируются в run |
| [annotations.spec.ts](../../../e2e/specs/annotations.spec.ts) | [QA-113](interface.md#qa-113) | Браузер; устройство/GPU и вариант фиксируются в run |
| [boardCamera.spec.ts](../../../e2e/specs/boardCamera.spec.ts) | [QA-109](interface.md#qa-109) | Браузер; устройство/GPU и вариант фиксируются в run |
| [boards.spec.ts](../../../e2e/specs/boards.spec.ts) | [QA-109](interface.md#qa-109) | Браузер; устройство/GPU и вариант фиксируются в run |
| [classMode.spec.ts](../../../e2e/specs/classMode.spec.ts) | [QA-110](interface.md#qa-110) | Браузер; устройство/GPU и вариант фиксируются в run |
| [clipboardAcrossRooms.spec.ts](../../../e2e/specs/clipboardAcrossRooms.spec.ts) | [QA-104](interface.md#qa-104) | Браузер; устройство/GPU и вариант фиксируются в run |
| [collaborationMatrix.spec.ts](../../../e2e/specs/collaborationMatrix.spec.ts) | [QA-017](../scenarios/collaboration.md#qa-017) | Браузер; устройство/GPU и вариант фиксируются в run |
| [colorWell.spec.ts](../../../e2e/specs/colorWell.spec.ts) | [QA-101](interface.md#qa-101) | Браузер; устройство/GPU и вариант фиксируются в run |
| [contextLoss.spec.ts](../../../e2e/specs/contextLoss.spec.ts) | [QA-012](../scenarios/collaboration.md#qa-012) | Браузер; устройство/GPU и вариант фиксируются в run |
| [digitalBrush.spec.ts](../../../e2e/specs/digitalBrush.spec.ts) | [QA-103](interface.md#qa-103) | Браузер; устройство/GPU и вариант фиксируются в run |
| [draw.spec.ts](../../../e2e/specs/draw.spec.ts) | [QA-001](../scenarios/collaboration.md#qa-001) | Браузер; устройство/GPU и вариант фиксируются в run |
| [eraseThroughLayers.spec.ts](../../../e2e/specs/eraseThroughLayers.spec.ts) | [QA-107](interface.md#qa-107) | Браузер; устройство/GPU и вариант фиксируются в run |
| [eyedropper.spec.ts](../../../e2e/specs/eyedropper.spec.ts) | [QA-106](interface.md#qa-106) | Браузер; устройство/GPU и вариант фиксируются в run |
| [fill.spec.ts](../../../e2e/specs/fill.spec.ts) | [QA-103](interface.md#qa-103) | Браузер; устройство/GPU и вариант фиксируются в run |
| [flexibleHairline.spec.ts](../../../e2e/specs/flexibleHairline.spec.ts) | [QA-017](../scenarios/collaboration.md#qa-017) | Браузер; устройство/GPU и вариант фиксируются в run |
| [floatingPanel.spec.ts](../../../e2e/specs/floatingPanel.spec.ts) | [QA-102](interface.md#qa-102) | Браузер; устройство/GPU и вариант фиксируются в run |
| [floatingPanelSlots.spec.ts](../../../e2e/specs/floatingPanelSlots.spec.ts) | [QA-102](interface.md#qa-102) | Браузер; устройство/GPU и вариант фиксируются в run |
| [imageImportGizmo.spec.ts](../../../e2e/specs/imageImportGizmo.spec.ts) | [QA-105](interface.md#qa-105) | Браузер; устройство/GPU и вариант фиксируются в run |
| [infiniteRoom.spec.ts](../../../e2e/specs/infiniteRoom.spec.ts) | [QA-109](interface.md#qa-109) | Браузер; устройство/GPU и вариант фиксируются в run |
| [inputOwnership.spec.ts](../../../e2e/specs/inputOwnership.spec.ts) | [QA-013](../scenarios/collaboration.md#qa-013) | Браузер; устройство/GPU и вариант фиксируются в run |
| [joinGate.spec.ts](../../../e2e/specs/joinGate.spec.ts) | [QA-111](interface.md#qa-111) | Браузер; устройство/GPU и вариант фиксируются в run |
| [layerConflicts.spec.ts](../../../e2e/specs/layerConflicts.spec.ts) | [QA-005](../scenarios/collaboration.md#qa-005) | Браузер; устройство/GPU и вариант фиксируются в run |
| [layerEditing.spec.ts](../../../e2e/specs/layerEditing.spec.ts) | [QA-108](interface.md#qa-108) | Браузер; устройство/GPU и вариант фиксируются в run |
| [layerFilter.spec.ts](../../../e2e/specs/layerFilter.spec.ts) | [QA-007](../scenarios/collaboration.md#qa-007) | Браузер; устройство/GPU и вариант фиксируются в run |
| [layerSolo.spec.ts](../../../e2e/specs/layerSolo.spec.ts) | [QA-108](interface.md#qa-108) | Браузер; устройство/GPU и вариант фиксируются в run |
| [leaveGuard.spec.ts](../../../e2e/specs/leaveGuard.spec.ts) | [QA-114](interface.md#qa-114) | Браузер; устройство/GPU и вариант фиксируются в run |
| [lessonControls.spec.ts](../../../e2e/specs/lessonControls.spec.ts) | [QA-110](interface.md#qa-110) | Браузер; устройство/GPU и вариант фиксируются в run |
| [liveLatency.spec.ts](../../../e2e/specs/liveLatency.spec.ts) | [QA-014](../scenarios/collaboration.md#qa-014) | Браузер; устройство/GPU и вариант фиксируются в run |
| [offlineLostWork.spec.ts](../../../e2e/specs/offlineLostWork.spec.ts) | [QA-008](../scenarios/collaboration.md#qa-008) | Браузер; устройство/GPU и вариант фиксируются в run |
| [paperFailure.spec.ts](../../../e2e/specs/paperFailure.spec.ts) | [QA-111](interface.md#qa-111) | Браузер; устройство/GPU и вариант фиксируются в run |
| [pasteMipmaps.spec.ts](../../../e2e/specs/pasteMipmaps.spec.ts) | [QA-105](interface.md#qa-105) | Браузер; устройство/GPU и вариант фиксируются в run |
| [peer.spec.ts](../../../e2e/specs/peer.spec.ts) | [QA-001](../scenarios/collaboration.md#qa-001) | Браузер; устройство/GPU и вариант фиксируются в run |
| [projectCopyUi.spec.ts](../../../e2e/specs/projectCopyUi.spec.ts) | [QA-112](interface.md#qa-112) | Браузер; устройство/GPU и вариант фиксируются в run |
| [rebuildSpill.spec.ts](../../../e2e/specs/rebuildSpill.spec.ts) | [QA-019](../scenarios/collaboration.md#qa-019) | Браузер; устройство/GPU и вариант фиксируются в run |
| [reconnect.spec.ts](../../../e2e/specs/reconnect.spec.ts) | [QA-008](../scenarios/collaboration.md#qa-008) | Браузер; устройство/GPU и вариант фиксируются в run |
| [rememberedTool.spec.ts](../../../e2e/specs/rememberedTool.spec.ts) | [QA-101](interface.md#qa-101) | Браузер; устройство/GPU и вариант фиксируются в run |
| [reviewImage.spec.ts](../../../e2e/specs/reviewImage.spec.ts) | [QA-113](interface.md#qa-113) | Браузер; устройство/GPU и вариант фиксируются в run |
| [roomHeader.spec.ts](../../../e2e/specs/roomHeader.spec.ts) | [QA-114](interface.md#qa-114) | Браузер; устройство/GPU и вариант фиксируются в run |
| [roomOpenMetrics.spec.ts](../../../e2e/specs/roomOpenMetrics.spec.ts) | [QA-114](interface.md#qa-114) | Браузер; устройство/GPU и вариант фиксируются в run |
| [roomPreviews.spec.ts](../../../e2e/specs/roomPreviews.spec.ts) | [QA-112](interface.md#qa-112) | Браузер; устройство/GPU и вариант фиксируются в run |
| [ruler.spec.ts](../../../e2e/specs/ruler.spec.ts) | [QA-106](interface.md#qa-106) | Браузер; устройство/GPU и вариант фиксируются в run |
| [selectionActions.spec.ts](../../../e2e/specs/selectionActions.spec.ts) | [QA-104](interface.md#qa-104) | Браузер; устройство/GPU и вариант фиксируются в run |
| [selectionTap.spec.ts](../../../e2e/specs/selectionTap.spec.ts) | [QA-104](interface.md#qa-104) | Браузер; устройство/GPU и вариант фиксируются в run |
| [shapes.spec.ts](../../../e2e/specs/shapes.spec.ts) | [QA-103](interface.md#qa-103) | Браузер; устройство/GPU и вариант фиксируются в run |
| [smudgeSeam.spec.ts](../../../e2e/specs/smudgeSeam.spec.ts) | [QA-106](interface.md#qa-106) | Браузер; устройство/GPU и вариант фиксируются в run |
| [snapshot.spec.ts](../../../e2e/specs/snapshot.spec.ts) | [QA-036](watercolor.md#qa-036) | Браузер; устройство/GPU и вариант фиксируются в run |
| [snapshotAccess.spec.ts](../../../e2e/specs/snapshotAccess.spec.ts) | [QA-111](interface.md#qa-111) | Браузер; устройство/GPU и вариант фиксируются в run |
| [toolGroup.spec.ts](../../../e2e/specs/toolGroup.spec.ts) | [QA-101](interface.md#qa-101) | Браузер; устройство/GPU и вариант фиксируются в run |
| [toolSettingsTab.spec.ts](../../../e2e/specs/toolSettingsTab.spec.ts) | [QA-101](interface.md#qa-101) | Браузер; устройство/GPU и вариант фиксируются в run |
| [toolSync.spec.ts](../../../e2e/specs/toolSync.spec.ts) | [QA-101](interface.md#qa-101) | Браузер; устройство/GPU и вариант фиксируются в run |
| [transformCommit.spec.ts](../../../e2e/specs/transformCommit.spec.ts) | [QA-105](interface.md#qa-105) | Браузер; устройство/GPU и вариант фиксируются в run |
| [transformSeam.spec.ts](../../../e2e/specs/transformSeam.spec.ts) | [QA-105](interface.md#qa-105) | Браузер; устройство/GPU и вариант фиксируются в run |
| [trueOrder.spec.ts](../../../e2e/specs/trueOrder.spec.ts) | [QA-002](../scenarios/collaboration.md#qa-002) | Браузер; устройство/GPU и вариант фиксируются в run |
| [uiAnnotationDefaults.spec.ts](../../../e2e/specs/uiAnnotationDefaults.spec.ts) | [QA-113](interface.md#qa-113) | Браузер; устройство/GPU и вариант фиксируются в run |
| [undo.spec.ts](../../../e2e/specs/undo.spec.ts) | [QA-006](../scenarios/collaboration.md#qa-006) | Браузер; устройство/GPU и вариант фиксируются в run |
| [version.spec.ts](../../../e2e/specs/version.spec.ts) | [QA-114](interface.md#qa-114) | Браузер; устройство/GPU и вариант фиксируются в run |

## Специальные старые проверки

| Кейсы | Исходник | Запуск/граница |
|---|---|---|
| QA-018 | [index.watercolorCoarseSettle.test.ts](../../../apps/web/src/engine/index.watercolorCoarseSettle.test.ts) | `npx vitest run apps/web/src/engine/index.watercolorCoarseSettle.test.ts --maxWorkers=1`; MockGL не GPU |
| QA-019 | [index.rebuildSpill.test.ts](../../../apps/web/src/engine/index.rebuildSpill.test.ts) | `npx vitest run apps/web/src/engine/index.rebuildSpill.test.ts --maxWorkers=1`; MockGL не GPU |
| QA-022 | [watercolorParity.mjs](../../../apps/web/scripts/devices/watercolorParity.mjs) | node + DEVBRIDGE_PORT/DEVBRIDGE_URL и device IDs; [условия](execution.md) |
| QA-022 | [charcoalParity.mjs](../../../apps/web/scripts/devices/charcoalParity.mjs) | node + DEVBRIDGE_PORT/DEVBRIDGE_URL и device IDs; [условия](execution.md) |
| QA-023 | [parkedWashParity.mjs](../../../apps/web/scripts/devices/parkedWashParity.mjs) | node + DEVBRIDGE_PORT/DEVBRIDGE_URL и device IDs; [условия](execution.md) |
| QA-023 | [index.parkedWash.test.ts](../../../apps/web/src/engine/index.parkedWash.test.ts) | `npx vitest run apps/web/src/engine/index.parkedWash.test.ts --maxWorkers=1`; MockGL не GPU |
| QA-024 | [markerRibbonParity.mjs](../../../apps/web/scripts/devices/markerRibbonParity.mjs) | node + DEVBRIDGE_PORT/DEVBRIDGE_URL и device IDs; [условия](execution.md) |

QA-020/021 — аппаратный протокол, универсального standalone runner нет; кейс исполняется вручную. QA-013/014/016 также имеют частичные unit-регрессии; браузерные файлы выше остаются основной точкой запуска.

## NIGHT

Точная привязка всех новых кейсов к сохранённым harness/unit: [night-cases.json](night-cases.json). Проверяется существование пути именно в pinned git tree. Чтение и доступ: [NIGHT](sources.md#night); запуск и обязательные переменные — [execution](execution.md). Ручные QA-048/050/051 не имеют готового runner. Наличие harness без подготовленного seed/auth/устройства не означает автоматизацию одним нажатием.
