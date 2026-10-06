# Chain-matched attachment return

The posting app can open the uploader with an exact `attachmentOrigin` and UUIDv4
`attachmentRequest`. The uploader preserves the normal wallet, SDK, funding and
refund path, then returns a confirmed public inscription identifier to its opener.
It never posts a BlockChan/HoodChan thread or reply automatically.

## Message contract

- The uploader sends `iq:attachment-ready` with the request ID.
- After a confirmed write it sends `iq:attachment-complete` with the same request
  ID, `network` (`solana` or `robinhood`) and `signature` (Solana signature or EVM
  transaction hash respectively). A slow/failed gateway notification does not
  delay handing back that confirmed result.
- An `iq:attachment-accepted` acknowledgement must match the request ID, original
  opener and exact origin. Retry attaching sends the same result, not another
  inscription. A closed opener leaves the saved identifier/link available.

Allowed production origins are `https://blockchan.sol.site`, `https://hoodchan.xyz`
and `https://blockchan.ar.io`. Loopback return origins are accepted only by a
loopback-hosted uploader. Origin strings cannot contain a path or credentials.
BlockChan origins pin Solana; HoodChan pins Robinhood. A mismatched initial route
is corrected to that network, and attachment mode disables the cross-chain hop.
Loopback flows pin their initial route without adding a query parameter. The
current route, adapter and Solana cluster are checked before connecting and again
after pending wallet/burner work, before funding or inscription. Completion and
retries retain the operation's network and result. The posting client additionally
validates network and identifier type.

Attachment mode accepts supported passive image, audio and video MIME types.
Solana automatic return requires this app's mainnet network; Robinhood return
uses the EVM adapter and network-tagged hash. HTML/SVG and malformed media are not
accepted as passive attachments. An unsuccessful write sends no completion.

Success exposes a readonly transaction ID and link with copy/open controls. If
clipboard access fails, the requested value is selected for manual copying.
Posting apps retain their existing-inscription-ID field for recovery. A successful
upload returns to the
saved draft; submitting that post remains a separate action.

Attachment mode skips automatic feed and markets scans on open/connect/completion.
Standalone uploads continue to use the ordinary board and markets UI. File names
use the encoded `;name=...;base64,` media parameter; the matching gateway parser
must deploy before attachment clients.

## Verification and rollout

Run `cd tests && npm ci --ignore-scripts && npm test` for the current regressions.
The suite includes the 19 regressions inherited unchanged from merged PR #4 and
the attachment cases: success/failure, exact origins, opener/request matching,
closed-parent recovery, transaction ID copying, chain-specific links, mismatched
initial routes, attempted cross-chain hops, pending wallet/burner changes,
operation-result recovery, passive MIME/base64 guards and attachment RPC-health
gating. Fixtures execute the actual page script but stub wallets and adapters;
write-sink counts prove routing only, with no paid transaction or chain receipt.
Codec playback, wallet signing and production popup headers are separate
acceptance checks. [Historical signed receipts and source pins](EVIDENCE.md) are
preserved separately from current controlled-provider tests.

The published Solana SDK 0.3.6 does not include the confirmation/resume patch in
SDK #25; interrupted-upload recovery needs an official release and explicit
consumer integration. Deploy the named-media gateway support from `iq-gateway`
PR #32 before the uploader and posting clients (`iq6900` PR #5 and `iq-chan`
PR #31). Their rollout must be coordinated. Deployed-origin/COOP/CSP checks,
fresh wallet signing and physical
mobile QA remain unverified for the reconciled build. No mainnet deployment or
new paid transaction is claimed by these regressions.

## Prepared PR #5 / #8 integration

The local paired candidate applies PR #8 `ad4b8a7` onto PR #5 `228c45b` and
resolves their shared page changes. It retains attachment origin/network/media
guards, transaction/link recovery and return retry together with wallet selection,
pending-session invalidation and confirmed inscription Retry. The page cache is
version 98 and its combined template is version 65; the EVM adapter matches PR #8.
Zo's hybrid progress/finalization observer, file/audio picker and notices, and
latest board-caption removal are retained from master `e0166cd`.

`npm --prefix tests test` passes 99 controlled regressions: both individual suites
with their 19 shared master cases counted once, plus two integration cases. One
changes the wallet and route while a Hood attachment write is pending, then
checks the original author, canonical transaction and network through both return
retry and inscription Retry even if notification throws. No new SDK write or
connection occurs for either confirmed retry. Opening a fresh standalone
composition still allows a new write with identical content.
The other refuses a changed network before funding, then verifies that editing
the reopened composition submits the newly selected file instead of the old
pending payload.
