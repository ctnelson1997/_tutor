import { create } from 'zustand';
import type { ExecutionSnapshot } from '../types/snapshot';
import type { LanguageId } from '../types/engine';
import { branding } from '../config/branding';

export interface JSTutorState {
  // ── Language ──
  language: LanguageId;
  setLanguage: (language: LanguageId) => void;

  // ── Editor ──
  code: string;
  setCode: (code: string) => void;

  // ── Execution state ──
  snapshots: ExecutionSnapshot[];
  currentStep: number;
  isRunning: boolean;
  error: { message: string; line?: number } | null;

  // ── View options ──
  hideFunctions: boolean;
  setHideFunctions: (hide: boolean) => void;

  // ── Actions ──
  setSnapshots: (snapshots: ExecutionSnapshot[]) => void;
  setCurrentStep: (step: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  stepFirst: () => void;
  stepLast: () => void;
  setIsRunning: (running: boolean) => void;
  setError: (error: { message: string; line?: number } | null) => void;
  reset: () => void;
}

export const SANDBOX_CODE = `// Write your code below!
let x = 1;`;

const DEFAULT_CODE = SANDBOX_CODE;

export const useStore = create<JSTutorState>((set, get) => ({
  // ── Language ──
  language: branding.languageId,
  setLanguage: (language) => set({ language }),

  // ── Editor ──
  code: DEFAULT_CODE,
  setCode: (code) => set({ code }),

  // ── Execution state ──
  snapshots: [],
  currentStep: 0,
  isRunning: false,
  error: null,

  // ── View options ──
  hideFunctions: false,
  setHideFunctions: (hide) => set({ hideFunctions: hide }),

  // ── Actions ──
  setSnapshots: (snapshots) => set({ snapshots, currentStep: 0, error: null }),

  setCurrentStep: (step) => {
    const { snapshots } = get();
    if (snapshots.length === 0) return;
    const clamped = Math.max(0, Math.min(step, snapshots.length - 1));
    set({ currentStep: clamped });
  },

  stepForward: () => {
    const { currentStep, snapshots } = get();
    if (currentStep < snapshots.length - 1) {
      set({ currentStep: currentStep + 1 });
    }
  },

  stepBackward: () => {
    const { currentStep } = get();
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 });
    }
  },

  stepFirst: () => set({ currentStep: 0 }),

  stepLast: () => {
    const { snapshots } = get();
    if (snapshots.length > 0) {
      set({ currentStep: snapshots.length - 1 });
    }
  },

  setIsRunning: (isRunning) => set({ isRunning }),

  setError: (error) => set({ error }),

  reset: () => set({ snapshots: [], currentStep: 0, error: null, isRunning: false }),
}));
