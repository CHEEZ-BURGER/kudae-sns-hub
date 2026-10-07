// Visual feedback follows actual job states; it never determines completion.
export function transferFeedback(state) {
  switch (state) {
    case 'INJECTING': return { phase: 'sending', icon: 'image', percent: 82 };
    case 'WAITING_FOR_TEXT_INPUT': return { phase: 'text', icon: 'text', percent: 88 };
    case 'VERIFYING': return { phase: 'verifying', icon: 'loader', percent: 92 };
    case 'COMPLETE': return { phase: 'complete', icon: 'check', percent: 100 };
    case 'ERROR': return { phase: 'error', icon: 'alert', percent: 0 };
    case 'CANCELLED': return { phase: 'cancelled', icon: 'pause', percent: 0 };
    case 'WAITING_FOR_FILE_INPUT':
    case 'WAITING_FOR_COMPOSER': return { phase: 'waiting', icon: 'window', percent: 12 };
    default: return { phase: 'preparing', icon: 'loader', percent: 8 };
  }
}

export function transferPercent(payload = {}) {
  if (payload.state === 'FETCHING' && Number.isFinite(payload.total) && payload.total > 0 && Number.isFinite(payload.current)) {
    return Math.round(Math.max(0, Math.min(1, payload.current / payload.total)) * 65) + 10;
  }
  return transferFeedback(payload.state).percent;
}
