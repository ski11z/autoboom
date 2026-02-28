// Diagnostic: Inspect Videos/Images tabs and "Frames to Video" dropdown
// Run this on a Flow project page that has generated images

(() => {
    console.log('=== TAB BUTTONS (Videos / Images) ===');
    // Look for tab-like buttons
    document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        if (text.includes('Videos') || text.includes('Images') || text.includes('Video') || text.includes('Image')) {
            const rect = btn.getBoundingClientRect();
            console.log(`  Button: "${text}" | tag=${btn.tagName} | role=${btn.getAttribute('role')} | aria-selected=${btn.getAttribute('aria-selected')} | y=${Math.round(rect.y)} | class=${btn.className?.substring(0, 50)}`);
        }
    });

    // Check for tab roles
    console.log('\n=== ELEMENTS WITH role="tab" ===');
    document.querySelectorAll('[role="tab"]').forEach(el => {
        console.log(`  Tab: "${el.textContent.trim()}" | tag=${el.tagName} | aria-selected=${el.getAttribute('aria-selected')} | class=${el.className?.substring(0, 50)}`);
    });

    // Check for tab list
    console.log('\n=== ELEMENTS WITH role="tablist" ===');
    document.querySelectorAll('[role="tablist"]').forEach(el => {
        console.log(`  TabList: children=${el.children.length} | class=${el.className?.substring(0, 50)}`);
        Array.from(el.children).forEach(child => {
            console.log(`    Child: "${child.textContent.trim()}" | tag=${child.tagName} | role=${child.getAttribute('role')}`);
        });
    });

    console.log('\n=== "Create Image" / "Frames to Video" DROPDOWN ===');
    // Look for dropdown or select elements related to creation mode
    document.querySelectorAll('button, [role="combobox"], [role="listbox"], [role="menuitem"]').forEach(el => {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text.includes('Create') || text.includes('Frames') || text.includes('Text to Video') || text.includes('Ingredients')) {
            const rect = el.getBoundingClientRect();
            console.log(`  Element: "${text.substring(0, 60)}" | tag=${el.tagName} | role=${el.getAttribute('role')} | y=${Math.round(rect.y)} | class=${el.className?.substring(0, 50)}`);
        }
    });

    // Look for the specific dropdown trigger (usually near prompt area)
    console.log('\n=== PROMPT AREA BUTTONS ===');
    const promptArea = document.querySelector('textarea, [contenteditable="true"]');
    if (promptArea) {
        const parent = promptArea.closest('form') || promptArea.parentElement?.parentElement?.parentElement;
        if (parent) {
            parent.querySelectorAll('button').forEach(btn => {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                const rect = btn.getBoundingClientRect();
                console.log(`  Prompt-area button: "${text.substring(0, 50)}" | y=${Math.round(rect.y)} | class=${btn.className?.substring(0, 40)}`);
            });
        }
    }

    console.log('\n=== DONE ===');
})();
