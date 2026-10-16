# Adversarial online GPU baseline

Runtime ce68a405, M70 R2, AMD Vega + Intel Surface, disposable 512px rooms. No production/user room changes.

- #743: water and pigment visible on both observers before UP. Cancellation restores baseline exactly (0 changed channels, screen-cache hashes equal). Disconnect removes preview metadata but leaves 432 changed RGB channels on the displayed canvas after natural RAFs. DOM peer cursors hidden consistently, so this is a presentation defect. Earlier unhidden-cursor cancellation failures were invalid and discarded.
- #747/#758: all three authors start different layers before receiving another committed stroke. Each initially has one wet layer. Server accepts all three strokes; every client subsequently throws the two-wet-layer limit error.
- #760: independent red rectangle has 10,000 actual red pixels immediately, zero after native M70 goal presentation. No close, canonical export or oracle called before the final readback.

These are pre-fix reproductions, not a passing build. Detailed compact measurements accompany this file. Own browser contexts closed; registered Chrome profiles, SSH forwards, disposable cache and fixture rooms remain for follow-up QA.
