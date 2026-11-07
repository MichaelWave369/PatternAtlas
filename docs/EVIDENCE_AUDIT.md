# MK8 · Evidence Audit and Portable Research Packet

**Pattern Atlas v0.8.0 · November 6, 2026**

## What an evidence audit is

The new **Evidence Audit** screen builds a reverse index from the source registry to all *explicitly linked* claim cards, dated events, trace milestones, and hypotheses in the currently selected case. It does not infer connections by matching keywords or names.

It also displays:
- Open proof gaps, quoting what the case says a document **cannot establish**.
- Review flags for undated records, source IDs sharing the same URL, reported or unverified graph relationships, and transaction candidates lacking independent bank/settlement support.
- A reproducible JSON evidence snapshot containing **only the current case data and its curated transaction-candidate metadata**, along with the re-derived audit matrix.
- A printable Markdown research memo.
- A browser-only JSON integrity checker.

**No personal notebook notes, private review work, or other cases are included in the exported packet.** This is an intentional privacy default. The user can separately export personal notes from their respective workspaces.

## Case 002 evidence update: reported receipt, unproven invoice allocation

[U.S. Senate Finance Committee letter of March 20, 2026](https://www.finance.senate.gov/imo/media/doc/senator_wyden_letter_to_leon_black_redacted.pdf), page 3, reproduces an image of an email dated **July 15, 2014**. The email appears to be from Richard Kahn, reporting a **$20 million wire received by Southern Trust Company**. The Senate letter identifies the underlying DOJ document as [EFTA01915809](https://www.justice.gov/epstein/files/DataSet%2010/EFTA01915809.pdf).

This is meaningful additional evidence relative to the previously identified [EFTA00585292](https://tommycarstensen.com/epstein/documents/EFTA00585292.html), a July 15, 2014 **$20 million** estate-planning algorithm invoice-form document addressed to Leon Black. The matching date, amount and company are legitimate comparison criteria. Nevertheless, the email excerpt **does not contain an invoice number or remittance allocation**. We could not independently retrieve the original DOJ email PDF; the page image is reproduced by the Senate. We therefore **do not mark that particular invoice settled**, and we do not infer algorithm development, delivery or operation.

The February 2013 estate-planning draft describing **$23.5 million** in conditional fees remains separate. Nothing in this release adds the amounts together or asserts these three documents are a single executed agreement.

**Next verification:** Retrieve and inspect DOJ EFTA01915809, match the remitting and receiving bank transactions against July 15, 2014 billing terms, seek explicit remittance information, and distinguish an actual payment from the truth of any statement about delivered software.

## Portable audit packets

Exported JSON has a canonicalized case-and-audit payload plus a **SHA-256 digest**. Its purpose is to detect changed bytes in the exported payload. During import check, the browser:

1. Parses the JSON without running code.
2. Verifies the payload SHA-256 digest using the browser's built-in Web Crypto API.
3. Validates the case schema and cited transaction pointers.
4. Independently recomputes the source-to-claim matrix and checks that it matches the enclosed audit.

A valid digest **does not authenticate document origin or prove historical claims**. Anyone can generate new payloads and calculate new digests. Only trusted signatures plus independently authenticated original-source evidence could support stronger chain-of-custody assertions.

The check is limited to a 2.5 MB exported packet and never uploads local files to a server. The page does not silently import or overwrite an existing case. The packet is a portable research snapshot, not an evidence certification or independent forensic audit.

## Test and editorial standards

Run the existing unit tests and production build. MK8 adds tests for deterministic canonical serialization, digest changes, manipulated-but-rehashed audit matrices, malformed bundles, source-to-claim references, case isolation, and the newly documented 2014 receipt correspondence.

**Ledger Above Ego. Evidence Above Assumption.**
