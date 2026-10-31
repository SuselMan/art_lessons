# Actual indexed history row evidence

getOperationsBeforeWithCanonicalRows uses the existing history query/filter/
ordering/limit with canonicalOperationRowSelect instead of data-only selection.
Every canonical discriminator is cross-checked against actual indexed room,
author, ID, seq, type, layer, tool and JSON before copying its small immutable
header. Returned evidence keeps those actual selected columns and points to the
same accepted immutable operation in the returned operations array. No row is
manufactured from an operation as persistence proof, and historical results are
not adopted into resident write receipts.

The existing getOperationsBefore delegates to .operations, preserving its legacy
array API. Layer dependency filtering, descending indexed query and ascending
response remain unchanged. There is no conditional HTTP response or capability
payload integration yet: snapshotRoutes still returns the old array. A future
read-authorized response assembler can pass canonicalRows to the existing
resolver's bounded attachment preparation; caller lifetime/read policy and whole
page delivery validation remain mandatory.

Tests verify the actual indexed select, ascending mixed history, independent
immutable canonical header, legacy shape, and corruption of each indexed
identity field before publication. Existing history query expectation now names
the shared indexed select. These mocked DB rows do not prove physical storage
or complete historical-prefix/cut semantics.
