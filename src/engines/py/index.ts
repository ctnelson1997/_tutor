import { python } from '@codemirror/lang-python';
import { execute } from './executor';
import { examples } from './examples';
import { analyzeCode } from './security';
import type { LanguageEngine } from '../../types/engine';

export const pyEngine: LanguageEngine = {
  id: 'py',
  displayName: 'Python',
  editorExtension: () => python(),
  execute,
  examples,
  sandboxCode: '# Write your code below!\nx = 1\nprint(x)',
  analyzeCode,
  heapTypeConfig: {
    list: { label: 'List', variant: 'info' },
    dict: { label: 'Dict', variant: 'warning' },
    tuple: { label: 'Tuple', variant: 'secondary' },
    set: { label: 'Set', variant: 'warning' },
    function: { label: 'Function', variant: 'dark' },
    object: { label: 'Object', variant: 'warning' },
  },
};
