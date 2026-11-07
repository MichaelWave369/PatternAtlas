# Φ Pattern Atlas

**Follow the evidence. Discover the connections.**

Pattern Atlas is a local-first, open-source React investigation workspace for tracing *specific, source-backed* relationships among people, companies, institutions, projects, technical systems and historical objects. It is not a guilt-by-association generator.

> **Research preview:** Case 001 is a curated seed dataset with public document links. Source records are provided for independent inspection and are **not** a claim that every document, figure, or interpretation has been independently audited. Conclusions must never exceed the specific cited record.

## What MK13 includes

- **Multiple curated cases and a case switcher:** independent evidence graphs with no fabricated connections between cases.
- **Local-first Case Studio:** create, fork, import or export case JSON; add sourced entities, relationships, events, hypotheses and trace milestones; remove draft records safely. Built-in cases remain read-only.
- **Key Continuity and Self-Revocation:** dual-signed P-256 key rotation, locally signed self-revocation notices, independent root-fingerprint anchoring, and review of current versus historical signers. No centralized revocation, real-world identity certification, or trusted timestamps. [MK13 protocol](docs/KEY_CONTINUITY.md).
- **Signed Case Capsules:** optional browser-local ECDSA P-256 signature envelopes, independently pinned public-key fingerprints, and passphrase-encrypted private-key backups. Signatures verify control of a key, not human identity or document truth. [MK12 protocol](docs/SIGNED_CAPSULES.md).
- **Portable Case Capsules:** export a selected case and its source audit, optionally attach local PDF metadata and handling history, verify SHA-256/linked references offline, and compare against the current case without automatically importing anything. Local case data may itself be sensitive. [MK11 protocol](docs/CASE_CAPSULES.md).
- **Evidence Handling Ledger:** record append-only-in-the-UI researcher handling events, bound to MK9 PDF fingerprints, with SHA-256 hash links, self-audit, JSON/Markdown exports and independent head-anchor comparisons. This does not authenticate custody. [MK10 protocol](docs/HANDLING_LEDGER.md).
- **Original Document Lab:** locally hash downloaded PDFs, compare exact file bytes, record page-specific notes and provenance, and export source-bound manifests without storing the files. [MK9 protocol](docs/ORIGINAL_DOCUMENTS.md).
- **Evidence Audit and SHA-256 packets:** inspect exact source-to-claim references, open proof gaps, review flags, and portable digest-checked research snapshots. Private notes are excluded. [MK8 protocol](docs/EVIDENCE_AUDIT.md).
- **Transaction Reconciliation Lab:** compare invoices and ledger candidates field by field, never assume metadata proves payment, preserve secondary-source labels, and export private notes. [MK7 protocol](docs/TRANSACTION_RECONCILIATION.md).
- **Document Dossiers:** curated source-pair comparisons plus private research copies, original citation links, competing interpretations, and the mandatory 'not established' section. [MK6 protocol](docs/DOCUMENT_DOSSIERS.md).
- **Research Queue:** turns case hypotheses and claim-trace limits into concrete research tasks. Track work status, note missing records, require substantial findings for manually reviewed tasks, and export source-linked checklists. See [MK5 research protocol](docs/RESEARCH_OPERATIONS.md).
- **Source Verification Console:** claim-by-claim inspection, manual source provenance, counterevidence with written follow-ups, case-scoped review exports, and drift detection. See [verification protocol](docs/VERIFICATION_PROTOCOL.md).
- **Schema validation:** HTTPS links, finite coordinates, safe identifiers, unique IDs and existing source references are enforced on imports and saves. Validation does not make a claim true.
- **Connection map:** pan, zoom, select entities or edges, filter by type and search. Click a relationship to inspect the underlying record and its scope.
- **Claim Trace:** a sourced chronology distinguishing plans, requested invoices, actual invoices, payment questions, attempted installations and later litigation.
- **Chronology:** dated events, with approximate dates explicitly labeled.
- **Evidence ledger:** source IDs, links, types and caveats; searchable and filterable.
- **Private source notebook:** localStorage-only annotations with JSON import/export; never synced to servers.
- **Pattern lab:** local PNG/JPEG/WebP/GIF side-by-side or opacity-overlay comparison; no image uploads and no automated identity inference.
- **Hypothesis lab:** supporting observations, limitations/alternatives and specific verification steps.
- **Methodology:** editorial rules against unsupported jumps from contact to control or visual similarity to affiliation.
- **GitHub Pages deployment** and CI checks.

### Curated cases

- **Case 001:** A 2012 proposed informatics business, OpenCog, Novamente, Southern Trust Company, a February 2015 genomics software invoice, unsuccessful June remote installation, and contested 2023 litigation positions.
- **Case 002:** A February 2013 revised estate-planning service-letter draft is now compared with a separate July 15, 2014 Southern Trust invoice document describing $20 million in estate-planning algorithms addressed to Leon Black. The 2014 invoice contains an unfilled recipient placeholder. The 2013 draft's $23.5 million conditional fees and the 2014 invoice's $20 million are separate amounts in separate documents; no executed amendment, settled payment or delivered technology is established.

None of these documents alone proves a commercial system was operational. The Oval Office three-loop motif remains in Case 001's disconnected comparison cluster. No visual or financial connection between the ornament and the research network is claimed.

### Start locally

Requires Node.js 22+ and npm.

~~~bash
npm install
npm test
npm run dev
~~~

To build and preview production output:

~~~bash
npm run build
npm run preview
~~~

Vite serves the app at the root in development and builds it with the GitHub Pages base path /PatternAtlas/.

### Publish to GitHub Pages

