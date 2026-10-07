export type TransferPhase = 'preparing' | 'sending' | 'text' | 'verifying' | 'complete' | 'error' | 'cancelled' | 'waiting';
export function transferFeedback(state?: string): { phase: TransferPhase; icon: string; percent: number };
export function transferPercent(payload?: { state?: string; current?: number; total?: number }): number;
