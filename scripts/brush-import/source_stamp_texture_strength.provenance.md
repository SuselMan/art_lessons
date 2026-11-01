# Texture strength raw provenance retention only

The existing retain_source_stamp raw-settings selection now includes original
Texture/Strength/ fields. The caller in krita_import.py already delegates to this
single retention implementation; it needs no duplicate capture or translation.
PressureTexture/Strength/ and Custom/Curve fallbacks were already selected.
Original Sensor XML, Value, UseCurve, UseSameCurve, commonCurve, curveMode and
StrengthVersion remain original strings, including disabled/stale or multiple
sensor programs. Nothing is flattened into a canonical identity assertion.

No tenth standard option, compiled curve, shared type, source capability, BEGIN,
shader or execution policy is added. Existing current source version/reader labels
are unchanged by this retention-only extension. This is additive selected raw
metadata under existing limits, not a claim that the historical selected-settings
algorithm was byte-identical for sources that contain these additional keys.
Current retain_source_stamp emits source2, independently of this change; the
historical candidate35 DATA1 is not rewritten or upgraded here. New imports must
receive descriptor identity/hash according to the normal import pipeline. No
stored descriptor, sourceStamp or source archive is patched or mass-reimported.
Old portable data whose retained settings lack Texture/Strength/ keys reconstructs
from those same old keys as before; no new default fields are synthesized.

All existing raw setting key/value/count/aggregate budgets and portable
reconstruction checks remain in force. A future narrow program validator must
validate preserved original semantics; retaining a setting never grants support.
Metadata without these keys cannot prove pressure identity from an enabled flag.

Self-authored tests preserve identity XML, disabled UseCurve, multiple sensors,
common/custom curve strings and the original nine-option count; actual convert_krita
integration retains the program. A parent-source golden hash proves unchanged
canonical source JSON for a fixture with no newly selected settings. No vendor
artwork or embedded pattern is redistributed. GPU/native/canonical texture support
is not established by these importer tests.