1. Open repository **Settings → Pages**.
2. Select **GitHub Actions** as the build/deployment source.
3. Merge the feature PR into main. The Pages workflow builds and deploys the dist folder.
4. When GitHub Pages confirms deployment, the intended address is https://michaelwave369.github.io/PatternAtlas/.

The site is published from GitHub Pages Actions after successful merges into main.

## Evidence data model

Curated case data lives in [src/data/case-001.json](src/data/case-001.json) and [src/data/case-002.json](src/data/case-002.json), independent of React components. See [docs/CASE_001_FINDINGS.md](docs/CASE_001_FINDINGS.md) and [docs/CASE_002_FINDINGS.md](docs/CASE_002_FINDINGS.md). Local cases are stored as browser-only JSON and may be exported as portable files.

| Field | Purpose |
| --- | --- |
| sources | Stable source IDs, citations, dates, URLs, categories, limitations |
| nodes | Typed entities and their explicitly sourced descriptions |
| edges | Narrow relationship label, assessment, summary, source IDs |
| events | Dated claims with caveats and source IDs |
| hypotheses | Open questions, support, limits, next check |
| traceSteps | Chronological stages explicitly separating what each source supports from what it cannot establish |

Assessment levels:
- **documented**: a linked record explicitly supports the *narrow claim stated*, not every implied conclusion.
- **reported**: an account is documented but key details require independent corroboration.
- **unverified**: a comparison or hypothesis lacks sufficient proof to assert a relationship.

The graph is **schematic**, not a measure of geography, proximity, culpability, influence or organizational control.

**MK13 key lifecycle:** Back up a newly generated signing key, authorize rotation using both old and new private keys, and distribute signed rotation/revocation notices. Reviewers must independently know the original public-key fingerprint; a downloaded bundle cannot grant itself trust. Older signed capsules remain cryptographically verifiable without being classified as current-key use. The app does not independently authenticate the person holding a key.

**MK12 signing workflow:** Generate a locally held P-256 key, export a passphrase-encrypted backup, sign a validated MK11 capsule, and independently check the signature and trusted public-key fingerprint. No signing key is stored in Atlas browser storage or uploaded. The signed research data can still be historically false; a signature is not proof of wrongdoing or payment.

**MK11 case portability:** A capsule exports the selected case and its evidence audit, with optional, explicitly permitted original-file metadata and handling history. Import checks are read-only and never overwrite cases or local storage. Even public-only capsules can contain sensitive details from a researcher-authored local case; inspect before sharing.

**MK10 evidence-handling history:** Self-reported file actions reference existing local PDF byte fingerprints and captured source URLs. Each event links to the previous event using SHA-256. The log is not signed; anyone controlling the journal can regenerate the hash chain, so independently preserved head hashes are essential for meaningful later comparisons. Do not label this certified chain of custody.

**MK9 documentary progression:** July 15, 2014 bank-status correspondence in EFTA01344226 records a pending expected wire and an expected sender earlier than the later reported $20m receipt. This is an email sequence, not independently verified bank timestamps. MK9 adds a local PDF fingerprint and manual page-inspection workflow for EFTA01344226, EFTA01915809 and unresolved EFTA00809214. Source files are never uploaded.

**MK8 new source:** A March 2026 U.S. Senate Finance letter reproduces a July 15, 2014 email reporting a $20 million wire received by Southern Trust. Its matching date/amount to a July 2014 invoice is noteworthy but **does not establish allocation to that invoice**, independently verified bank settlement, or software delivery. See [the updated Case 002 memo](docs/CASE_002_FINDINGS.md).

**MK7 reconciliation workspace:** A $30,000 invoice and a *secondary-reported* April 2015 entry can be compared without treating it as a settled payment. The original ledger line has not been independently inspected. Case 002 now contains a Senate-sourced correspondence candidate reporting a same-day receipt, rather than a fabricated bank settlement. USD-only, no scoring, no automatic conclusions. Research data is local until exported.

**MK6 dossier workspace:** Two records can be compared without creating graph edges. Curated pairs are read-only, private copies are saved separately per case, and exports require user action. A changed source URL, citation or date invalidates old comparison metadata.

**MK5 research queue:** Work status and researcher-added tasks are stored separately per case. A completed research task is not a historical conclusion. Research queue JSON and Markdown briefs can be exported. No automatic payment confirmation or remote source checking is performed.

**MK4 verification records:** Saved separately by case ID in local browser storage; export/import JSON or download a Markdown memo. Inspection is not factual verification. A changed claim or source URL invalidates old review records. No automated scraping or remote authentication is performed.

**Persistence:** New cases are stored in localStorage only, with validation and a size cap. Export them before clearing browser data. Unpublished local cases do not sync between computers or browsers. Existing MK2 notes for Case 001 retain their original storage key. Other cases' notebooks are scoped by case ID, and imported notebook JSON must match the active case.

**Contribution:** To publish a curated case, export the JSON, verify every cited document, and propose a pull request. Case Studio never writes to GitHub automatically.

## Integrity rules

Never treat a proposed payment as settled; an invoice as delivered; a source mention as endorsement; or a decorative resemblance as a common affiliation. Preserve contrary evidence and alternatives. Avoid unnecessary personal details and guilt by proximity.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [src/data/README.md](src/data/README.md) for editorial standards.

## Tech

React 19, TypeScript, Vite 6, SVG graph, CSS, runtime case/research-queue/dossier/reconciliation/audit/handling/capsule schema validation, source-controlled and locally authored JSON. No analytics, trackers, remote database or required account. Optional notes are saved only in local browser storage and can be exported. Static site. MIT license.

**PHI369 Labs** · People Above Profit · Ledger Above Ego.
