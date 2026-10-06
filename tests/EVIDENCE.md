# Attachment verification evidence

Historical receipts, logs, screenshots and reference runners are preserved at
[NubsCarson/iq6900 @ be21ee37](https://github.com/NubsCarson/iq6900/tree/be21ee37d53527ccfd41311083614f748a411317).
Every externalized file matches that immutable source blob. This index keeps
historical evidence distinct from validation of a newer application revision.

| Run | Evidence | Scope and limits |
| --- | --- | --- |
| September 23 devnet return | [Receipts and byte comparison](https://github.com/NubsCarson/iq6900/blob/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/devnet-attachments.json) | Generated test signer and patched local SDK; not production-wallet acceptance. |
| September 23 actual-app integration | [Browser result](https://github.com/NubsCarson/iq6900/blob/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/sep23/browser-result.json), [signed receipts](https://github.com/NubsCarson/iq6900/blob/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/sep23/verified-receipts.json), [reference runners](https://github.com/NubsCarson/iq6900/tree/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/sep23/windows-reference) | Automatic return/manual recovery and byte readback on explicit devnet settings. Historical frontend/gateway versions; no mainnet posting. |
| September 23 Phantom QA | [Receipts](https://github.com/NubsCarson/iq6900/blob/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/phantom-devnet-20260923/final-receipts.json), [source pins](https://github.com/NubsCarson/iq6900/blob/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/phantom-devnet-20260923/source-pins.json) | Signed devnet evidence from those exact builds. It predates later upstream reconciliation. |
| September 25 local chain integration | [Solana fresh/existing and EVM receipts](https://github.com/NubsCarson/iq6900/tree/be21ee37d53527ccfd41311083614f748a411317/tests/evidence/local-final-20260925) | Surfpool/Anvil and patched SDK paths, including interrupted-upload tests. Not acceptance of the newer EVM hybrid flow. |

Current regressions run from this checkout with `cd tests && npm ci --ignore-scripts && npm test`.
They exercise the checked-in product code with controlled wallet/SDK/network
responses; they do not spend funds or post to a chain. The portable local-chain
runner remains in `tests/local-inscribe.cjs` with its loopback/genesis guards.

`handoff.test.cjs` covers chain-pinned return routing, transaction-ID recovery,
pending wallet/burner changes and the original BlockChan-to-Hood route-switch
countercase. A fixture adapter call is routing evidence, not a paid-chain
receipt. The 19 funding/viewer/legacy tests from merged PR #4 are inherited
unchanged; the opt-in Surfpool runner is also unchanged.

PR #5 was reconstructed as one net-new commit on master `de164ef`, avoiding
replay of the prior merge-heavy branch history, then rebased through `e851b87`
onto master `e0166cda0a68af9d4dc8e1961133033f3418087c`. The rebase preserves upstream hybrid
`onStatus` progress, file/audio token selection and file notices. The adapter
and SDK files remain unchanged. The latest board-caption removal is also retained.
The original `efdc02e` remains in the readiness
checkout and local `codex/iq5-original-review-20261005` reference; the pre-rebase
`72b26ca` is retained at local `codex/iq5-before-e851-20261005`.

Rollout gates remain separate: official Solana SDK confirmation/resume release,
gateway media deployment, deployed opener/CSP behavior, fresh wallet signing and
physical-mobile acceptance. Historical logs never discharge those newer gates.
