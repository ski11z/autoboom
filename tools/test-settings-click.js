/**
 * Run on: Flow EDITOR page (with a project open)
 * Opens Settings, clicks the Aspect Ratio combobox, and captures 
 * EVERYTHING that appears (listbox, options, portals).
 */
(async function () {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const result = {};

    // Step 1: Open Settings
    const settingsBtn = document.querySelector('button[aria-haspopup="dialog"]');
    if (!settingsBtn) { console.log('❌ No settings button'); return; }
    settingsBtn.click();
    await sleep(1500);
    console.log('✅ Settings opened');

    // Step 2: Find the dialog and comboboxes
    const dialog = document.querySelector('div.PopoverContent, [role="dialog"]');
    if (!dialog) { console.log('❌ No dialog found'); return; }

    const combos = dialog.querySelectorAll('button[role="combobox"]');
    console.log(`Found ${combos.length} comboboxes`);

    // Find Aspect Ratio combo
    let aspectCombo = null;
    for (const c of combos) {
        if (c.textContent.includes('Aspect Ratio')) { aspectCombo = c; break; }
    }

    if (!aspectCombo) { console.log('❌ No Aspect Ratio combobox'); return; }

    // Step 3: Click it!
    console.log('Clicking Aspect Ratio combobox...');
    aspectCombo.click();
    await sleep(1000);

    // Step 4: Capture EVERYTHING that appeared
    // Check for listbox
    const listboxes = document.querySelectorAll('[role="listbox"]');
    result.listboxCount = listboxes.length;
    result.listboxes = [...listboxes].map(lb => ({
        html: lb.innerHTML.substring(0, 2000),
        children: lb.children.length,
    }));

    // Check for options
    const options = document.querySelectorAll('[role="option"]');
    result.optionCount = options.length;
    result.options = [...options].map(o => ({
        text: o.textContent.replace(/\s+/g, ' ').trim(),
        html: o.outerHTML.substring(0, 300),
        dataValue: o.getAttribute('data-value'),
        ariaSelected: o.getAttribute('aria-selected'),
    }));

    // Check for any new portals/popovers that appeared
    const portals = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    result.portalCount = portals.length;
    result.portals = [...portals].map(p => ({
        html: p.innerHTML.substring(0, 2000),
    }));

    // Check for select content
    const selectContents = document.querySelectorAll('[role="listbox"], [data-radix-select-viewport]');
    result.selectViewportCount = selectContents.length;
    result.selectViewports = [...selectContents].map(v => ({
        html: v.innerHTML.substring(0, 2000),
        role: v.getAttribute('role'),
    }));

    // Also check aria-controls of the combobox — what ID did it reference?
    const controlsId = aspectCombo.getAttribute('aria-controls');
    result.ariaControls = controlsId;
    const controlledEl = controlsId ? document.getElementById(controlsId) : null;
    result.controlledElement = controlledEl ? {
        tag: controlledEl.tagName,
        role: controlledEl.getAttribute('role'),
        html: controlledEl.innerHTML.substring(0, 2000),
        childCount: controlledEl.children.length,
    } : 'NOT FOUND';

    // Step 5: Now check expanded state
    result.comboExpanded = aspectCombo.getAttribute('aria-expanded');
    result.comboState = aspectCombo.getAttribute('data-state');

    // Close
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
    settingsBtn.click();

    const json = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(json).then(() => console.log('✅ Results copied!'));
    console.log('📋 RESULTS:');
    console.log(json);
})();
