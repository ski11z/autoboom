/**
 * AutoBoom — Selector Discovery Script
 * 
 * INSTRUCTIONS:
 * 1. Open Google Flow and create a new project manually (click "+ New project")
 * 2. Wait for the editor to fully load
 * 3. Open DevTools (F12) → Console tab
 * 4. Paste this entire script and press Enter
 * 5. Copy the JSON output and share it
 * 
 * This will detect all important UI elements and dump their HTML for selector creation.
 */

(function () {
    const report = {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        elements: {}
    };

    // ─── Helper: get a compact HTML snapshot of an element ───
    function snapshot(el, maxLen = 300) {
        if (!el) return null;
        const tag = el.tagName.toLowerCase();
        const attrs = [];
        for (const attr of el.attributes) {
            if (['class', 'id', 'aria-label', 'placeholder', 'data-testid', 'role', 'type', 'contenteditable', 'data-type', 'name'].includes(attr.name)) {
                attrs.push(`${attr.name}="${attr.value}"`);
            }
        }
        const inner = el.textContent?.trim().substring(0, 80) || '';
        const html = el.outerHTML?.substring(0, maxLen) || '';
        return { tag, attrs: attrs.join(' '), text: inner, html };
    }

    // ─── 1. PROMPT INPUT ───
    const textareas = document.querySelectorAll('textarea');
    const contentEditables = document.querySelectorAll('[contenteditable="true"]');
    const inputs = document.querySelectorAll('input[type="text"]');
    report.elements.textareas = [...textareas].map(el => snapshot(el));
    report.elements.contentEditables = [...contentEditables].map(el => snapshot(el));
    report.elements.textInputs = [...inputs].map(el => snapshot(el));

    // ─── 2. BUTTONS ───
    const allButtons = document.querySelectorAll('button');
    report.elements.buttons = [...allButtons].map(el => {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        return { text: text.substring(0, 60), ...snapshot(el, 200) };
    }).filter(b => b.text.length > 0);

    // ─── 3. GENERATE BUTTON candidates ───
    report.elements.generateButtons = report.elements.buttons.filter(b =>
        b.text.toLowerCase().includes('generate') ||
        b.text.toLowerCase().includes('create') ||
        b.text.toLowerCase().includes('go')
    );

    // ─── 4. ROLE elements ───
    const tabLists = document.querySelectorAll('[role="tablist"]');
    const tabs = document.querySelectorAll('[role="tab"]');
    report.elements.tabLists = [...tabLists].map(el => snapshot(el));
    report.elements.tabs = [...tabs].map(el => snapshot(el));

    // ─── 5. File inputs ───
    const fileInputs = document.querySelectorAll('input[type="file"]');
    report.elements.fileInputs = [...fileInputs].map(el => snapshot(el));

    // ─── 6. Images in result area ───
    const images = document.querySelectorAll('img');
    report.elements.images = [...images].slice(0, 10).map(el => ({
        src: (el.src || '').substring(0, 100),
        ...snapshot(el, 200)
    }));

    // ─── 7. Videos ───
    const videos = document.querySelectorAll('video');
    report.elements.videos = [...videos].map(el => snapshot(el));

    // ─── 8. Dropdowns / Selects ───
    const selects = document.querySelectorAll('select, [role="listbox"], [role="combobox"]');
    report.elements.selects = [...selects].map(el => snapshot(el));

    // ─── 9. Aspect ratio related ───
    const aspectEls = [...document.querySelectorAll('*')].filter(el => {
        const t = (el.textContent || '').trim();
        return (t === '9:16' || t === '16:9' || t === '3:4' || t === '4:3' || t === '1:1') && el.children.length === 0;
    });
    report.elements.aspectRatio = aspectEls.slice(0, 10).map(el => ({
        parentTag: el.parentElement?.tagName,
        ...snapshot(el)
    }));

    // ─── 10. Loading indicators ───
    const spinners = document.querySelectorAll('[role="progressbar"], [class*="spinner" i], [class*="loading" i]');
    report.elements.spinners = [...spinners].map(el => snapshot(el));

    // ─── OUTPUT ───
    const output = JSON.stringify(report, null, 2);
    console.log('%c=== AutoBoom Selector Discovery ===', 'color: #58a6ff; font-size: 16px; font-weight: bold');
    console.log(output);

    // Also copy to clipboard
    try {
        navigator.clipboard.writeText(output).then(() => {
            console.log('%c✅ Results copied to clipboard! Paste them to your assistant.', 'color: #7ee787; font-size: 14px');
        });
    } catch (e) {
        console.log('%c⚠️ Could not copy to clipboard. Please select and copy the JSON above.', 'color: #f0883e; font-size: 14px');
    }

    return report;
})();
