/**
 * AutoBoom — Changelog
 * Structured release notes displayed in the Settings page.
 */

const AB_CHANGELOG = [
    {
        version: '0.1.0',
        date: '2026-02-25',
        changes: [
            'Initial release',
            'Frames-to-Video, Text-to-Video, and Create Image modes',
            'Batch queue with pause/resume/stop',
            'AI prompt parser (DeepSeek, OpenAI, Gemini, Claude, OpenRouter)',
            'Stealth overlay mode',
            'Telegram notifications',
            'Session recovery for interrupted jobs',
            'Diagnostics panel for selector health',
            'Run history with stats',
            'Project duplicate / clone',
        ],
    },
];

if (typeof globalThis !== 'undefined') {
    globalThis.AB_CHANGELOG = AB_CHANGELOG;
}
