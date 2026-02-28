/**
 * AutoBoom — Message Protocol
 * Defines all message types exchanged between popup, service worker, and content script.
 */

const AB_EVENTS = {
    // ─── Popup / Dashboard → Service Worker ───
    START_PROJECT: 'START_PROJECT',       // { projectId }
    STOP_PROJECT: 'STOP_PROJECT',         // { projectId }
    PAUSE_PROJECT: 'PAUSE_PROJECT',       // { projectId }
    RESUME_PROJECT: 'RESUME_PROJECT',     // { projectId }
    START_BATCH: 'START_BATCH',           // {}
    PAUSE_BATCH: 'PAUSE_BATCH',          // {}
    RESUME_BATCH: 'RESUME_BATCH',        // {}
    STOP_BATCH: 'STOP_BATCH',            // {}

    // ─── Service Worker → Content Script ───
    EXECUTE_ACTION: 'EXECUTE_ACTION',     // { action, params }
    CANCEL_ACTION: 'CANCEL_ACTION',       // {}

    // ─── Content Script → Service Worker ───
    CONTENT_READY: 'CONTENT_READY',       // { url, tabId }
    ACTION_RESULT: 'ACTION_RESULT',       // { action, success, data, error }
    ACTION_PROGRESS: 'ACTION_PROGRESS',   // { action, detail }

    // ─── Service Worker → Popup / Dashboard (broadcast) ───
    STATE_UPDATE: 'STATE_UPDATE',         // { projectId, phase, state, progress }
    BATCH_UPDATE: 'BATCH_UPDATE',         // { batchStatus, currentProjectId }
    ERROR_REPORT: 'ERROR_REPORT',         // { projectId, error, recoverable }
    LOG_ENTRY: 'LOG_ENTRY',              // { projectId, level, message, timestamp }

    // ─── Diagnostics ───
    RUN_DIAGNOSTICS: 'RUN_DIAGNOSTICS',   // {}
    DIAGNOSTICS_RESULT: 'DIAGNOSTICS_RESULT', // { results }

    // ─── Popup → Content Script (direct) ───
    GET_PAGE_STATUS: 'GET_PAGE_STATUS',   // {}
    PAGE_STATUS: 'PAGE_STATUS',           // { onFlowPage, loggedIn, projectOpen }

    // ─── Storage sync ───
    REQUEST_STATE: 'REQUEST_STATE',       // {} 
    FULL_STATE: 'FULL_STATE',            // { projects, batchQueue, activeJob }

    // ─── Run History ───
    GET_RUN_HISTORY: 'GET_RUN_HISTORY',   // {}
    CLEAR_RUN_HISTORY: 'CLEAR_RUN_HISTORY', // {}

    // ─── Auth & License ───
    AUTH_STATE_CHANGED: 'AUTH_STATE_CHANGED',     // { event: 'SIGNED_IN'|'SIGNED_OUT', user }
    LICENSE_UPDATED: 'LICENSE_UPDATED',           // { plan, usage }
    USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',  // { current, limit }
};

// ─── Action Types (for EXECUTE_ACTION) ───
const AB_ACTIONS = {
    // Image generation
    ENTER_IMAGE_PROMPT: 'ENTER_IMAGE_PROMPT',
    SET_ASPECT_RATIO: 'SET_ASPECT_RATIO',
    SET_IMAGE_MODEL: 'SET_IMAGE_MODEL',
    ATTACH_REFERENCE_ADD_TO_PROMPT: 'ATTACH_REFERENCE_ADD_TO_PROMPT',
    ATTACH_REFERENCE_UPLOAD: 'ATTACH_REFERENCE_UPLOAD',
    CLICK_GENERATE: 'CLICK_GENERATE',
    WAIT_IMAGE_COMPLETE: 'WAIT_IMAGE_COMPLETE',
    CONFIGURE_SETTINGS: 'CONFIGURE_SETTINGS',
    COUNT_IMAGES: 'COUNT_IMAGES',
    ATTACH_REFERENCE_URL: 'ATTACH_REFERENCE_URL',
    CLICK_RETRY_ICON: 'CLICK_RETRY_ICON',
    CLICK_REUSE_PROMPT_BUTTON: 'CLICK_REUSE_PROMPT_BUTTON',

    // Video generation
    SELECT_FRAMES_TO_VIDEO: 'SELECT_FRAMES_TO_VIDEO',
    SELECT_TEXT_TO_VIDEO: 'SELECT_TEXT_TO_VIDEO',
    ATTACH_START_FRAME: 'ATTACH_START_FRAME',
    ATTACH_END_FRAME: 'ATTACH_END_FRAME',
    ENTER_VIDEO_PROMPT: 'ENTER_VIDEO_PROMPT',
    SET_VIDEO_MODEL: 'SET_VIDEO_MODEL',
    CLICK_GENERATE_VIDEO: 'CLICK_GENERATE_VIDEO',
    CLICK_REUSE_PROMPT: 'CLICK_REUSE_PROMPT',
    WAIT_VIDEO_COMPLETE: 'WAIT_VIDEO_COMPLETE',
    DOWNLOAD_VIDEO: 'DOWNLOAD_VIDEO',
    COUNT_COMPLETED_VIDEOS: 'COUNT_COMPLETED_VIDEOS',
    GET_VIDEO_URLS: 'GET_VIDEO_URLS',

    // Navigation
    CHECK_FLOW_PAGE: 'CHECK_FLOW_PAGE',
    NAVIGATE_TO_FLOW: 'NAVIGATE_TO_FLOW',
    CREATE_NEW_PROJECT: 'CREATE_NEW_PROJECT',
    SWITCH_TO_IMAGES_TAB: 'SWITCH_TO_IMAGES_TAB',
    SWITCH_TO_VIDEOS_TAB: 'SWITCH_TO_VIDEOS_TAB',

    // Diagnostics
    RUN_SELECTOR_CHECK: 'RUN_SELECTOR_CHECK',

    // Credits
    GET_CREDITS: 'GET_CREDITS',

    // Video Throttle
    COUNT_PENDING_VIDEOS: 'COUNT_PENDING_VIDEOS',

    // Stealth Overlay
    SHOW_STEALTH_OVERLAY: 'SHOW_STEALTH_OVERLAY',
    HIDE_STEALTH_OVERLAY: 'HIDE_STEALTH_OVERLAY',
    UPDATE_STEALTH_PROGRESS: 'UPDATE_STEALTH_PROGRESS',

    // AI Proxy (AutoBoom key)
    AI_PROXY_PARSE: 'AI_PROXY_PARSE',
};

if (typeof globalThis !== 'undefined') {
    globalThis.AB_EVENTS = AB_EVENTS;
    globalThis.AB_ACTIONS = AB_ACTIONS;
}
