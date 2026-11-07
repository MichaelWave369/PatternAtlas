# MK7 Transaction Reconciliation Protocol

**Version:** 0.7.0 · November 6, 2026

## Purpose

An invoice, a purported ledger entry and an independently settled payment are distinct types of evidence. Similar amounts, dates and counterparties can justify further investigation, but cannot automatically identify a settled payment.

The Transaction Lab checks five independent metadata fields: exact amount in integer USD cents, currency agreement, conservative payee-name text equality, an explicitly printed invoice number and date relative to invoice date.

The interface produces **no probability, verification score, settlement verdict or automatic graph edge**.

## Case 001: Novamente invoice 1501 and reported ledger lead

- [EFTA01191405](https://yirah.fi/epstein/en/document/EFTA01191405): The February 4, 2015 invoice to Southern Trust lists $30,000 for gene-expression and SNP analysis software with installation and training. "Payable upon receipt" is a payment request, not proof of settlement.
- [EpsteinWiki secondary summary](https://epsteinwiki.com/knowledge-base/jeffrey-epsteins-reproductive-history-hormones-genetics-fertility-treatment-and-paternity-claims/): Reports an April 13, 2015 Southern Trust asset-ledger line for a $30,000 software wire to Novamente and links [EFTA00809214](https://epstein-data.com/EFTA00809214). We located the document identifier but **could not independently inspect the original entry**. The article says invoice 1501 is not printed on that alleged ledger line.
- **Source conflict:** A separate public description connects EFTA00809214 to 2014 ISP-equipment expenses. This may be a multipurpose ledger, different page, or a cross-reference error. Do not resolve the discrepancy by assumption.

The April entry is seeded as a **secondary-reported candidate**, not a confirmed bank transaction. Its explicit invoice-number field is blank.

Verification priorities: inspect the relevant original page of EFTA00809214; compare the dated line and payee; find independent bank debit and receiving-party credit/settlement documentation; locate an invoice allocation reference; then separately investigate delivery and software operation.

## Case 002: estate-planning invoice

[EFTA00585292](https://yirah.fi/epstein/en/document/EFTA00585292) is a July 15, 2014 invoice-form document addressed to Leon Black with an unfinished recipient-entity placeholder, describing $20 million in algorithms. MK7 initially included **no synthetic corresponding payment**. MK8 now adds a Senate-sourced **correspondence candidate**: a March 2026 letter reproduces a July 15, 2014 email reporting a $20 million wire received in Southern Trust. This is not an original bank record, does not provide invoice allocation, and is not proof of algorithm delivery.

The February 2013 draft describing $23.5 million in conditional estate-planning fees is a separate document. Its amount must not be added to the 2014 invoice or treated as a settled transfer.

## Private workflow and safeguards

Use **Transaction lab** in the sidebar to select invoices and candidate entries. Published invoices are read-only. Researchers may create private invoices linked to existing Evidence Ledger sources or candidate records supported by an existing source ID or HTTPS link.

Reviews can be labeled "not reviewed", "manually inspected", or "needs follow-up". Manual inspection requires an actual HTTPS link and a substantive note; **this never certifies a historical claim**.

All private work is scoped to the case and held in browser localStorage. Users can export JSON or Markdown. Imports reject malformed or cross-case data, unsupported currencies, unsafe URLs, orphaned records, duplicate IDs, oversized fields and stale references after invoice or candidate edits. Invalid stored records remain protected until explicitly backed up/reset.

**MK7 supports USD only.** The browser does not access bank ledgers or accounts, authenticate documents, establish payment settlement or delivered services, or make legal findings. Do not store bank account details or private personal information in notes.

**Ledger Above Ego. Evidence Above Assumption.**
