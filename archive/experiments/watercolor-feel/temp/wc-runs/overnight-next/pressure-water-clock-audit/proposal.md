# Pressure-aware water clock: conditional model, no runnable spec

Production step=segment/Rtravel, Rtravel=ab/transverseHalfWidth. This equals segment*transverseHalfWidth/(currentContactArea/pi). It therefore assumes available capacity scales with the CURRENT pressure-dependent footprint area. A smaller footprint has smaller implied capacity, so water runs out faster at weak pressure despite less strip area being touched.

A fixed nominal reservoir model uses step=segment*transverseHalfWidth/(referenceFullContactArea/pi).
Since transverseHalfWidth=ab/Rtravel, new/old step=currentContactArea/referenceFullContactArea. This preserves the existing orientation dependence of a flat nib. The naive replacement segment*Rtravel/Rnominal² swaps the flat-nib orientation physics and is retained only as counterexample.

Full-contact reference must use actual producer shape, not a circular B/2 area for chisel. CPU audit-fullcontact.mts derives genuine conditional nominal B from the previously audited firstdab inverse, forwards CURRENT preset tipFootprint at pressure1, no head/speed/tilt, and fixes its area as reference. This agrees with the existing clock at full contact in every orientation. It is a geometric calibration; reservoir volume proportional to this area is a phenomenological assumption, not a volume theorem.

Counterfactual actual retained streams:
9 finalwater .0521→.1120; mean .2581→.4481.
6 .04021→.04032; mean .15179→.16425.
1 .18712→.23156; mean .46930→.51598.
8 .19366→.23387; mean .47020→.51050.
Earlier transverse B/2 calibration outputs are explicitly NOT full-contact invariant for chisel; fullcontact file is preferred.

State/contract blocker: operations do not store nominal baseSize. Current genuine firstdab and known shaping allow conditional inverse (6B54/9B85/1B77/8B93), with forwardvalidation. Flex firstpressure<=.05 is nonidentifiable; old shape versions and live UIresize break universal truth. The reference area must be retained in scratch snapshot/apply across chunks, initialized once per true stroke; no per-chunk firstdab inverse and no future maximum pressure/size. This is a new initial capacity scalar, not a new physical simulation or contract. No safe exact runtime spec offered until scope/failure policy and this state lifetime are reviewed.

Only water step changes; pigment clock uses original step. Water pickup should use the same new water step if implementing this constitutive exchange; old paperwet digits remain immutable. This changes sourcewater/standing/hair/halo indirectly, so source geometry cannot be claimed unchanged. No GPU or production edits.
