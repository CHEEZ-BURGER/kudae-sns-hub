globalThis.KudaeSNS = globalThis.KudaeSNS || {};

Object.assign(globalThis.KudaeSNS, {
  APP_SOURCE: 'KUDAE_SNS_WORKFLOW',
  EXTENSION_SOURCE: 'KUDAE_SNS_EXTENSION',
  ALLOWED_APP_ORIGINS: new Set([
    'https://cheez-burger.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]),
  ALLOWED_ASSET_HOSTS: new Set(['bcqqokdehkfaiuquktag.supabase.co']),
  TARGETS: Object.freeze(['instagram', 'facebook', 'koreapas', 'everytime', 'x', 'youtube']),
  TARGET_LABELS: Object.freeze({ instagram: 'Instagram', facebook: 'Facebook', koreapas: '고파스', everytime: '에타', x: 'X', youtube: 'YouTube' }),
  JOB_TTL_MS: 10 * 60 * 1000,
  MAX_FILE_BYTES: 500 * 1024 * 1024,
  FETCH_CONCURRENCY: 3,
  STATES: Object.freeze({
    QUEUED: 'QUEUED',
    OPENING_TARGET: 'OPENING_TARGET',
    FETCHING: 'FETCHING',
    WAITING_FOR_COMPOSER: 'WAITING_FOR_COMPOSER',
    WAITING_FOR_FILE_INPUT: 'WAITING_FOR_FILE_INPUT',
    INJECTING: 'INJECTING',
    VERIFYING: 'VERIFYING',
    COMPLETE: 'COMPLETE',
    CANCELLED: 'CANCELLED',
    ERROR: 'ERROR',
  }),
});
