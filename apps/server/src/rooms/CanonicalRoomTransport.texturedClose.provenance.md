# Interrupted material4/5 session close

Same existing closeBound path now admits genuine session material4/5 in its closed2/3/4/5 guard. Previously BEGIN+OPEN frame were admitted but direct close returned invalid_operation and genuine disconnect ticket translated that into canonical_repair_required. No6/unknown/masked context admitted; actualbinder, grant, descriptor/CAS, rowproof, prefix/closeverifier, cursor/lifetime/seat/writefence/append/durability laws unchanged.

prepareDisconnectedClose captures real seat+session and calls closeBound after durablePrefix; new tests use actual normal BEGIN4/5 and recorded unended frame. Direct close and genuine disconnect ticket both prove realtypedclose seq2/recordedNext1/first-lastactualframe. Wronglastframe, repeatedticket, aftercloseframe reject. Old2/3 disconnect/soft tests preserve copiedseat, staleconnection, liveahead, partialwrite/retry and typedEND/noemptyclose behavior. Orphan route has no session at this guard and is unchanged; no new orphan proof claimed.

RAM baseline finalRED4/4 actualoldguard semantics; samefixturesGREEN4, regression179/3PASS. Initial fixture mockprefix/cleanup failures retained separately, notproductfailures. TargetTS2roots0 required finalreceipt. No source/runtime/device/catalog changes during RAMunit; no nativepixel/performance claim.
