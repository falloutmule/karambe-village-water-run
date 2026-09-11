# Independent critic pass 2 — progression integration

Reviewed state: working tree build `karambe-unlock1`, after the baseline release
progression repair and before final deployment.

This fresh reviewer independently inspected the implementation and ran
`build:check`, `typecheck`, the 40 gameplay checks, 52 release checks, 152 control
assertions plus unfrozen native CDP input coverage, the phone-access suite at
320×568, 390×844 and 412×915, and deterministic L2/L3 route checks. The result
was **PASS** for local browser behavior.

It confirmed that a fresh release hides Level Select; the game API blocks direct
level entry; Levels 1 and 2 do not unlock it; a sequential full L1→L2→L3 clear
writes the permanent flag; the selector appears immediately and survives reload;
best-time data cannot create the unlock; corrupt best-time JSON cannot revoke it;
and local/file development access bypasses selection without writing release
progress or records. The public-host query flag remains rejected by the hostname
boundary in source.

No material bypass, false unlock, stale selector, offline packaging regression,
or control regression was found. This pass did not test the candidate on deployed
GitHub Pages or a physical Samsung; those remain separate release evidence.
