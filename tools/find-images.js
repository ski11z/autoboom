/**
 * PASTE THIS INTO DEVTOOLS CONSOLE ON THE FLOW PAGE (with generated images visible)
 * This will tell us what selector matches the generated images.
 */
(function () {
    console.log('═══ IMAGE ELEMENT DIAGNOSTIC ═══');

    // Check old selector
    const oldSelector = document.querySelectorAll('img[alt^="Flow Image:"]');
    console.log(`Old selector img[alt^="Flow Image:"]: ${oldSelector.length} matches`);

    // Find ALL images on the page
    const allImgs = document.querySelectorAll('img');
    console.log(`\nTotal <img> elements on page: ${allImgs.length}`);

    for (let i = 0; i < allImgs.length; i++) {
        const img = allImgs[i];
        const rect = img.getBoundingClientRect();
        // Only show images that are visible and reasonably sized (likely generated images)
        if (rect.width > 100 && rect.height > 100) {
            console.log(`\n--- Image ${i} (${rect.width}x${rect.height}) ---`);
            console.log(`  alt: "${img.alt}"`);
            console.log(`  src: ${img.src?.substring(0, 80)}...`);
            console.log(`  class: ${img.className?.substring(0, 60)}`);
            console.log(`  parent tag: ${img.parentElement?.tagName} class: ${img.parentElement?.className?.substring(0, 50)}`);
            console.log(`  data attrs:`, Object.keys(img.dataset).join(', ') || 'none');

            // Check for nearby "Add to Prompt" or menu buttons
            const container = img.closest('div[class]');
            if (container) {
                const btns = container.querySelectorAll('button');
                const btnTexts = Array.from(btns).map(b => b.textContent.replace(/\s+/g, ' ').trim().substring(0, 30));
                console.log(`  Container buttons (${btns.length}):`, btnTexts.join(' | '));
                console.log(`  Container class: ${container.className?.substring(0, 60)}`);
            }
        }
    }

    // Also check for any elements with role="img" or similar
    const roleImgs = document.querySelectorAll('[role="img"]');
    console.log(`\n[role="img"] elements: ${roleImgs.length}`);
    for (const el of roleImgs) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100) {
            console.log(`  ${el.tagName} ${el.className?.substring(0, 40)} alt="${el.getAttribute('aria-label') || el.alt || ''}" (${rect.width}x${rect.height})`);
        }
    }

    console.log('\n═══ END DIAGNOSTIC ═══');
})();
