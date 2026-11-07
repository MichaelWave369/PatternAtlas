export type NodeKind = 'person' | 'organization' | 'research' | 'institution' | 'infrastructure' | 'artifact' | 'motif';
export type Assessment = 'documented' | 'reported' | 'unverified';
export type Page = 'explore' | 'studio' | 'verify' | 'queue' | 'dossiers' | 'reconciliation' | 'audit' | 'originals' | 'handling' | 'trace' | 'timeline' | 'evidence' | 'patterns' | 'hypotheses' | 'method';

export interface AtlasSource {
  id: string;
  title: string;
  date: string;
  category: 'correspondence' | 'proposal' | 'invoice' | 'reference';
  url: string;
  citation: string;
  note: string;
}
export interface AtlasNode {
  id: string;
  name: string;
  short: string;
  kind: NodeKind;
  x: number;
  y: number;
  description: string;
  sourceIds: string[];
}
export interface AtlasEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  assessment: Assessment;
  summary: string;
  sourceIds: string[];
}
export interface AtlasEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  assessment: Assessment;
  sourceIds: string[];
}
export interface AtlasHypothesis {
  id: string;
  question: string;
  context: string;
  forEvidence: string;
  againstEvidence: string;
  nextCheck: string;
  sourceIds: string[];
}
export interface AtlasTraceStep {
  id: string;
  date: string;
  stage: string;
  title: string;
  established: string;
  notEstablished: string;
  sourceIds: string[];
}
export interface CaseFile {
  id: string;
  title: string;
  subtitle: string;
  updated: string;
  description: string;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  events: AtlasEvent[];
  hypotheses: AtlasHypothesis[];
  traceSteps: AtlasTraceStep[];
  sources: AtlasSource[];
}
