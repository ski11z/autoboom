/**
 * AutoBoom Diagnostic — Settings Popover & Add To Prompt Inspector
 * 
 * Run this in the Chrome DevTools console on the Flow editor page.
 * It will:
 * 1. Click the Settings button to open the popover
 * 2. Capture all the elements inside the popover
 * 3. Also inspect the generated images for hover/overlay buttons
 * 
 * The results are copied to your clipboard automatically.
 */

(async function inspectSettingsAndAddToPrompt() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const result = { settings: {}, images: {}, addToPrompt: {} };

    // ─── 1. Find and click the Settings button ───
    console.log('🔍 Step 1: Looking for Settings button...');
    let settingsBtn = null;
    const allButtons = document.querySelectorAll('button');

    for (const btn of allButtons) {
        const text = btn.textContent.replace(/\s+/g, ' ').trim();
        if (text.includes('tune') || text.toLowerCase().includes('settings')) {
            settingsBtn = btn;
            console.log('  Found Settings button:', text, btn.outerHTML.substring(0, 200));
            break;
        }
    }

    if (!settingsBtn) {
        console.log('  ❌ Settings button NOT found by text. Trying aria-label...');
        settingsBtn = document.querySelector('button[aria-haspopup="dialog"]');
        if (settingsBtn) {
            console.log('  Found by aria-haspopup:', settingsBtn.outerHTML.substring(0, 200));
        }
    }

    if (settingsBtn) {
        result.settings.buttonHTML = settingsBtn.outerHTML.substring(0, 300);

        // Click to open
        settingsBtn.click();
        await sleep(1500);
        console.log('  ✅ Clicked Settings button, waiting for popover...');

        // ─── 2. Capture popover contents ───
        // Look for popover/dialog elements
        const popovers = document.querySelectorAll('[role="dialog"], [data-state="open"], [data-radix-popper-content-wrapper]');
        console.log(`  Found ${popovers.length} popovers/dialogs`);

        result.settings.popovers = [];
        for (const pop of popovers) {
            const popInfo = {
                tag: pop.tagName,
                role: pop.getAttribute('role'),
                dataState: pop.getAttribute('data-state'),
                classes: pop.className.substring(0, 100),
                innerHTML: pop.innerHTML.substring(0, 2000),
                // Find all interactive elements inside
                selects: [],
                labels: [],
            };

            // Find dropdown triggers inside
            const triggers = pop.querySelectorAll('button, [role="combobox"], select, [role="listbox"]');
            for (const t of triggers) {
                popInfo.selects.push({
                    tag: t.tagName,
                    role: t.getAttribute('role'),
                    text: t.textContent.replace(/\s+/g, ' ').trim().substring(0, 100),
                    html: t.outerHTML.substring(0, 300),
                    dataState: t.getAttribute('data-state'),
                    ariaExpanded: t.getAttribute('aria-expanded'),
                });
            }

            // Find labels
            const labels = pop.querySelectorAll('label, [class*="label"], span, div');
            for (const l of labels) {
                if (l.children.length === 0 && l.textContent.trim().length > 0 && l.textContent.trim().length < 50) {
                    popInfo.labels.push({
                        text: l.textContent.trim(),
                        tag: l.tagName,
                        class: l.className.substring(0, 100),
                    });
                }
            }

            result.settings.popovers.push(popInfo);
        }

        // ─── 3. Try clicking the Aspect Ratio dropdown ───
        console.log('🔍 Step 2: Looking for Aspect Ratio dropdown...');
        const aspectLabels = [...document.querySelectorAll('*')].filter(el =>
            el.children.length === 0 && el.textContent.trim() === 'Aspect Ratio'
        );

        if (aspectLabels.length > 0) {
            const aspectLabel = aspectLabels[0];
            console.log('  Found Aspect Ratio label:', aspectLabel.tagName, aspectLabel.className);

            // Try to find the dropdown next to it
            const parentContainer = aspectLabel.closest('[class*="sc-"]') || aspectLabel.parentElement;
            console.log('  Parent container:', parentContainer?.tagName, parentContainer?.className?.substring(0, 100));

            // Look for button/trigger in parent or siblings
            const nearbyBtn = parentContainer?.querySelector('button') || parentContainer?.parentElement?.querySelector('button');
            if (nearbyBtn) {
                result.settings.aspectRatioDropdown = {
                    text: nearbyBtn.textContent.replace(/\s+/g, ' ').trim(),
                    html: nearbyBtn.outerHTML.substring(0, 300),
                    role: nearbyBtn.getAttribute('role'),
                };

                // Click it to see options
                nearbyBtn.click();
                await sleep(800);

                // Capture all visible options
                const options = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [data-radix-collection-item]');
                result.settings.aspectRatioOptions = [];
                for (const opt of options) {
                    result.settings.aspectRatioOptions.push({
                        text: opt.textContent.replace(/\s+/g, ' ').trim(),
                        html: opt.outerHTML.substring(0, 300),
                        role: opt.getAttribute('role'),
                        dataState: opt.getAttribute('data-state'),
                    });
                }
                console.log(`  Found ${options.length} aspect ratio options`);

                // Close dropdown
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await sleep(500);
            }
        } else {
            console.log('  ❌ "Aspect Ratio" label not found');
        }

        // ─── 4. Try the Outputs dropdown ───
        console.log('🔍 Step 3: Looking for Outputs per prompt dropdown...');
        const outputLabels = [...document.querySelectorAll('*')].filter(el =>
            el.children.length === 0 && el.textContent.trim().includes('Outputs')
        );

        if (outputLabels.length > 0) {
            const outputLabel = outputLabels[0];
            console.log('  Found Outputs label:', outputLabel.textContent.trim());

            const parentContainer = outputLabel.closest('[class*="sc-"]') || outputLabel.parentElement;
            const nearbyBtn = parentContainer?.querySelector('button') || parentContainer?.parentElement?.querySelector('button');
            if (nearbyBtn) {
                result.settings.outputsDropdown = {
                    text: nearbyBtn.textContent.replace(/\s+/g, ' ').trim(),
                    html: nearbyBtn.outerHTML.substring(0, 300),
                };

                nearbyBtn.click();
                await sleep(800);

                const options = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [data-radix-collection-item]');
                result.settings.outputsOptions = [];
                for (const opt of options) {
                    result.settings.outputsOptions.push({
                        text: opt.textContent.replace(/\s+/g, ' ').trim(),
                        html: opt.outerHTML.substring(0, 300),
                    });
                }
                console.log(`  Found ${options.length} output options`);

                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await sleep(500);
            }
        }

        // Close settings popover
        settingsBtn.click();
        await sleep(500);
    }

    // ─── 5. Inspect generated images ───
    console.log('🔍 Step 4: Looking for generated images...');
    const allImages = document.querySelectorAll('img');
    const genImages = [...allImages].filter(img => {
        const alt = img.alt || '';
        const w = parseInt(img.width || img.naturalWidth || 0);
        return !alt.includes('Logo') && !alt.includes('profile') && w > 100;
    });

    result.images.count = genImages.length;
    result.images.list = genImages.map((img, i) => ({
        index: i,
        src: (img.src || '').substring(0, 150),
        alt: img.alt,
        width: img.width,
        height: img.height,
        parentHTML: img.parentElement?.outerHTML?.substring(0, 300),
        parentClass: img.parentElement?.className?.substring(0, 100),
        grandparentClass: img.parentElement?.parentElement?.className?.substring(0, 100),
    }));

    // ─── 6. Try hovering an image to find Add To Prompt ───
    if (genImages.length > 0) {
        console.log('🔍 Step 5: Hovering first generated image to find Add To Prompt...');
        const firstImg = genImages[0];

        // Trigger hover events
        firstImg.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        firstImg.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        firstImg.parentElement?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        firstImg.parentElement?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        firstImg.parentElement?.parentElement?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        firstImg.parentElement?.parentElement?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        await sleep(1500);

        // Look for "Add To Prompt" button anywhere on page
        const addBtns = [...document.querySelectorAll('button, a, [role="button"]')].filter(el => {
            const text = el.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
            return text.includes('add to prompt') || text.includes('add to');
        });

        result.addToPrompt.buttons = addBtns.map(btn => ({
            text: btn.textContent.replace(/\s+/g, ' ').trim(),
            html: btn.outerHTML.substring(0, 400),
            visible: btn.offsetParent !== null,
            classes: btn.className.substring(0, 100),
            ariaLabel: btn.getAttribute('aria-label'),
        }));

        console.log(`  Found ${addBtns.length} "Add To Prompt" button(s)`);

        // Also check for any overlay/popover that appeared
        const overlays = document.querySelectorAll('[class*="overlay" i], [class*="hover" i], [class*="action" i]');
        result.addToPrompt.overlays = [...overlays].slice(0, 5).map(o => ({
            tag: o.tagName,
            class: o.className.substring(0, 100),
            visible: o.offsetParent !== null,
            childButtons: [...o.querySelectorAll('button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).slice(0, 5),
        }));
    }

    // ─── Output ───
    const jsonStr = JSON.stringify(result, null, 2);

    try {
        await navigator.clipboard.writeText(jsonStr);
        console.log('✅ Results copied to clipboard!');
    } catch (e) {
        console.log('⚠️ Could not copy to clipboard. Select and copy the JSON below:');
    }

    console.log('📋 FULL RESULTS:');
    console.log(jsonStr);

    return result;
})();
