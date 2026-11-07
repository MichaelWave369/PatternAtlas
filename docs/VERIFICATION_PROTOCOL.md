# MK4 Source Verification Protocol

**Release:** v0.4.0  
**Purpose:** Challenge weak claims and trace every relationship to a document.

## What the console does

The Verification Console turns existing claim-trace milestones, relationships, and dated events into individually reviewable claim cards. Hypotheses are questions, not established claims, and stay in the Hypothesis Lab.

Each claim displays exactly what its case record says, what it does not establish, and its linked sources. Researchers may record a short excerpt or page reference, an analysis, and a **manual** inspection status.

A source inspector shows the URL host, source metadata, the number of claims citing it, and any researcher-entered original URL. The original URL and comparison notes must be supplied manually. The software cannot authenticate the host or document.

Counterevidence entries require a specific claim, a linked source, a contrary observation, and a rationale. A challenge can only be marked addressed with a written follow-up explanation. Being marked addressed does **not** mean disproven or resolved by a court.

Researcher review data is browser-local, case-specific, and never uploaded automatically.

## Status definitions

| Claim status | Meaning |
| --- | --- |
| Not reviewed | No inspection recorded |
| Document inspected (manual) | Researcher says the linked document was read; this is **not a fact-check pass** |
| Needs corroboration | More independent evidence is required |
| Disputed by researcher | A limitation or competing interpretation was recorded |

Source status: Not reviewed, Opened manually, Link unavailable (manual), Compared with original (manual). None is based on automated internet checks.

## Preventing stale notes

Claim fingerprints include wording, interpretation limits, relationship assessment, and cited source IDs and URLs. They detect accidental reuse after a claim or source changes. They are not cryptographic proof.

Imported review bundles must match the exact case ID, source URLs, current claim fingerprints and allowed fields. Invalid data or a wrong-case import is rejected. If existing storage becomes invalid, the console preserves the original contents and lets the researcher export the raw JSON before deliberately resetting.

Important case records remain separate from review annotations:
- Curated cases are source-controlled JSON and read-only until forked.
- Local Case Studio work is stored in its own browser key.
- MK2 notebooks retain their previous keys.
- MK4 review annotations have their own per-case browser keys.

## Evidence boundary example

Case 001 includes a 2012 informatics proposal, a February 2015 software invoice, subsequent questions about payment and delivery, and a June 2015 report of unsuccessful remote installation. None of those documents alone proves a functioning data-processing platform existed.

A verified payment would need a settled transaction record; delivery would need independent acceptance or deployment records; actual system operation would need appropriate logs and dataset provenance.

An invoice is an invoice. It is not automatically payment, ownership, acceptance or wrongdoing.

## Limitations

MK4 does not fetch webpages automatically, scrape PDFs, compute external file hashes, authenticate archives or perform AI fact-checking. Researchers must inspect sources themselves, preserve competing interpretations and avoid guilt by association. Do not include private bank identifiers or irrelevant personal data in notes. Keep quoted third-party material brief and properly attributed.

## Development

Run npm install, npm test, and npm run build.

The tests enforce the **consistency** of claim IDs, sources, review states, counterevidence and exports. They cannot establish historical truth.
