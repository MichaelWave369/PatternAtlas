# Φ Pattern Atlas

**Follow the evidence. Discover the connections.**

Pattern Atlas is a local-first, open-source React investigation workspace for tracing *specific, source-backed* relationships among people, companies, institutions, projects, technical systems and historical objects. It is not a guilt-by-association generator.

> **Research preview:** Case 001 is a curated seed dataset with public document links. Source records are provided for independent inspection and are **not** a claim that every document, figure, or interpretation has been independently audited. Conclusions must never exceed the specific cited record.

## What MK2 includes

- **Connection map:** pan, zoom, select entities or edges, filter by type and search. Click a relationship to inspect the underlying record and its scope.
- **Claim Trace:** a sourced chronology distinguishing plans, requested invoices, actual invoices, payment questions, attempted installations and later litigation.
- **Chronology:** dated events, with approximate dates explicitly labeled.
- **Evidence ledger:** source IDs, links, types and caveats; searchable and filterable.
- **Private source notebook:** localStorage-only annotations with JSON import/export; never synced to servers.
- **Pattern lab:** local PNG/JPEG/WebP/GIF side-by-side or opacity-overlay comparison; no image uploads and no automated identity inference.
- **Hypothesis lab:** supporting observations, limitations/alternatives and specific verification steps.
- **Methodology:** editorial rules against unsupported jumps from contact to control or visual similarity to affiliation.
- **GitHub Pages deployment** and CI checks.

### First case: research and infrastructure correspondence

Initial documents concern a 2012 proposed informatics business, OpenCog, Novamente, Southern Trust Company, related correspondence, a February 2015 software-and-services invoice, and an unsuccessful June 2015 installation attempt. Later court filings show a contested view of the company's claimed activities. None of these alone proves a commercial database was operational. The Oval Office three-loop ornament remains in an explicitly disconnected *comparison* cluster. No visual or financial connection between the ornament and the research network is claimed.

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

That URL is the expected destination, **not** a claim that a deployment has already succeeded.

## Evidence data model

Case data lives in [src/data/case-001.json](src/data/case-001.json), independent of React components. See [docs/CASE_001_FINDINGS.md](docs/CASE_001_FINDINGS.md) for evidence boundaries.

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

## Integrity rules

Never treat a proposed payment as settled; an invoice as delivered; a source mention as endorsement; or a decorative resemblance as a common affiliation. Preserve contrary evidence and alternatives. Avoid unnecessary personal details and guilt by proximity.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [src/data/README.md](src/data/README.md) for editorial standards.

## Tech

React 19, TypeScript, Vite 6, SVG graph, CSS, source-controlled JSON. No analytics, trackers, remote database or required account. Optional notes are saved only in local browser storage and can be exported. Static site. MIT license.

**PHI369 Labs** · People Above Profit · Ledger Above Ego.
