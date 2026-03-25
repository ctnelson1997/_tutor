import { create } from 'zustand';
import type { ExecutionSnapshot } from '../types/snapshot';
import type { LanguageId } from '../types/engine';
import { branding } from '../config/branding';

export interface TutorState {
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
  showReferences: boolean;
  setShowReferences: (show: boolean) => void;

  // ── Heap layout ──
  heapPositions: Record<string, { x: number; y: number }>;
  setHeapPosition: (heapId: string, x: number, y: number) => void;
  clearHeapPositions: () => void;

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

const SANDBOX_CODES: Record<string, string> = {
  js: `// Write your code below!\nlet x = 1;`,
  py: `# Write your code below!\nx = 1\nprint(x)`,
  java: `public class Main {\n  public static void main(String[] args) {\n    int x = 1;\n    System.out.println(x);\n  }\n}`,
};

export const SANDBOX_CODE = SANDBOX_CODES[branding.languageId] || SANDBOX_CODES.js;

const DEFAULT_CODE = SANDBOX_CODE;

export const useStore = create<TutorState>((set, get) => ({
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
  showReferences: false,
  setShowReferences: (show) => set({ showReferences: show }),

  // ── Heap layout ──
  heapPositions: {},
  setHeapPosition: (heapId, x, y) => set((state) => ({
    heapPositions: { ...state.heapPositions, [heapId]: { x, y } },
  })),
  clearHeapPositions: () => set({ heapPositions: {} }),

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
