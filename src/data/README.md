# Case dataset specification

The source-controlled case JSON is an editorial record, not an inferred relationship database.

- Every node, edge, event and hypothesis references source IDs.
- Every edge has an assessment, narrow label, and scope-limited summary.
- Source URLs use HTTPS; verify availability before accepting edits.
- Spatial x/y values control diagram layout only, not semantic distance.
- Sources can be undated; never invent a publication date.
- If an approximate date is used in a timeline, explicitly label it.
- For contested claims include counterevidence and alternative explanations.
- Keep the motif/artifact comparison cluster disconnected from the funding/research cluster unless independently established provenance justifies a link.

Expand to additional case files and a case picker rather than mixing unrelated research into one graph.

MK3 adds `case-002.json` and the private Case Studio. Imported and locally saved cases are checked by `src/caseValidation.mjs`: unique IDs, valid dates, HTTPS URLs, known relationships and source citations. A structural check is not a substitute for primary-source review. Local drafts do not go to GitHub until explicitly exported and submitted.
