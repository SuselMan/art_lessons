# Persisted UI ready stages, 17.10.2026

Exact own-fixture SELECT only. Times start at join submission; they exclude page navigation, automatic name-form handling and first image visibility.

Original100 OFF/ON records are **empty-room entry before100 strokes are seeded**. They do not establish100-stroke room-load performance.

| Case | Platform | UI ready ms | Join | Paper | Snapshot | Replay | Tail ops | Snapshot base |
|---|---|---:|---:|---:|---:|---:|---:|---|
| hidden100-off | windows | 587 | 422 | 162 | 0 | 3 | 0 | False |
| hidden100-off | windows | 511 | 335 | 174 | 0 | 2 | 0 | False |
| hidden100-on | windows | 584 | 402 | 181 | 0 | 2 | 0 | False |
| hidden100-on | windows | 413 | 263 | 149 | 0 | 1 | 0 | False |
| hidden100-off2 | windows | 573 | 414 | 157 | 0 | 2 | 0 | False |
| hidden100-off2 | windows | 520 | 363 | 156 | 0 | 2 | 0 | False |
| hidden100-on2 | windows | 556 | 384 | 171 | 0 | 2 | 0 | False |
| hidden100-on2 | windows | 471 | 329 | 140 | 0 | 1 | 0 | False |
| hidden100-off3 | windows | 584 | 387 | 195 | 0 | 1 | 0 | False |
| hidden100-off3 | windows | 454 | 297 | 155 | 0 | 2 | 0 | False |
| hidden100-on3 | windows | 523 | 353 | 169 | 0 | 1 | 0 | False |
| hidden100-on3 | windows | 442 | 311 | 129 | 0 | 1 | 0 | False |
| annotation-board-0 | linux | 249 | 191 | 57 | 0 | 1 | 0 | False |
| annotation-board-0 | linux | 238 | 166 | 44 | 0 | 28 | 3 | False |
| annotation-board-0 | linux | 578 | 259 | 58 | 260 | 1 | 1 | True |
| annotation-board-0 | linux | 536 | 183 | 52 | 300 | 1 | 1 | True |
| annotation-board-0 | linux | 467 | 183 | 55 | 227 | 2 | 1 | True |
| annotation-board-0 | linux | 626 | 184 | 53 | 388 | 1 | 1 | True |
| annotation-board-0 | windows | 943 | 404 | 195 | 340 | 4 | 1 | True |
| annotation-board-0 | linux | 594 | 190 | 57 | 345 | 3 | 4 | True |
| annotation-board-0 | linux | 683 | 186 | 57 | 390 | 51 | 5 | True |
| annotation-board-0 | linux | 632 | 121 | 43 | 356 | 112 | 5 | True |
| annotation-board-1 | linux | 214 | 172 | 42 | 0 | 1 | 0 | False |
| annotation-board-1 | windows | 724 | 395 | 200 | 0 | 130 | 3 | False |
| annotation-board-2 | linux | 218 | 171 | 47 | 0 | 1 | 0 | False |

Annotation records share existing lesson/root URL across attempts. The database does not store annotation-mode or GPU identifiers, so individual persisted rows cannot reliably be labelled normal vs annotation from these records alone. Linux/Windows is retained as recorded; no Samsung assertion.

Separate early-review-image latches prove a512×512 image was observed with annotation mode and early history active for all3boards, while engine history length was0. Their document performance timestamps are **not navigation durations** and are not mixed with UI-ready metrics.

No new GPU, browser navigation, fixtures or mutations were used.
