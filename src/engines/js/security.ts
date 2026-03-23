import type { CodeFlag } from '../../types/engine';

const SUSPICIOUS_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bfetch\s*\(/, message: 'This code makes network requests (fetch)' },
  { pattern: /\bXMLHttpRequest\b/, message: 'This code uses XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, message: 'This code opens WebSocket connections' },
  { pattern: /\bdocument\.cookie\b/, message: 'This code accesses cookies' },
  { pattern: /\blocalStorage\b/, message: 'This code accesses localStorage' },
  { pattern: /\bsessionStorage\b/, message: 'This code accesses sessionStorage' },
  { pattern: /\beval\s*\(/, message: 'This code uses dynamic eval()' },
  { pattern: /\bnew\s+Function\s*\(/, message: 'This code uses the Function constructor' },
  { pattern: /\blocation\s*\.\s*(href|replace|assign)\b/, message: 'This code may navigate the page' },
  { pattern: /\bwindow\.open\s*\(/, message: 'This code may open new windows' },
  { pattern: /\bimportScripts\s*\(/, message: 'This code imports external scripts' },
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
