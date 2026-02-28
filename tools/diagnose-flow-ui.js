/**
 * AutoBoom Diagnostic — Run this in the Flow project editor console.
 * 
 * HOW TO USE:
 * 1. Open a Flow project (so you see the prompt area + settings)
 * 2. Open DevTools (F12) → Console tab
 * 3. Paste this entire script and press Enter
 * 4. Copy the console output and send it back
 */

(function () {
    const results = {};

    // ═══ 1. Find Prompt Input ═══
    const slate = document.querySelector('div[data-slate-editor="true"]');
    const textbox = document.querySelector('div[role="textbox"][contenteditable="true"]');
    const oldTextarea = document.querySelector('#PINHOLE_TEXT_AREA_ELEMENT_ID');
    const anyContentEditable = document.querySelectorAll('[contenteditable="true"]');

    results.promptInput = {
        slateEditor: slate ? {
            tag: slate.tagName,
            attrs: Object.fromEntries([...slate.attributes].map(a => [a.name, a.value])),
            textContent: slate.textContent.substring(0, 50),
            parentTag: slate.parentElement?.tagName,
            parentClass: slate.parentElement?.className?.substring(0, 60),
        } : null,
        textboxDiv: textbox ? {
            tag: textbox.tagName,
            attrs: Object.fromEntries([...textbox.attributes].map(a => [a.name, a.value])),
        } : null,
        oldTextarea: oldTextarea ? 'FOUND' : null,
        allContentEditables: anyContentEditable.length,
        contentEditableDetails: [...anyContentEditable].map(el => ({
            tag: el.tagName,
            id: el.id || null,
            class: el.className?.substring(0, 40) || null,
            role: el.getAttribute('role'),
            hasSlateAttr: el.hasAttribute('data-slate-editor'),
        })),
    };

    // ═══ 2. Test execCommand ═══
    if (slate || textbox) {
        const target = slate || textbox;
        target.focus();
        const testText = '__AUTOBOOM_TEST__';
        const execResult = document.execCommand('insertText', false, testText);
        const afterText = target.textContent;
        const worked = afterText.includes(testText);

        // Clean up
        if (worked) {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
        }

        results.execCommandTest = {
            targetElement: target === slate ? 'slate' : 'textbox',
            execCommandResult: execResult,
            textAppearedInDOM: worked,
            afterTextContent: afterText.substring(0, 80),
        };
    }

    // ═══ 3. Find Create/Generate Button ═══
    const allButtons = document.querySelectorAll('button');
    const buttonInfo = [];
    for (const btn of allButtons) {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        const rect = btn.getBoundingClientRect();
        // Only show buttons in the bottom area or with relevant text
        if (rect.y > 400 || text.includes('Create') || text.includes('arrow_forward') ||
            text.includes('Nano') || text.includes('Imagen') || text.includes('Veo')) {
            buttonInfo.push({
                text: text.substring(0, 80),
                y: Math.round(rect.y),
                x: Math.round(rect.x),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                disabled: btn.disabled,
                role: btn.getAttribute('role'),
                ariaLabel: btn.getAttribute('aria-label'),
                class: btn.className?.substring(0, 40) || null,
                hasArrowIcon: !!btn.querySelector('i')?.textContent?.includes('arrow_forward'),
            });
        }
    }
    results.buttons = buttonInfo;

    // ═══ 4. Find Toggle Buttons (Settings Area) ═══
    const settingsButtons = [];
    for (const btn of allButtons) {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        if (['Image', 'Video', 'Landscape', 'Portrait', 'x1', 'x2', 'x3', 'x4'].some(l => text.includes(l))) {
            const rect = btn.getBoundingClientRect();
            settingsButtons.push({
                text: text.substring(0, 50),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                disabled: btn.disabled,
                ariaPressed: btn.getAttribute('aria-pressed'),
                ariaSelected: btn.getAttribute('aria-selected'),
                dataState: btn.getAttribute('data-state'),
                class: btn.className?.substring(0, 40) || null,
            });
        }
    }
    results.settingsToggles = settingsButtons;

    // ═══ 5. Model Dropdown ═══
    const combobox = document.querySelector('button[role="combobox"]');
    results.modelDropdown = combobox ? {
        text: combobox.textContent.replace(/\s+/g, ' ').trim(),
        class: combobox.className?.substring(0, 40),
        ariaExpanded: combobox.getAttribute('aria-expanded'),
    } : null;

    // ═══ Output ═══
    console.log('═══ AUTOBOOM DIAGNOSTIC RESULTS ═══');
    console.log(JSON.stringify(results, null, 2));
    console.log('═══ END DIAGNOSTIC ═══');

    return results;
})();
