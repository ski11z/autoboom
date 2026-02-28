/**
 * Run on: https://labs.google/fx/tools/flow (Dashboard page)
 * Finds the "+ New project" button and captures its HTML.
 */
(function () {
    const result = { url: location.href, buttons: [], links: [] };

    // Find ALL buttons
    document.querySelectorAll('button, a, [role="button"]').forEach(el => {
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (text.length > 0 && text.length < 100) {
            result.buttons.push({
                text,
                tag: el.tagName,
                html: el.outerHTML.substring(0, 300),
                href: el.getAttribute('href'),
                visible: el.offsetParent !== null,
            });
        }
    });

    // Find links with "new" or "create" in them
    document.querySelectorAll('a[href]').forEach(el => {
        const href = el.getAttribute('href') || '';
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (href.includes('new') || href.includes('create') || text.toLowerCase().includes('new')) {
            result.links.push({ text, href, html: el.outerHTML.substring(0, 300) });
        }
    });

    const json = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(json).then(() => console.log('✅ Copied!'));
    console.log(json);
})();
