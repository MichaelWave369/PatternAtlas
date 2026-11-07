# MK5 Research Operations Protocol

**Release:** Pattern Atlas 0.5.0  
**Scope:** Existing curated and local cases, without importing unverified findings as facts.

## Purpose

The Research Queue creates two actionable types of source-linked work automatically:

- **Hypothesis task:** A hypothesis question and its defined next verification step.
- **Evidence-gap task:** The exact thing a claim-trace milestone explicitly does **not** establish.

Users can add **researcher-originated tasks** if they reference at least one existing source in the current case. This avoids losing research leads in freeform text disconnected from the Evidence Ledger.

## Research status is not truth

| Status | What it means |
| --- | --- |
| Queued | This question is waiting for investigation |
| Investigating | Researcher is currently checking records |
| Missing material | Researcher must state which document, record, or access is missing |
| Research reviewed | Researcher wrote a substantial note and attached a source ID or HTTPS evidence pointer |

**Research reviewed is not a claim verification.** It does not mean an invoice was paid, software was delivered, an allegation is true, or any person was culpable. Record remaining uncertainty even after completing a research task.

## Data boundaries

Queue data is stored in browser localStorage, with a distinct key for each case: pattern-atlas.research-queue.v1.<case-id>.

The queue supports JSON import/export and a Markdown research brief. The bundle includes case identity, custom tasks and status notes. It does not duplicate or modify the published case graph, its sources, case notebook, or MK4 verification reviews.

A task fingerprint detects changes to its wording, source IDs, and cited source URLs. Old progress **does not silently attach to a changed task**. Invalid stored data is locked from writes, with recovery export and explicit reset.

JSON import checks task identity, timestamps, known source IDs, HTTPS evidence pointers and required research notes. These are structural checks only, not proof of source authenticity.

## Case 001: the $30,000 Novamente invoice checkpoint

**Re-inspected records:**

1. [EFTA01191405](https://yirah.fi/epstein/en/document/EFTA01191405), the Feb 4, 2015 Novamente software-and-services invoice (invoice 1501) describes machine-learning/automated reasoning technology for gene-expression and SNP analysis, with installation and training. It identifies a $30,000 requested amount, **not a confirmed settled payment**.
2. [EFTA00655735](https://yirah.fi/epstein/dokumentti/EFTA00655735), the June 15, 2015 Goertzel email says the software had **not been installed** on a Virgin Islands server because remote access had not been configured. Whether this was the same server or software specified in the February invoice is not established.
3. A [secondary research summary](https://epsteinwiki.com/knowledge-base/jeffrey-epsteins-reproductive-history-hormones-genetics-fertility-treatment-and-paternity-claims/) reports that a Southern Trust asset ledger has an April 13, 2015 $30,000 wire to Novamente. **The original ledger entry has not been independently inspected for this release.** It must be treated as an external lead, not a confirmed payment.

### Priority verification sequence

- Locate the original asset-ledger page by document ID, inspect the original image and validate whether the entry was a wire, accounting reclassification or another kind of entry.
- Compare payee, amount and date to invoice 1501, allowing for multiple $30,000 transactions. A matching amount **alone** does not link a payment to this invoice.
- Seek settlement confirmation in original records or a receiving-party accounting acknowledgment.
- Independently identify any server mentioned in February and June correspondence, using asset identifiers, host records, installation acceptance and logs. Do not assume they are the same machine.
- Distinguish any experimental installation from a commercially operating DNA database. Seek actual datasets, code inventories and provenance only where legally public; do not publish private medical, financial or identity data.

No new payment, genomics-operation or wrongful-conduct relationship was added to the curated evidence graph as part of MK5.

## Testing

Run: npm install; npm test; npm run build.

Tests cover the seed-task count, source links, reviewed-evidence requirements, malformed imports, cross-case isolation, stale progress rejection and export disclaimers.

**Editorial principle:** Every unanswered question is worth tracking. No unanswered question is itself evidence of wrongdoing.
