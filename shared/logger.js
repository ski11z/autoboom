/**
 * AutoBoom — Structured Logger
 * Logs to console and stores log entries in chrome.storage for run.log export.
 */

const AB_Logger = (() => {
    const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    let _level = LEVELS.INFO;
    let _projectId = null;
    const _buffer = [];
    const MAX_BUFFER = 500;

    const _timestamp = () => new Date().toISOString();

    const _formatMsg = (level, module, message, data) => ({
        timestamp: _timestamp(),
        level,
        module,
        message,
        data: data || null,
        projectId: _projectId,
    });

    const _log = (level, module, message, data) => {
        const entry = _formatMsg(level, module, message, data);

        // Console output
        const prefix = `[AutoBoom:${module}]`;
        switch (level) {
            case 'DEBUG': console.debug(prefix, message, data || ''); break;
            case 'INFO': console.info(prefix, message, data || ''); break;
            case 'WARN': console.warn(prefix, message, data || ''); break;
            case 'ERROR': console.error(prefix, message, data || ''); break;
        }

        // Buffer for persistence
        _buffer.push(entry);
        if (_buffer.length > MAX_BUFFER) {
            _buffer.shift();
        }

        // Broadcast to popup if available
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: AB_EVENTS.LOG_ENTRY,
                    payload: entry,
                }).catch(() => { /* popup might not be open */ });
            }
        } catch (e) {
            // Ignore — popup not available
        }

        return entry;
    };

    return {
        setLevel(level) {
            _level = LEVELS[level] ?? LEVELS.INFO;
        },

        setProjectId(id) {
            _projectId = id;
        },

        debug(module, message, data) {
            if (_level <= LEVELS.DEBUG) return _log('DEBUG', module, message, data);
        },

        info(module, message, data) {
            if (_level <= LEVELS.INFO) return _log('INFO', module, message, data);
        },

        warn(module, message, data) {
            if (_level <= LEVELS.WARN) return _log('WARN', module, message, data);
        },

        error(module, message, data) {
            if (_level <= LEVELS.ERROR) return _log('ERROR', module, message, data);
        },

        /** Get all buffered log entries */
        getBuffer() {
            return [..._buffer];
        },

        /** Clear the log buffer */
        clearBuffer() {
            _buffer.length = 0;
        },

        /** Export logs as a formatted string for run.log */
        exportAsText() {
            return _buffer.map(e =>
                `[${e.timestamp}] [${e.level}] [${e.module}] ${e.message}${e.data ? ' | ' + JSON.stringify(e.data) : ''}`
            ).join('\n');
        },

        /** Persist current buffer to chrome.storage */
        async persistToStorage(projectId) {
            if (typeof chrome === 'undefined' || !chrome.storage) return;
            const key = `ab_log:${projectId || _projectId || 'global'}`;
            try {
                const result = await chrome.storage.local.get(key);
                const existing = result[key] || [];
                const merged = [...existing, ..._buffer].slice(-MAX_BUFFER);
                await chrome.storage.local.set({ [key]: merged });
                _buffer.length = 0;
            } catch (e) {
                console.error('[AutoBoom:Logger] Failed to persist logs:', e);
            }
        },
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Logger = AB_Logger;
}
