import { javascript } from '@codemirror/lang-javascript';
import { execute } from './executor';
import { examples } from './examples';
import { analyzeCode } from './security';
import type { LanguageEngine } from '../../types/engine';

export const jsEngine: LanguageEngine = {
  id: 'js',
  displayName: 'JavaScript',
  editorExtension: () => javascript(),
  execute,
  examples,
  sandboxCode: `// Write your code below!\nlet x = 1;`,
  analyzeCode,
};
