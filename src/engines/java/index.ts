import { java } from '@codemirror/lang-java';
import { execute } from './executor';
import { examples } from './examples';
import { analyzeCode } from './security';
import type { LanguageEngine } from '../../types/engine';

export const javaEngine: LanguageEngine = {
  id: 'java',
  displayName: 'Java',
  editorExtension: () => java(),
  execute,
  examples,
  sandboxCode: `public class Main {
  public static void main(String[] args) {
    int x = 1;
    System.out.println(x);
  }
}`,
  analyzeCode,
  heapTypeConfig: {
    array: { label: 'Array', variant: 'info' },
    object: { label: 'Object', variant: 'warning' },
    function: { label: 'Method', variant: 'dark' },
  },
};
