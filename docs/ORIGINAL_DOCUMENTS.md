# MK9 · Original Document Inspection Protocol

**Pattern Atlas v0.9.0 | November 6, 2026**

## The document evidence workflow

MK9 adds an **Original Document Lab** to the case sidebar. It supports human review of downloaded files without retaining or uploading the contents.

1. Identify the original public document by its exact citation, archive Bates identifier and retrieval host.
2. Download the PDF in your own browser. Select it in Pattern Atlas, which reads it **locally**, checks for a PDF header, and calculates **SHA-256 over its exact bytes** using Web Crypto.
3. Enter an honest provenance note recording where the file came from and what remains uncertain. Do not claim an official origin from the filename alone.
4. Save **metadata only**: file basename, byte count, digest, source URL, linked case source, recorded origin class, inspection date and research note.
5. Inspect individual PDF pages manually and enter page numbers, short pointers, observed statements and *what the page does not establish*.
6. Select another downloaded copy to check whether its bytes and size match the previously stored fingerprint.
7. Export the browser-local manifest as JSON or a Markdown memo. No PDFs are embedded.

The underlying browser file is **never uploaded to Pattern Atlas, rendered by the application, parsed for its text, or saved in localStorage**.

## Investigation priorities

### Case 001 · Alleged 2015 ledger

- **EFTA00809214**: a document identifier linked by a *secondary research article* to a reported **April 13, 2015, $30,000 Novamente ledger transaction**. The original ledger line has **not** been independently confirmed here, and another public description associates the identifier with ISP equipment entries.
- The case's new source registry item points to the **secondary report**. This is a locator to investigate, not a verified transfer.
- To elevate the record, obtain the original page, check date/payee/narrative/invoice number and seek an independently traceable settlement record.

### Case 002 · July 15, 2014 wire correspondence

- **EFTA01915809**: the [Senate Finance letter](https://www.finance.senate.gov/imo/media/doc/senator_wyden_letter_to_leon_black_redacted.pdf), page 3, reproduces an image of an email reporting a $20 million receipt by Southern Trust and cites [the DOJ PDF locator](https://www.justice.gov/epstein/files/DataSet%2010/EFTA01915809.pdf). The original DOJ PDF was not independently retrieved and compared for this release.
- **EFTA01344226**: a [third-party archive extraction](https://efta.threats.watch/documents/EFTA01344226) of July 15 bank-status correspondence. A bank contact wrote at about 3:30 p.m. that a wire had not arrived; shortly afterward Kahn described the expected sender as Leon Black or one of his entities. The original page was not independently obtained here.
- The two correspondence records create a researchable sequence of **messages**, **not a verified series of bank processing timestamps**. The same-day $20 million invoice document has no printed allocation reference that links it conclusively to this wire.

**Next checks:** Download originals, inspect complete headers and threading, compare source PDF bytes, obtain original bank transaction references where legally available, and separately document any service-delivery evidence.

## Why the source hash matters, and what it cannot prove

- Same SHA-256 and byte length means that two examined local files are **byte-for-byte consistent to a cryptographically strong practical standard**. Different bytes may reflect a changed PDF, new redaction, archive processing or an unrelated file.
- A hash cannot establish who created a PDF, whether its text is true, whether an archival mirror is complete, or whether bank funds moved.
- A user can label a malicious file as officially hosted; the software only records the classification **the researcher entered**. It does not authenticate download provenance.
- The UI deliberately does not provide a "verified authentic" status or a proof-of-payment grade.
- Duplicate hashes across sources trigger an alias/copy warning, **not independent corroboration**.

## Privacy and browser-storage guarantees

- The source-file size limit is **50 MiB**. Only filenames ending in PDF and bytes beginning with the PDF header are accepted. The application does not execute or display PDF content.
- Manifests are stored per case in `pattern-atlas.original-docs.v1.<caseId>`, separate from old notebooks, cases, review queues, transaction records and audit packets.
- A source URL changing after file capture invalidates its older local manifest. Original stored data is protected from automatic overwrite; export the raw recovery file before an explicit reset.
- JSON import validates safe source IDs, case identity, HTTPS URLs, PDF metadata, SHA-256 format, unique record IDs, page numbers and required limits. Importing requires explicit user selection.
- Exported manifests contain written notes, URLs and **local filenames**, which may be sensitive if shared. Avoid entering bank account numbers, unredacted victim identities or other personal information in notes.

## Engineering validation

Run `npm test` and `npm run build`. New tests cover byte hashing, duplicate PDF comparison, unsafe file rejection, source-URL drift, case isolation, manifest validation and page-specific evidence limitations.

**Ledger Above Ego. Evidence Above Assumption.**
