/**
 * Run when Settings popover is ALREADY OPEN.
 * Clicks the Outputs per prompt combobox and captures everything.
 */
(async function () {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const result = {};

    // Find the Outputs combobox by looking at all comboboxes
    const combos = document.querySelectorAll('button[role="combobox"]');
    console.log(`Found ${combos.length} comboboxes total`);

    let outputsCombo = null;
    for (const c of combos) {
        const text = c.textContent.replace(/\s+/g, ' ').trim();
        console.log(`  Combobox text: "${text}"`);
        if (text.includes('Outputs') || text.includes('output')) {
            outputsCombo = c;
        }
    }

    if (!outputsCombo) {
        console.log('❌ No Outputs combobox found. Is Settings popover open?');
        return;
    }

    result.comboText = outputsCombo.textContent.replace(/\s+/g, ' ').trim();
    result.ariaControls = outputsCombo.getAttribute('aria-controls');
    result.ariaExpanded = outputsCombo.getAttribute('aria-expanded');
    result.dataState = outputsCombo.getAttribute('data-state');
    result.comboHTML = outputsCombo.outerHTML.substring(0, 500);
    result.comboClass = outputsCombo.className;

    console.log('Clicking Outputs combobox...');
    outputsCombo.click();
    await sleep(1500);

    // After click - check state
    result.afterAriaExpanded = outputsCombo.getAttribute('aria-expanded');
    result.afterDataState = outputsCombo.getAttribute('data-state');

    // Check: controlled element by aria-controls
    const controlsId = outputsCombo.getAttribute('aria-controls');
    const controlled = controlsId ? document.getElementById(controlsId) : null;
    result.controlledElement = controlled ? {
        tag: controlled.tagName,
        role: controlled.getAttribute('role'),
        childCount: controlled.children.length,
        html: controlled.innerHTML.substring(0, 2000),
    } : 'NOT FOUND (id: ' + controlsId + ')';

    // Check: any new listboxes
    const listboxes = document.querySelectorAll('[role="listbox"]');
    result.listboxCount = listboxes.length;
    result.listboxes = [...listboxes].map(lb => ({
        id: lb.id,
        childCount: lb.children.length,
        html: lb.innerHTML.substring(0, 1500),
    }));

    // Check: any options
    const options = document.querySelectorAll('[role="option"]');
    result.optionCount = options.length;
    result.options = [...options].map(o => ({
        text: o.textContent.replace(/\s+/g, ' ').trim(),
        html: o.outerHTML.substring(0, 300),
    }));

    // Check: any menus
    const menus = document.querySelectorAll('[role="menu"], [role="menuitem"]');
    result.menuCount = menus.length;

    // Check ALL portals
    const portals = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    result.portalCount = portals.length;

    // Close
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const json = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(json).then(() => console.log('✅ Copied!')).catch(() => { });
    console.log('📋 OUTPUTS RESULT:');
    console.log(json);
})();
