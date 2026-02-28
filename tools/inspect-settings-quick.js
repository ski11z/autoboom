/**
 * Quick Settings Diagnostic v2 — Uses simulated pointer events like the extension does.
 * Run this in DevTools console on a Flow PROJECT editor page.
 */
(async function () {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = [];

    function simulateRealClick(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const commonProps = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...commonProps, pointerId: 1 }));
        el.dispatchEvent(new MouseEvent('mousedown', commonProps));
        el.dispatchEvent(new PointerEvent('pointerup', { ...commonProps, pointerId: 1 }));
        el.dispatchEvent(new MouseEvent('mouseup', commonProps));
        el.dispatchEvent(new MouseEvent('click', commonProps));
    }

    function dumpButtons(label) {
        out.push(`\n=== ${label} ===`);
        const btns = document.querySelectorAll('button');
        out.push(`Total buttons: ${btns.length}`);
        for (let i = 0; i < btns.length; i++) {
            const btn = btns[i];
            const rect = btn.getBoundingClientRect();
            if (rect.height === 0 && rect.width === 0) continue;
            const text = btn.textContent.replace(/\s+/g, ' ').trim();
            if (text.length === 0 || text.length > 100) continue;
            const ds = btn.getAttribute('data-state') || '';
            out.push(`  [${i}] "${text}" | ds=${ds} | y=${Math.round(rect.y)} h=${Math.round(rect.height)}`);
        }
    }

    // Find the settings button
    let settingsBtn = null;
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        if ((text.includes('crop_') || text.includes('x1') || text.includes('x2') || text.includes('x3') || text.includes('x4')) &&
            (text.includes('Video') || text.includes('Image') || text.includes('Nano') || text.includes('Imagen') || text.includes('Veo') || text.includes('🍌'))) {
            settingsBtn = btn;
            break;
        }
    }

    if (!settingsBtn) {
        out.push('❌ Settings button NOT FOUND');
        dumpButtons('ALL BUTTONS');
    } else {
        out.push(`Settings button: "${settingsBtn.textContent.replace(/\s+/g, ' ').trim()}" | ds=${settingsBtn.getAttribute('data-state')}`);

        // Use simulated real click (pointer events) like the extension
        simulateRealClick(settingsBtn);
        out.push('Simulated real click on settings button...');
        await sleep(2500);

        out.push(`Settings button after click: ds=${settingsBtn.getAttribute('data-state')}`);

        dumpButtons('BUTTONS AFTER SETTINGS OPENED');

        // Also check for popovers, radix content, etc.
        out.push('\n=== POPOVERS & DIALOGS ===');
        const popovers = document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"], [data-state="open"]');
        out.push(`Found ${popovers.length} popovers/dialogs`);
        for (const pop of popovers) {
            out.push(`  tag=${pop.tagName} role=${pop.getAttribute('role')} ds=${pop.getAttribute('data-state')} class=${(pop.className || '').substring(0, 80)}`);
            // Dump inner elements
            const inner = pop.querySelectorAll('button, [role="tab"], [role="radio"], [role="option"], label, span, div');
            for (const el of inner) {
                const rect = el.getBoundingClientRect();
                if (rect.height === 0) continue;
                const text = el.textContent.replace(/\s+/g, ' ').trim();
                if (text.length > 0 && text.length < 60 && el.children.length <= 2) {
                    out.push(`    ${el.tagName} "${text}" | role=${el.getAttribute('role') || ''} | ds=${el.getAttribute('data-state') || ''} | y=${Math.round(rect.y)}`);
                }
            }
        }

        // Check for ANY element with role=tab or role=radio on the page
        out.push('\n=== TAB/RADIO/TOGGLE ELEMENTS ===');
        const toggles = document.querySelectorAll('[role="tab"], [role="radio"], [role="switch"], [role="tablist"], [role="radiogroup"]');
        out.push(`Found ${toggles.length} tab/radio/toggle elements`);
        for (const t of toggles) {
            const rect = t.getBoundingClientRect();
            if (rect.height === 0) continue;
            const text = t.textContent.replace(/\s+/g, ' ').trim();
            out.push(`  ${t.tagName} "${text}" | role=${t.getAttribute('role')} | ds=${t.getAttribute('data-state') || ''} | aria-selected=${t.getAttribute('aria-selected') || ''}`);
        }

        // Close settings
        simulateRealClick(settingsBtn);
        await sleep(500);
    }

    const output = out.join('\n');
    try {
        await navigator.clipboard.writeText(output);
        console.log('✅ Copied to clipboard!');
    } catch (e) {
        console.log('⚠️ Could not copy — select text below:');
    }
    console.log(output);
    return output;
})();
