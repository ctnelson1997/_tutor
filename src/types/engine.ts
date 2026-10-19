import type { Extension } from '@codemirror/state';
import type { WorkerMessage } from './snapshot';

export type LanguageId = 'js' | 'py' | 'java';

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
  /** What an object of this type with no properties shows: a text ("empty object" if not given), or null for nothing (a Python module, drawn by its name only). */
  empty?: string | null;
}

/** Options passed to an engine's execute(). `stdin` feeds Java's Scanner and Python's input(). */
export interface EngineExecuteOptions {
  stdin?: string;
}

/** How the stdin panel describes the input a language reads (shown when the engine reads stdin). */
export interface StdinDescription {
  /** What reads it, shown in the panel's title (`Scanner`, `input()`). */
  reader: string;
  /** The empty textarea's hint. */
  placeholder: string;
}

export interface LanguageEngine {
  id: LanguageId;
  displayName: string;
  editorExtension: () => Extension;
  execute: (source: string, options?: EngineExecuteOptions) => Promise<WorkerMessage>;
  examples: CodeExample[];
  sandboxCode: string;
  analyzeCode?: (code: string) => CodeFlag[];
  heapTypeConfig?: Record<string, HeapTypeDisplay>;
  /** The program can read input typed in the stdin panel (the store's `stdin`). */
  stdin?: StdinDescription;
}
