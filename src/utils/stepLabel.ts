import type { LanguageId } from '../types/engine';

/**
 * What a step's label (`ExecutionSnapshot.label`) means, for its tooltip:
 * in JavaScript, the callback the event loop ran (#45); in Java, calls deeper
 * than the steps can show, which ran before the step without steps (#73).
 */
export function stepLabelTitle(language: LanguageId): string {
  return language === 'js'
    ? 'This step starts a callback the event loop ran'
    : 'Calls this deep run without steps, so the steps fit what can be shown';
}
