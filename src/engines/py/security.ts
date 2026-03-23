import type { CodeFlag } from '../../types/engine';

const SUSPICIOUS_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bimport\s+os\b/, message: 'This code imports the os module' },
  { pattern: /\bimport\s+sys\b/, message: 'This code imports the sys module' },
  { pattern: /\bimport\s+subprocess\b/, message: 'This code imports subprocess' },
  { pattern: /\bimport\s+socket\b/, message: 'This code imports socket' },
  { pattern: /\bimport\s+shutil\b/, message: 'This code imports shutil' },
  { pattern: /\bopen\s*\(/, message: 'This code opens files' },
  { pattern: /\b__import__\s*\(/, message: 'This code uses dynamic imports' },
  { pattern: /\beval\s*\(/, message: 'This code uses eval()' },
  { pattern: /\bexec\s*\(/, message: 'This code uses exec()' },
  { pattern: /\bcompile\s*\(/, message: 'This code uses compile()' },
  { pattern: /\bglobals\s*\(\s*\)/, message: 'This code accesses globals()' },
  { pattern: /\bgetattr\s*\(/, message: 'This code uses getattr()' },
];

export function analyzeCode(code: string): CodeFlag[] {
  const flags: CodeFlag[] = [];
  for (const { pattern, message } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(code)) {
      flags.push({ level: 'warning', message });
    }
  }
  return flags;
}
