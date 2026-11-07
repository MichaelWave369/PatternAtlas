# Contributing to Pattern Atlas

We welcome careful research, corrections, code fixes, accessibility improvements, and independently sourced new cases.

## Evidence rules

1. Every node description and every edge must have at least one source ID.
2. An edge is a narrowly worded, falsifiable relationship. Never connect subjects merely because they appear in the same photo, dataset, article, inbox or event.
3. Distinguish a proposal, pledge, invoice, authorization, completed payment, delivery and technical operation.
4. Do not infer wrongdoing, ideology, institutional control or guilt from funding, correspondence or ordinary professional association.
5. Keep visually similar architectural motifs disconnected from financial/social networks absent demonstrated provenance.
6. Label uncertain dates as approximate. Do not invent exact dates for undated records.
7. State evidence that could contradict a hypothesis. Preserve correction history in pull requests.
8. Prefer public archival documents and official records. For mirrors, include the original document identifier.
9. Avoid private addresses, account details, unpublished personal records and irrelevant personal information.
10. Keep editorial research separate from product promotion.

## Proposing a change

Submit a pull request explaining: **claim**, **specific source**, **what the source actually establishes**, **alternative explanation**, and **what changed**. Run:

~~~bash
npm install
npm test
npm run build
~~~

The data integrity tests verify references and graph isolation. Reviewers must additionally inspect the primary documents, because an automated test cannot judge whether a claim is justified.

## Current limits

The seed dataset was assembled from public references discussed during initial research and is not a completed archival audit. Source URLs can change, and some point to archival mirrors. Historical dates are approximate where marked. The interface is read-only; full import/export, collaborative annotation and automated evidence ingestion are future work.

## MK4 review standards

- Every researcher inspection is manual, never an official fact-check.
- A source challenge is a research lead, not a finding. A written follow-up is required before closing the challenge.
- Reviews and provenance checks are saved locally per case; export important data.
- A source or claim edit invalidates older review entries instead of silently transferring them.
- [Read the Source Verification Protocol](docs/VERIFICATION_PROTOCOL.md) before approving changes.

## MK5 research task standards

Research Queue tasks must begin with an existing source citation. A mark of research reviewed means the investigator recorded a substantial note and evidence pointer. It does not mean the claim is historically proven. Do not treat secondary summaries of bank ledger entries as original settled transactions. See [Research Operations Protocol](docs/RESEARCH_OPERATIONS.md).

## MK6 dossier review standards

Document Dossiers must always distinguish each source's actual words from an inference that the records share a transaction. Preserve alternatives, unestablished outcomes, exact IDs and independent verification tasks. Do not automatically merge near-identical names, dollar amounts, drafts or invoices. [Read the MK6 dossier protocol](docs/DOCUMENT_DOSSIERS.md).
