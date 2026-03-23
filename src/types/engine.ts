import type { Extension } from '@codemirror/state';
import type { WorkerMessage } from './snapshot';

export type LanguageId = 'js' | 'py';

export interface CodeExample {
  title: string;
  slug: string;
  category: string;
  code: string;
  language: LanguageId;
}

export interface CodeFlag {
  level: 'warning' | 'info';
  message: string;
}

export interface HeapTypeDisplay {
  label: string;
  variant: string;
}

export interface LanguageEngine {
  id: LanguageId;
  displayName: string;
  editorExtension: () => Extension;
  execute: (source: string) => Promise<WorkerMessage>;
  examples: CodeExample[];
  sandboxCode: string;
  analyzeCode?: (code: string) => CodeFlag[];
  heapTypeConfig?: Record<string, HeapTypeDisplay>;
}
