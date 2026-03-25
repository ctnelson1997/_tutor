import type { CodeFlag } from '../../types/engine';

const SUSPICIOUS_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bRuntime\s*\.\s*getRuntime\b/, message: 'This code accesses the Java Runtime' },
  { pattern: /\bProcessBuilder\b/, message: 'This code uses ProcessBuilder' },
  { pattern: /\bSystem\s*\.\s*exit\b/, message: 'This code calls System.exit()' },
  { pattern: /\bjava\s*\.\s*io\b/, message: 'This code uses java.io' },
  { pattern: /\bjava\s*\.\s*net\b/, message: 'This code uses java.net' },
  { pattern: /\bjava\s*\.\s*lang\s*\.\s*reflect\b/, message: 'This code uses reflection' },
  { pattern: /\bClass\s*\.\s*forName\b/, message: 'This code uses dynamic class loading' },
  { pattern: /\bThread\b/, message: 'This code uses threading' },
  { pattern: /\bFileReader\b|\bFileWriter\b|\bBufferedReader\b/, message: 'This code uses file I/O' },
  { pattern: /\bSocket\b|\bServerSocket\b/, message: 'This code uses sockets' },
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
