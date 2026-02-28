/**
 * DIAGNOSTIC v2: Clicks the + button (text starts with "add") and dumps picker DOM
 * Run in DevTools Console on Flow page with generated images
 */
(async function () {
    console.log('═══ PICKER DIAGNOSTIC v2 ═══');

    // Find the + button (text starts with "add")
    const allBtns = document.querySelectorAll('button');
    let plusBtn = null;
    for (const btn of allBtns) {
        const rect = btn.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) continue;
        const text = btn.textContent.trim();
        if (text.startsWith('add') && rect.top > window.innerHeight * 0.5) {
            plusBtn = btn;
            console.log(`Found + button: text="${text}" at (${Math.round(rect.left)},${Math.round(rect.top)})`);
            break;
        }
    }

    if (!plusBtn) { console.error('+ button NOT found'); return; }

    // Click it
    console.log('Clicking + button...');
    plusBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    // Find the picker panel by looking for "Search for Assets" text
    console.log('\n--- Looking for picker panel ---');
    let pickerPanel = null;

    // Method: find any container that appeared with "Search for Assets" or "Recently Used"
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
        const el = walker.currentNode;
        const rect = el.getBoundingClientRect();
        if (rect.height < 100 || rect.width < 100) continue;

        const directText = Array.from(el.childNodes)
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .join('');

        if (el.textContent.includes('Search for Assets') && el.textContent.includes('Recently Used')) {
            // Check if this is a dialog/overlay (positioned, fixed, high z-index)
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'absolute' ||
                parseInt(style.zIndex) > 0 || el.getAttribute('role') === 'dialog') {
                pickerPanel = el;
                break;
            }
            // Also accept if it's a relatively small container
            if (rect.height < window.innerHeight * 0.8 && rect.width < window.innerWidth * 0.8) {
                pickerPanel = el;
            }
        }
    }

    if (!pickerPanel) {
        // Fallback: find the panel by looking for new visible overlays
        const overlays = document.querySelectorAll('[role="dialog"], [data-state="open"], [class*="popover"]');
        for (const ov of overlays) {
            if (ov.textContent.includes('Recently Used') && ov.getBoundingClientRect().height > 50) {
                pickerPanel = ov;
                break;
            }
        }
    }

    if (!pickerPanel) {
        console.error('Picker panel not found! Looking for ALL elements with "Recently Used":');
        document.querySelectorAll('*').forEach(el => {
            if (el.textContent.trim().startsWith('Recently Used') && el.children.length === 0) {
                console.log(`  "${el.textContent.trim()}" <${el.tagName}> class="${el.className?.substring(0, 40)}"`);
                // Log parent chain
                let p = el.parentElement;
                for (let i = 0; i < 5 && p; i++) {
                    console.log(`    ${'  '.repeat(i)}parent: <${p.tagName}> class="${p.className?.substring(0, 50)}" role="${p.getAttribute('role') || ''}" height=${Math.round(p.getBoundingClientRect().height)}`);
                    p = p.parentElement;
                }
            }
        });
        return;
    }

    console.log(`\nPicker panel: <${pickerPanel.tagName}> class="${pickerPanel.className?.substring(0, 60)}" role="${pickerPanel.getAttribute('role') || ''}"`);
    console.log(`Panel size: ${Math.round(pickerPanel.getBoundingClientRect().width)}x${Math.round(pickerPanel.getBoundingClientRect().height)}`);

    // List ALL children at first 3 levels
    console.log('\n--- Picker DOM tree (3 levels) ---');
    function dumpTree(el, depth) {
        if (depth > 3) return;
        const rect = el.getBoundingClientRect();
        if (rect.height === 0 && depth > 0) return;
        const indent = '  '.repeat(depth);
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const cls = el.className?.substring?.(0, 30) || '';
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
            ? `"${el.textContent.trim().substring(0, 40)}"` : '';
        console.log(`${indent}<${tag}> role="${role}" class="${cls}" ${text} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
        for (const child of el.children) {
            dumpTree(child, depth + 1);
        }
    }
    dumpTree(pickerPanel, 0);

    // Find the list items that represent assets
    console.log('\n--- Potential asset items to click ---');
    const allImgsInPicker = pickerPanel.querySelectorAll('img');
    console.log(`Images in picker: ${allImgsInPicker.length}`);
    for (const img of allImgsInPicker) {
        const rect = img.getBoundingClientRect();
        console.log(`  img: alt="${img.alt}" size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
        // Find clickable ancestor
        const clickAnc = img.closest('button, a, [role="option"], [tabindex], div[class]');
        if (clickAnc) {
            const cr = clickAnc.getBoundingClientRect();
            console.log(`    clickable ancestor: <${clickAnc.tagName}> class="${clickAnc.className?.substring(0, 50)}" role="${clickAnc.getAttribute('role') || ''}" text="${clickAnc.textContent.trim().substring(0, 40)}"`);
        }
    }

    console.log('\n═══ END DIAGNOSTIC v2 ═══');
})();
