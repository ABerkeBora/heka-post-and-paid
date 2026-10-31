# Post and Paid interface

- Style: Accent ladder, seed 1095163521. DM Sans downloaded from the official Google Fonts distribution and loaded locally, weights 400/500/600/700. Font license in public/fonts/OFL.txt.
- Palette kept from the approved product brief: warm studio ground #f6f2f1, rose #a63759 on small marks, budget usage and the paid fee; pale rose on working statuses. No gradients, shadows or motion entrances.
- Shell substitution: no sidebar, because this product has one agreement and two views. A 230px navigation column would waste the post/terms workspace. Product mark is an original P with a payment check; it is not a generic letter in a square.
- Question: which signed snapshot did the agent buy, and did its fixed creator fee pay out?
- Signature element: the source post sits beside its immutable fee, then the same agreement continues into the separate data/funding/payout receipt trail. The large fee answers whether the creator was paid.
- Objects: one pinned post, one fixed author, required campaign substring, publication window, fixed creator wallet, brand wallet, escrow amount in wei, API mandate units, gas cap in wei, signed envelope, receipts, validator decisions.
- Data magnitudes come entirely from GET /api/state. Display totals and spend bar use integer amounts from that state. No invented source text, balances, hashes, names or successes. Before the snapshot arrives its space says what has not happened.
- Default sample is a historical public post used in a test agreement. It is not presented as commissioned advertising or an authorized creator endorsement. Default scenario identity is supplied by the backend.
- Layout arithmetic at a 1200px canvas: 674.3 + 20 + 505.7 = 1200px; both columns and full trail share outer edges. Tablet stacks the post/fee/acceptance/mandate below 820px; phone order is post → fee/action → acceptance rules → mandate → payment trail.
- States implemented: first load, server unavailable/retry, draft, funding pending, active, buying data, checking, submission pending, paid, source unavailable, rejected, budget exhausted, expired, refunded; missing data is a dash, real spend zero is zero. Actual backend status and receipt confirmations determine all wording.
- Functional controls: fund agreement, start bounded agent, refresh, payment trail view, explorer links, raw evidence link, signed JSON proof submission, rejection checks and inline recoverable errors. No mock success toasts.
- Browser inspector and responsive screenshots are owned by the root agent because the browser is shared; lint can be run independently. Any browser-route substitution and QA findings should be appended after real inspection.

## Source lint

TasteSkill source lint: emoji FAIL corrected by rendering check icons as SVG. Two warnings are retained deliberately: monospace is confined to addresses, transaction hashes, source IDs and literal signed JSON; em dashes are missing-value marks from the app-screen rules, never rhetorical punctuation. Full TypeScript validation and production build passed.

## Static critique before browser QA

The post and fee are the largest blocks; the fee is the largest figure. There are no KPI tiles or invented charts. Actions sit with the fee and repeated values come from the same API object. Receipt amounts are converted from aUSD/testETH integer base units, while the API budget bar is computed with integer arithmetic. All non-code words are at least 11px, with 44px main phone controls. The publication time and envelope signing time are named separately. Read-only setups disable economic actions with a reason. A paid/refunded agreement offers a real New agreement action while keeping its receipt history in backend archives. Browser QA must still inspect actual rendered density, contrast, overflow and response states; no unrun screenshot check is claimed here.

## Final browser critique

The supported CUA browser replaced inspect.mjs, which would control the browser outside the authorized route. Actual production screenshots and DOM measurements are in evidence/browser-qa.json. At1440×900 the main post/fee/mandate/acceptance blocks and receipt header plus first row are visible. Phone header overflow was corrected from414px to390px. Narrow tablet columns now stack at820px. Gas keeps a readable12-decimal display with exactwei available in its tooltip. All three widths have zero page overflow, loaded DM Sans, no text below11px and no gradients. Muted text contrast is5.27:1 on the ground and5.86:1 on white; main text is14.45:1. Controls exercised: new agreement, real funding, one agent delegation through actual paid result, evidence view, recorded cases, and visible malformed-proof rejection. Phone primary actions and icon targets use44px; the New agreement header action is a secondary36px control. Missing-value marks and code-only monospace remain the two justified source-lint warning categories (four occurrences).
