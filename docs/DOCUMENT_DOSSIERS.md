# MK6 Document Dossiers: comparison without conflation

**Release:** Pattern Atlas 0.6.0 · November 6, 2026

## Why this exists

A document can be related to another by topic, correspondent, or institution without referring to the same transaction, contract, server, or implementation.

Document Dossiers places two source records side-by-side and requires the researcher to state:

1. What the first record actually establishes.
2. What the second record actually establishes.
3. Their common context, if any.
4. What those documents **do not** establish.
5. At least one alternative explanation.
6. The next independent record that could resolve the issue.

This module **never automatically creates an edge in the evidence graph**. A shared surname, amount or symbol is not proof of a relationship.

## Published comparison starting points

### CASE-001: genetics software invoice versus server configuration

- [EFTA01191405](https://yirah.fi/epstein/en/document/EFTA01191405): Novamente's February 4, 2015 invoice requests $30,000 for software and services analyzing gene expression and SNP data.
- [EFTA00655735](https://yirah.fi/epstein/dokumentti/EFTA00655735): June 15, 2015 email about an attempted remote installation on a Virgin Islands server.

**Limit:** The records do not identify the same server or prove invoice settlement, accepted software delivery, a successful installation, or an operating genetic database. A secondary claim about an April 2015 ledger transfer remains an *unverified lead*, not a graph fact.

### CASE-002: February 2013 draft versus July 2014 invoice

- [EFTA01188213](https://efta.threats.watch/documents/EFTA01188213): The archive indexes the revised estate-planning draft on February 11, 2013. Its header calls it revisions dated February 6 to a February 5 lawyer's draft. It describes a total of $23.5 million in **conditional** fees for estate-planning services associated with Southern Trust.
- [EFTA00585292](https://tommycarstensen.com/epstein/documents/EFTA00585292.html): July 15, 2014 Southern Trust document describing $20 million in algorithms for estate planning. It retains an unfinished billed-entity placeholder.

Both concern Southern Trust, Leon Black and estate-planning services. **Do not equate the two documents, add the amounts, treat the draft as executed, or infer algorithm delivery or payment** absent an explicit amendment, signed agreement, receiving-party accounting, final invoice or independent delivery record.

**Archival access caveat:** The indexed HTML mirror was read and compared for wording. Direct DOJ PDF access through standard browsing may redirect to an age-verification page, so this release does not claim to have examined the original PDF page image or signatures.

## Local-only research workflow

- Select **Document dossiers** in the sidebar and choose Case 001 or Case 002.
- The two featured comparisons are **curated read-only starting points**.
- Select **Fork to private copy** to edit, or **New document pair** to compare two different existing records from the current case.
- Complete all interpretation and limit fields before saving.
- Export your private comparisons as JSON or a Markdown memo. Importing JSON **replaces** saved private comparisons after confirmation.
- Imported records must match the case ID and use two distinct, currently available source IDs.

LocalStorage is separate from Cases, notebooks, Source Verification Console, and Research Queue. Dossier metadata includes a simple fingerprint of case ID, source IDs, citation strings, dates and URLs. Edits to these invalidate previous local annotations. The fingerprint is a drift detector, **not a cryptographic signature or authentication of the document**. Invalid saved data is protected until the user exports a recovery copy or explicitly resets it.

A source in a curated case may only be edited by making a private case fork. The comparison tool cannot silently modify the evidence ledger or mark an invoice paid.

## Limits

No automatic PDF extraction, archival authentication, matching algorithms, facial identification or financial verification is performed. The tool shows only the source fields already present in each case's evidence dataset. Source links may be mirrors or require access controls. Avoid copying private account information or long passages of copyrighted text into dossier notes.

Tests run with **npm test**; the production build runs with **npm run build**.

**Principle:** Similarity suggests a question. Only independent evidence supports a conclusion.
