# Shared decoded prefix transition

Pure metadata only: advanceCanonicalMaterialPrefix factors the existing server
admission cross-frame entry/group/end transition. verifyCanonicalRecordedPrefix
checks a caller-bounded nonempty recorded sequence from ordinal0, ordered unique
server sequence/IDs and no after-end frame. Input frames must already be decoded
under one verified immutable material/context; this helper is neither a material
schema nor DB/read/paint authority. Open prefixes remain open. No lifetime32 frame
cap is imposed; the owning reader bounds normalized bytes/work. Eleven focused
pure tests include202 legal structural cuts and incremental/bulk equivalence.
