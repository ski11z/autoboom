// Debug: Inspect "Add To Prompt" buttons and image card DOM structure
// Run this in console when you have 2+ generated images

(() => {
    const images = document.querySelectorAll('img[alt^="Flow Image:"]');
    console.log(`=== FOUND ${images.length} generated images ===`);

    images.forEach((img, i) => {
        console.log(`\n--- Image ${i} ---`);
        console.log('  img.alt:', img.alt);
        console.log('  img.parentElement:', img.parentElement?.tagName, img.parentElement?.className?.substring(0, 60));
        console.log('  img.parentElement.parentElement:', img.parentElement?.parentElement?.tagName, img.parentElement?.parentElement?.className?.substring(0, 60));

        const card = img.closest('[class*="sc-c6af9aa3"]');
        console.log('  closest sc-c6af9aa3:', card?.tagName, card?.className?.substring(0, 60));

        // Check if this card container has buttons
        if (card) {
            const btns = card.querySelectorAll('button');
            console.log(`  Buttons in card: ${btns.length}`);
            btns.forEach((btn, j) => {
                const text = btn.textContent.replace(/\s+/g, ' ').trim();
                if (text.includes('Add To Prompt') || text.includes('Remove') || text.includes('Reuse') || text.includes('prompt')) {
                    console.log(`    Button ${j}: "${text}" visible=${btn.offsetParent !== null}`);
                }
            });
        }
    });

    // Also find ALL "Add To Prompt" buttons globally
    console.log('\n=== ALL "Add To Prompt" buttons on page ===');
    const allBtns = document.querySelectorAll('button');
    let addBtnCount = 0;
    allBtns.forEach((btn, i) => {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        if (text.includes('Add To Prompt') || text.includes('Remove From Prompt')) {
            addBtnCount++;
            const rect = btn.getBoundingClientRect();
            console.log(`  Button: "${text}" | visible=${btn.offsetParent !== null} | y=${Math.round(rect.y)} | parent=${btn.parentElement?.className?.substring(0, 40)}`);
        }
    });
    console.log(`Total Add/Remove buttons: ${addBtnCount}`);

    // Copy result to clipboard for easy sharing
    console.log('\n=== DONE — share this output ===');
})();
