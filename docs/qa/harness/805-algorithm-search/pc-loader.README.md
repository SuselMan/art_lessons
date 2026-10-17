# PC cross-device adapter, no Samsung/shared runner changes

Prepared18Oct. Skills home-device-access/access and grafetto-device-testing/device refs read. **Do not execute until root/soleGPUoperator handoff.** Author launched no browser, context, forward or task. Read-only SSH metadata in registered private flowcache `pc-readonly-metadata.json`: WIN-JEQONSJMBO7, IntelUHD driver32.0.101.7088, Explorer session1. USERChrome16868 and unrelated747Chrome8364/port9236 are NOT ours for this task: do not reuse/stop them.

## Fresh own browser, operator only

1. Choose a unique ASCII root `C:\Windows\Temp\grafetto805-flow-20261018-<nonce>`; create NEW directory through cached `ssh lanpad-pc`, copy `pc-launch.ps1` and `pc-cleanup.ps1` there. No authURL/token goes ontoPC or into command arguments.
2. Execute copied `pc-launch.ps1 -ResourceRoot <root> -DebugPort 9238 -TtlSeconds 900`. It checks ONLY chosen port, refuses collisions, restricts folderACL to ownerSID/SYSTEM/admin, creates fresh `profile`, temporary Interactive scheduled tasks for currentSID (RunLevelLimited). Tasks unregister immediately afterstart. A separate verifiedPID TTLwatchdog starts BEFOREChrome; ifwatchdog PID isn't observed, noChrome starts. No existing task such as GrafettoChrome runs, no browser is stopped, no GPU acceleration overrides/headless mode.
3. Save private `browser-ledger.json` and `watchdog-ledger.json` to registered flowcache. Browser root must be session>0 and exact newprofile/debug9238. If session0/launcherror, do not call it hardware or performance proof; cleanup ownledger. **Launcher is parser-checked, not yet live-launch-tested.** Existinginteractive SID pattern was previously used onthisPC; foreground/unlocked desktop is not guaranteed.
4. Create own bounded VPS SSHforward, explicit loopback: `ssh -N -T -o ExitOnForwardFailure=yes -L 127.0.0.1:19358:127.0.0.1:9238 lanpad-pc`, wrapped in timeout/recordedPID with TTL≤profilewatchdog+60s. Check9238 is the NEWprofile, never old9236. No router/default route/DNS/IR/projector/power settings change.

## Run on explicit endpoint

Set usual private `QA_BUILD`, `QA_OUTPUT`, `QA_CASES_FILE` plus:

```
QA_PC_CDP_ENDPOINT=http://127.0.0.1:19358
QA_PC_ACCESS_FILE=/path/to/private/access.json
QA_PC_CONTEXT_TTL_MS=600000
QA_PC_EXPECT_HARDWARE=intel
```

Execute `node docs/qa/harness/805-algorithm-search/pc-flow-run.cjs`. This is a standalone current flow-run copy with PCqualification/adapter selection; Samsung files unchanged. `pc-loader.cjs` imports commonreadBuild/hash/resourceName only. It rewrites returnedWebSocketHOST toexplicitforward, createsONEnewincognitocontext, injects privatecookie there, pins manifestbytes viaFetch, and disposesONLYowncontext/target onfinally/TTL. It NEVERcallsBrowser.close. Foreignsession events ignored. Runtime/rendererrors failgate. ActualWebGL/WebGPUworker hardware must identifyIntel and notsoftware; identity comesfromworker, notWMI/browserbrand. Input-reference CPUcases are not hardwareproof. Lifecyclevisibility recorded; results are NOTUI/foreground/FPSproof.

## Hash interpretation

Use the SAMEfrozen buildmanifest and SAMEcasejson onSamsung/PC. Compare `sourceHashes`, `fixtureSHA`, algorithm/config/encoding, dimensions, capturedcommonSHA, then fullresult hashes (or private rawRGBA outside timing). Eachreport repeatExact means SAMEGPUrepeat only. Cross-device equality needs actualpairedoutputs; GLintegerstorage is not automaticportable-math proof (FPtransfercoefficients remain), and WebGPUf32 may vary. Anydifference must be quantified, not wavedaway asdeterministic. No source transformation/extraGPUreads are added by adapter.

## Cleanup (operator finally)

Runner closes ownincognitocontext. Then execute own `pc-cleanup.ps1 -Ledger <root>\browser-ledger.json`: it verifies805root/profile/SID, CURRENTPID/name/exactuser-data-dir/creation before stoppingONLYownprofileprocesses; verifieswatchdogPID/script before stoppingit, removesownprofile onlywhenprocessmatchesgone (lockedfiles produceexplicitfailure). TTLwatchdog does same evenifSSHdies. Keep private cleanup.json+ledgers onVPS, stop ONLYownforwardPID, verifyremoteownPIDs/profilegone; then remove ONLYnew805root tiny scripts/ledgers afterproofcopy. Neverkill747/profile or USERChrome. Do not report completecleanup if remainingPIDs/lockedprofile/errors exist.

CPU3CDPmocktests pass: endpointrestrictions, owncontextonly/idempotentcleanup/foreign-events/no sharedloader mutation, createTargetthrow disposescontext. Nodeparse pass. PowerShellLanguageParser ParseInput checks viareadonlySSH report0errors; scripts themselves were NOTexecuted. A diagnosticstdin-parser hung inWindowsSSH; both exactownedparsePIDs were cleaned and finalquery0remaining, recordedprivately. No extra runtime/dependency copies/services.

Per-case `exportRaw:true` (v6entry required) exports returned4MiBcarrier aftertiming. PCrunner removes carrierBase64 before ANYreportserialization, verifies SHA equals result.hashes[0], savesmode600`NNN-output.rgba.gz` with raw/gziphashes. Decompress/hash these private registeredcache files for cross-device channel diff; no extra GPUdraw/read. Missing/short/mismatcheddata fails closed.2CPUrawhelper tests include gziproundtrip, permissions, failures and unsolicitedbase64stripping. For such cases old QA_EXPORT_FLOW_RAW observer is not used; ordinarycases can retainold behavior. Rawfiles are private temporaryproof, not Git/galleryassets; compactdiff before TTLcleanup.
