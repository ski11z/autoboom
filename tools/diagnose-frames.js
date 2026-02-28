/**
 * Diagnostic: Inspect the Start/End frame buttons and what happens when clicked
 * Run this in the Flow editor console after switching to Video → Frames mode
 */
(function () {
    console.log('=== START/END BUTTON DIAGNOSTIC ===');

    // 1. Find ALL buttons and log those near the bottom of the page
    const allBtns = document.querySelectorAll('button');
    console.log(`Total buttons on page: ${allBtns.length}`);

    const candidates = [];
    for (const btn of allBtns) {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        const rect = btn.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) continue;

        // Log all buttons in bottom half
        if (rect.top > window.innerHeight * 0.4) {
            const info = {
                text: text.substring(0, 80),
                tag: btn.tagName,
                class: (btn.className || '').substring(0, 60),
                role: btn.getAttribute('role'),
                dataState: btn.getAttribute('data-state'),
                ariaLabel: btn.getAttribute('aria-label'),
                rect: { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) },
            };
            candidates.push(info);

            // Highlight potential Start/End buttons
            if (text === 'Start' || text === 'End' || text.includes('Start') || text.includes('End')) {
                console.log(`🎯 POTENTIAL FRAME BUTTON:`, info);
            }
        }
    }

    console.log('\n--- ALL buttons in bottom half ---');
    candidates.forEach((c, i) => console.log(`  [${i}] "${c.text}" @ (${c.rect.top},${c.rect.left}) ${c.rect.w}x${c.rect.h} class="${c.class}" aria="${c.ariaLabel}"`));

    // 2. Also check non-button clickable elements (divs, spans with text Start/End)
    console.log('\n--- Non-button elements with Start/End text ---');
    const allEls = document.querySelectorAll('div, span, a, [role="button"]');
    for (const el of allEls) {
        if (el.tagName === 'BUTTON') continue;
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        const rect = el.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) continue;
        if ((text === 'Start' || text === 'End') && rect.top > window.innerHeight * 0.3) {
            console.log(`  📌 ${el.tagName} "${text}" @ (${Math.round(rect.top)},${Math.round(rect.left)}) ${Math.round(rect.width)}x${Math.round(rect.height)} class="${(el.className || '').substring(0, 60)}" role="${el.getAttribute('role')}"`);
        }
    }

    // 3. Try clicking the Start button and see what happens
    console.log('\n--- Attempting to click Start button ---');
    let startBtn = null;
    for (const btn of allBtns) {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        const rect = btn.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) continue;
        if (text === 'Start' && rect.top > window.innerHeight * 0.4) {
            startBtn = btn;
            break;
        }
    }

    if (!startBtn) {
        // Try broader match
        for (const btn of allBtns) {
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            const rect = btn.getBoundingClientRect();
            if (rect.height === 0 || rect.width === 0) continue;
            if (text.includes('Start') && rect.top > window.innerHeight * 0.4 && text.length < 20) {
                startBtn = btn;
                break;
            }
        }
    }

    if (startBtn) {
        console.log(`Found Start button: "${startBtn.textContent.trim()}" - clicking...`);
        startBtn.click();

        // Check after 2 seconds what appeared
        setTimeout(() => {
            console.log('\n--- AFTER CLICK (2s) ---');

            // Check for dialog
            const dialogs = document.querySelectorAll('[role="dialog"]');
            console.log(`Dialogs found: ${dialogs.length}`);
            dialogs.forEach((d, i) => {
                const text = d.textContent.substring(0, 200);
                console.log(`  Dialog ${i}: "${text}..."`);
            });

            // Check for any new popover/dropdown
            const popovers = document.querySelectorAll('[data-state="open"], [aria-expanded="true"]');
            console.log(`Open popovers/expanded: ${popovers.length}`);
            popovers.forEach((p, i) => {
                console.log(`  Popover ${i}: ${p.tagName} "${p.textContent.substring(0, 100)}..." role="${p.getAttribute('role')}"`);
            });

            // Check for file input
            const fileInputs = document.querySelectorAll('input[type="file"]');
            console.log(`File inputs: ${fileInputs.length}`);

            // Check for any new overlay or modal
            const modals = document.querySelectorAll('[class*="modal"], [class*="overlay"], [class*="popover"], [class*="picker"]');
            console.log(`Modals/overlays/popovers: ${modals.length}`);
            modals.forEach((m, i) => {
                const rect = m.getBoundingClientRect();
                if (rect.height > 0) {
                    console.log(`  ${m.tagName}.${(m.className || '').substring(0, 40)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
                }
            });
        }, 2000);
    } else {
        console.log('❌ Start button NOT FOUND');
    }
})();
