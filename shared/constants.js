/**
 * AutoBoom — Shared Constants
 * Central place for all enums, defaults, and configuration values.
 */

const AB_CONSTANTS = {
  // ─── Supabase Config ───
  // These are PUBLIC keys — safe to embed in client code.
  // The service_role key lives only in Edge Functions.
  SUPABASE_URL: 'https://gaxwsnnsugfhikrwhjgm.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_To8gGDrdnvLDkedXU2r_Jw_-maGwFug',

  // ─── Plans ───
  PLAN: {
    FREE: 'free',
    PREMIUM: 'premium',
  },

  // ─── Free Tier Limits ───
  FREE_TIER_DAILY_LIMIT: 10,       // Prompts per day for free users
  AI_PROXY_DAILY_LIMIT: 50,        // AI parser calls per day (AutoBoom key)

  // ─── Premium Features (locked for free users) ───
  PREMIUM_FEATURES: [
    'chain_mode',
    'ai_prompt_parser',
    'batch_queue',
    'stealth_mode',
    'notifications',
    'reference_urls',
  ],

  // ─── Project Statuses ───
  PROJECT_STATUS: {
    DRAFT: 'draft',
    READY: 'ready',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    COMPLETED_WITH_ERRORS: 'completed_with_errors',
    ERROR: 'error',
  },

  // ─── Job Phases ───
  PHASE: {
    IMAGES: 'images',
    VIDEOS: 'videos',
    TEXT_TO_VIDEO: 'text-to-video',
    CREATE_IMAGE: 'create-image',
  },

  // ─── Image Result Statuses ───
  IMAGE_STATUS: {
    PENDING: 'pending',
    GENERATING: 'generating',
    READY: 'ready',
    ERROR: 'error',
  },

  // ─── Video Result Statuses ───
  VIDEO_STATUS: {
    PENDING: 'pending',
    QUEUED: 'queued',
    GENERATING: 'generating',
    SUBMITTED: 'submitted',
    DOWNLOADED: 'downloaded',
    ERROR: 'error',
  },

  // ─── Batch Queue Statuses ───
  BATCH_STATUS: {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
  },

  // ─── Batch Project Statuses ───
  BATCH_PROJECT_STATUS: {
    QUEUED: 'queued',
    RUNNING: 'running',
    COMPLETED: 'completed',
    ERROR: 'error',
    SKIPPED: 'skipped',
  },

  // ─── FSM States: Project Lifecycle ───
  PROJECT_FSM: {
    IDLE: 'IDLE',
    IMAGE_PHASE: 'IMAGE_PHASE',
    VIDEO_PHASE: 'VIDEO_PHASE',
    CREATE_IMAGE_PHASE: 'CREATE_IMAGE_PHASE',
    PAUSED: 'PAUSED',
    ERROR: 'ERROR',
    COMPLETED: 'COMPLETED',
    TEXT_TO_VIDEO_PHASE: 'TEXT_TO_VIDEO_PHASE',
  },

  // ─── FSM States: Image Generation ───
  IMAGE_FSM: {
    PREPARE_PROMPT: 'PREPARE_PROMPT',
    ATTACH_REFERENCE: 'ATTACH_REFERENCE',
    ATTACH_REFERENCE_FALLBACK: 'ATTACH_REFERENCE_FALLBACK',
    SUBMIT_GENERATION: 'SUBMIT_GENERATION',
    WAIT_FOR_RESULT: 'WAIT_FOR_RESULT',
    STEP_COMPLETE: 'STEP_COMPLETE',
    STEP_ERROR: 'STEP_ERROR',
    PHASE_ERROR: 'PHASE_ERROR',
  },

  // ─── FSM States: Video Generation (per-worker) ───
  VIDEO_FSM: {
    SELECT_F2V_MODE: 'SELECT_F2V_MODE',
    ATTACH_START_FRAME: 'ATTACH_START_FRAME',
    ATTACH_END_FRAME: 'ATTACH_END_FRAME',
    ENTER_ANIMATION_PROMPT: 'ENTER_ANIMATION_PROMPT',
    SUBMIT_GENERATION: 'SUBMIT_GENERATION',
    WAIT_FOR_RESULT: 'WAIT_FOR_RESULT',
    DOWNLOAD_VIDEO: 'DOWNLOAD_VIDEO',
    WORKER_COMPLETE: 'WORKER_COMPLETE',
    WORKER_ERROR: 'WORKER_ERROR',
    WORKER_FAILED: 'WORKER_FAILED',
  },

  // ─── FSM States: Video Phase Orchestrator ───
  VIDEO_PHASE_FSM: {
    SUBMIT_ALL_TRANSITIONS: 'SUBMIT_ALL_TRANSITIONS',
    WAIT_FOR_ALL: 'WAIT_FOR_ALL',
    DOWNLOAD_ALL: 'DOWNLOAD_ALL',
    PARTIAL_ERROR: 'PARTIAL_ERROR',
    RETRY_FAILED: 'RETRY_FAILED',
    PHASE_COMPLETE: 'PHASE_COMPLETE',
    PHASE_ERROR: 'PHASE_ERROR',
  },

  // ─── FSM States: Batch Queue ───
  BATCH_FSM: {
    QUEUE_IDLE: 'QUEUE_IDLE',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    QUEUE_COMPLETE: 'QUEUE_COMPLETE',
  },

  // ─── Model Definitions ───
  IMAGE_MODELS: [
    { value: 'nano-banana-pro', label: '🍌 Nano Banana Pro' },
    { value: 'nano-banana-2', label: '🍌 Nano Banana 2' },
    { value: 'imagen-4', label: 'Imagen 4' },
  ],
  VIDEO_MODELS: [
    { value: 'veo-3.1-fast', label: 'Veo 3.1 - Fast' },
    { value: 'veo-3.1-fast-lp', label: 'Veo 3.1 - Fast [Lower Priority]' },
    { value: 'veo-3.1-quality', label: 'Veo 3.1 - Quality' },
    { value: 'veo-2-fast', label: 'Veo 2 - Fast' },
    { value: 'veo-2-quality', label: 'Veo 2 - Quality' },
  ],

  // ─── Defaults ───
  DEFAULTS: {
    ASPECT_RATIO: '9:16',
    OUTPUTS_PER_PROMPT: 1,
    IMAGE_MODEL: 'nano-banana-pro',
    VIDEO_MODEL: 'veo-3.1-fast',
    IMAGE_TIMEOUT_MS: 120_000,
    VIDEO_TIMEOUT_MS: 300_000,
    MAX_RETRIES: 3,
    RETRY_BASE_MS: 3_000,
    RETRY_BACKOFF_MULTIPLIER: 2,
    RETRY_MAX_DELAY_MS: 30_000,
    REFERENCE_METHOD: 'auto', // 'auto' | 'add-to-prompt' | 'upload'
    DOM_QUERY_TIMEOUT_MS: 5_000,
    DOM_QUERY_RETRIES: 3,
    ACTION_DELAY_MIN_MS: 800,
    ACTION_DELAY_MAX_MS: 2_000,
    KEEPALIVE_ALARM_MINUTES: 1,
  },

  // ─── Storage Keys ───
  STORAGE_KEYS: {
    PROJECTS: 'ab_projects',
    BATCH_QUEUE: 'ab_batchQueue',
    JOB_PROGRESS_PREFIX: 'ab_jobProgress:',
    SETTINGS: 'ab_settings',
    SELECTOR_OVERRIDES: 'ab_selectorOverrides',
    ACTIVE_TAB: 'ab_activeTab',
    RUN_HISTORY: 'ab_runHistory',
    AUTH_SESSION: 'ab_authSession',
    USER_PROFILE: 'ab_userProfile',
    USAGE_CACHE: 'ab_usageCache',
    AI_KEY_MODE: 'ab_aiKeyMode',        // 'autoboom' or 'own'
    LOCAL_USAGE: 'ab_localUsage',         // { date: 'YYYY-MM-DD', count: N } for anonymous users
  },

  // ─── Aspect Ratios ───
  ASPECT_RATIOS: ['9:16', '16:9'],

  // ─── Flow URLs ───
  FLOW_URLS: {
    BASE: 'https://labs.google/fx/tools/flow',
    EDITOR: 'https://labs.google/flow',
  },
};

// Make available in both content script and module contexts
if (typeof globalThis !== 'undefined') {
  globalThis.AB_CONSTANTS = AB_CONSTANTS;
}
