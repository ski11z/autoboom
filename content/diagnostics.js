/**
 * AutoBoom — Selector Diagnostics
 * Tests each selector against the live DOM and reports health status.
 */

const AB_Diagnostics = (() => {

    /**
     * Run a full diagnostic check on all selectors.
     * Returns a map of selector key -> result object.
     */
    function runFullCheck() {
        const results = {};
        const selectors = AB_SELECTORS;
        const meta = AB_SELECTOR_META || {};

        for (const [key, selectorVal] of Object.entries(selectors)) {
            if (!selectorVal || typeof selectorVal === 'function') {
                // Skip null/undefined selectors and functions
                results[key] = {
                    selector: null, matchedSelector: null, found: false, tagName: null,
                    visible: false, text: null, classes: null,
                    critical: (meta[key] || {}).critical || false,
                    phase: (meta[key] || {}).phase || 'unknown',
                    description: (meta[key] || {}).description || key,
                };
                continue;
            }
            // Build sub-selector list from string (comma-separated) or array
            let subSelectors;
            if (Array.isArray(selectorVal)) {
                subSelectors = selectorVal;
            } else {
                subSelectors = selectorVal.split(',').map(s => s.trim());
            }
            let foundEl = null;
            let matchedSelector = null;

            for (const sel of subSelectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el) {
                        foundEl = el;
                        matchedSelector = sel;
                        break;
                    }
                } catch (e) {
                    // Invalid selector
                }
            }

            const selectorMeta = meta[key] || {};

            results[key] = {
                selector: selectorStr,
                matchedSelector,
                found: !!foundEl,
                tagName: foundEl ? foundEl.tagName : null,
                visible: foundEl ? (foundEl.offsetParent !== null && foundEl.offsetWidth > 0) : false,
                text: foundEl ? foundEl.textContent?.substring(0, 50).trim() : null,
                classes: foundEl ? foundEl.className?.substring(0, 100) : null,
                critical: selectorMeta.critical || false,
                phase: selectorMeta.phase || 'unknown',
                description: selectorMeta.description || key,
            };
        }

        return results;
    }

    /**
     * Run diagnostics and return a summary.
     */
    function getSummary() {
        const results = runFullCheck();
        const entries = Object.entries(results);

        const total = entries.length;
        const found = entries.filter(([, r]) => r.found).length;
        const visible = entries.filter(([, r]) => r.visible).length;
        const criticalTotal = entries.filter(([, r]) => r.critical).length;
        const criticalFound = entries.filter(([, r]) => r.critical && r.found).length;
        const missing = entries.filter(([, r]) => !r.found).map(([k]) => k);
        const criticalMissing = entries.filter(([, r]) => r.critical && !r.found).map(([k]) => k);

        return {
            total,
            found,
            visible,
            criticalTotal,
            criticalFound,
            missing,
            criticalMissing,
            healthy: criticalFound === criticalTotal,
            score: total > 0 ? Math.round((found / total) * 100) : 0,
            details: results,
        };
    }

    /**
     * Format diagnostics as a readable text report.
     */
    function formatReport(summary) {
        const lines = [
            `═══ AutoBoom Selector Diagnostics ═══`,
            `Score: ${summary.score}% (${summary.found}/${summary.total} found)`,
            `Critical: ${summary.criticalFound}/${summary.criticalTotal} ${summary.healthy ? '✅' : '❌'}`,
            ``,
        ];

        for (const [key, r] of Object.entries(summary.details)) {
            const icon = r.found ? (r.visible ? '🟢' : '🟡') : '🔴';
            const crit = r.critical ? ' [CRITICAL]' : '';
            lines.push(`${icon} ${key}${crit}`);
            if (r.found) {
                lines.push(`   Tag: ${r.tagName} | Visible: ${r.visible}`);
                if (r.matchedSelector) lines.push(`   Matched: ${r.matchedSelector}`);
            } else {
                lines.push(`   NOT FOUND: ${r.selector.substring(0, 80)}`);
            }
        }

        return lines.join('\n');
    }

    return { runFullCheck, getSummary, formatReport };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Diagnostics = AB_Diagnostics;
}
