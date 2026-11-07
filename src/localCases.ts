import type { CaseFile } from './types';
import { checkCase } from './caseValidation.mjs';

const KEY = 'pattern-atlas.workspace-cases.v1';
const MAX_STORAGE = 1_500_000;
export interface LocalCaseRead { cases: Record<string, CaseFile>; warning: string }
export function loadLocalCases(): LocalCaseRead {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (!stored) return { cases: {}, warning: '' };
    if (stored.length > MAX_STORAGE) return { cases: {}, warning:'Local case storage exceeds the safety limit. It has not been overwritten.' };
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { cases:{}, warning:'Local case storage is malformed and has not been overwritten.' };
    const valid: Record<string, CaseFile> = {};
    let rejected = 0;
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (checkCase(value).ok) {
        const c = value as CaseFile;
        if (c.id.startsWith('LOCAL-')) valid[c.id] = c;
        else rejected += 1;
      } else rejected += 1;
    }
    if (rejected > 0) return { cases:valid, warning:rejected + ' invalid local case(s) were skipped. Original storage was not rewritten.' };
    return { cases:valid, warning:'' };
  } catch {
    return { cases:{}, warning:'Browser storage is disabled or could not be read; existing data has not been overwritten.' };
  }
}

export function saveLocalCases(cases: Record<string, CaseFile>): { ok: boolean; error: string } {
  try {
    for (const item of Object.values(cases)) {
      if (!item.id.startsWith('LOCAL-')) return {ok:false,error:'Only locally editable cases may be saved.'};
      const check = checkCase(item);
      if (!check.ok) return {ok:false,error:'Case validation failed: ' + check.errors.slice(0,2).join(' ')};
    }
    const content = JSON.stringify(cases);
    if (content.length > MAX_STORAGE) return {ok:false,error:'Local case limit reached. Export older cases before adding more.'};
    window.localStorage.setItem(KEY, content);
    return {ok:true,error:''};
  } catch {
    return {ok:false,error:'Browser storage is unavailable or full. Export your case before closing this tab.'};
  }
}

export function newCaseId(): string {
  return 'LOCAL-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
export function newEntryId(prefix: string): string {
  return prefix + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
export function exportCase(caseFile: CaseFile) {
  const bytes = JSON.stringify(caseFile, null, 2) + '\n';
  const blob = new Blob([bytes], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = caseFile.id.toLowerCase() + '.json';
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
