# MK10 · Evidence Handling Ledger

**Pattern Atlas v1.0.0 · November 6, 2026**

## Purpose

MK9 captures the exact SHA-256 digest and size of a locally selected PDF, with researcher-entered provenance and page notes. MK10 adds a *separate* handling history whose entries reference those existing fingerprints.

**Important: This is a self-reported, locally maintained research history, not a legal chain-of-custody certification.**

## Recorded fields

Each handling event contains:

- Case ID, sequential event number and random event ID.
- Exact reference to an MK9 PDF fingerprint, including its SHA-256, byte count, original case source ID, captured source URL and document locator.
- Researcher-provided label. A pseudonym is allowed.
- Action category: acquired, opened, compared, copied, transferred, redacted, shared, archived or other.
- Date the researcher says the action occurred, separately from the UTC timestamp when the browser recorded the entry.
- A substantive note explaining the action and uncertainty.
- Previous event hash and its own SHA-256 hash over all the above event fields.

The hash-chain starts from 64 zero characters, then links each new event to the preceding event hash. Entries cannot be individually edited or removed **through the user interface**.

## Verification and limitations

The browser replays the sequence from the beginning, checking event order, dates, source IDs, stored PDF byte hashes, source URLs, locators, previous hashes and recomputed SHA-256 values.

This can flag:
- Ordinary edits to exported JSON that were not accompanied by recalculated hashes.
- Out-of-order or missing events in a partial journal.
- A changed MK9 file fingerprint, outdated source URL or deleted source record.
- Import from a different case, malformed fields, unsupported actions or false event references.

**This does NOT independently authenticate a source, prove anyone handled the actual file, verify who typed a name, prevent reset/import, or prove a historical fact.**

A person who controls the entire local file can rewrite every event and compute a valid new chain. This limitation is deliberate and tested. The original files are not uploaded. An untrusted clock's timestamp is not a trusted timestamp.

## Independently retained head anchors

The **Export independent head anchor** action downloads a tiny JSON file containing the case, event count, current event-chain head SHA-256 and the browser-reported export timestamp.

Preserve that anchor separately, for example in your own Git repository, offline backup or an independent archive. Later, paste the independently saved 64-character head into the lab to compare it with the current history.

- A **match** supports that the current history has the same head value as your externally retained anchor.
- A **mismatch** warrants inspection of altered, lost, reordered or newly appended events. A naturally appended event changes the head, so retain a *new* anchor after each intentional extension.

No signature key, trusted timestamp service or third-party attestation is used in MK10. An independently saved hash is a useful comparison point, **not proof of authorship or custody**.

## Browser storage and imports

All journal data is held in per-case localStorage under `pattern-atlas.handling.v1.<caseId>`. MK9 PDF fingerprints remain in their own separate store. No PDF bytes are stored in the handling history.

- A saved journal requires an existing MK9 manifest and exact referenced source metadata. If a referenced PDF or source link changes, editing is locked pending recovery.
- On a validation failure, local data is **not** silently overwritten. Download the raw recovery JSON and explicitly reset if necessary.
- Imports are manually selected, validated, and require confirmation before replacing nonempty local history. Imports never silently merge different chains.
- Saving uses an optimistic last-head comparison to reduce stale-tab overwrites. **localStorage does not offer transactional, atomic cross-tab writes**; a second writer can still race. Back up important work and avoid concurrent editing.
- Exports include researcher-entered labels and notes, which can be sensitive. Avoid identifying victims, unredacted financial identifiers, or private personal details.

## Working method for the two unresolved original-document investigations

**Case 001: EFTA00809214.** The reported April 2015 ledger transaction remains a secondary-source lead. Download and fingerprint any accessible original PDF, document its retrieval host accurately, manually inspect the relevant page and append the inspection action. Never mark the secondary summary as a settled payment.

**Case 002: EFTA01915809 and EFTA01344226.** Compare the original email pages, identifiers and time sequence if the original files are accessible. Record only observed correspondence and keep the claimed receipt separate from independently settled bank funds and invoice allocation.

### Reproducible validation

Run `npm test` and `npm run build`. The handling test suite includes chain extension, altered event detection, source and file drift, malformed JSON, duplicate IDs and a demonstration that recomputing an entire journal makes the chain self-consistent without establishing authenticity.

**Ledger Above Ego. Evidence Above Assumption.**
