/**
 * AutoBoom — Popup Navigation
 * Domain gating, home-screen card routing, standalone view management.
 */
const AB_PopupNavigation = (() => {
    const TARGET_URL = 'https://labs.google/fx/tools/flow';
    const WHITELISTED_DOMAINS = [
        'checkout.stripe.com',
        'billing.stripe.com',
        'mail.google.com',
        'accounts.google.com',
    ];
    let _initialized = false;

    // Called by the main popup.js to register the initializer callback
    let _onFirstInit = null;
    function setInitCallback(cb) { _onFirstInit = cb; }

    async function checkDomainGate() {
        let onTargetPage = false;
        let onWhitelistedPage = false;
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                if (tab.url.startsWith(TARGET_URL)) {
                    onTargetPage = true;
                } else {
                    try {
                        const url = new URL(tab.url);
                        onWhitelistedPage = WHITELISTED_DOMAINS.includes(url.hostname);
                    } catch { /* invalid URL */ }
                }
            }
        } catch (e) {
            console.warn('Could not query active tab:', e);
        }

        const overlay = document.getElementById('wrong-domain-overlay');
        const container = document.querySelector('.popup-container');

        if (!onTargetPage && !onWhitelistedPage) {
            overlay.classList.remove('hidden');
            container.classList.add('hidden');
            return;
        }

        overlay.classList.add('hidden');
        container.classList.remove('hidden');

        if (!_initialized && onTargetPage) {
            _initialized = true;
            if (_onFirstInit) _onFirstInit();
        }
    }

    // "Open Google Flow" button — wired once at module load (lives on wrong-domain overlay)
    document.getElementById('btn-go-to-flow')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-go-to-flow');
        const originalHTML = btn.innerHTML;

        // Show loading state
        btn.classList.add('btn-go-flow-loading');
        btn.innerHTML = '<span class="btn-go-flow-spinner"></span> Loading...';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.update(tab.id, { url: 'https://labs.google/fx/tools/flow' });
                // Wait for the tab to finish loading Flow, then recheck domain gate
                chrome.tabs.onUpdated.addListener(function onNav(tabId, changeInfo) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(onNav);
                        checkDomainGate();
                    }
                });
            }
        } catch (e) {
            // Restore button on error
            btn.classList.remove('btn-go-flow-loading');
            btn.innerHTML = originalHTML;
        }
    });

    function initTabs() {
        // Mode pill selection (toggle active state + update model visibility)
        document.querySelectorAll('.mode-pill:not([disabled])').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                _updateModelVisibility();
            });
        });

        // Continue button — open the selected mode view
        document.getElementById('btn-home-continue')?.addEventListener('click', () => {
            const activePill = document.querySelector('.mode-pill.active');
            if (!activePill) return;
            const mode = activePill.dataset.mode;
            if (mode === 'frames-to-video') {
                showStandaloneView('view-f2v');
            } else if (mode === 'text-to-video') {
                showStandaloneView('view-t2v');
            } else if (mode === 'create-image') {
                showStandaloneView('view-create-image');
            }
        });

        // More Settings toggle
        document.getElementById('btn-more-settings')?.addEventListener('click', () => {
            const wrapper = document.querySelector('.more-settings');
            const body = document.getElementById('more-settings-body');
            const isOpen = !body.classList.contains('hidden');
            if (isOpen) {
                body.classList.add('hidden');
                wrapper.classList.remove('open');
            } else {
                body.classList.remove('hidden');
                wrapper.classList.add('open');
                _updateModelVisibility();
            }
        });

        // Populate model dropdowns from constants (single source of truth)
        _populateModelDropdowns();

        // Initialize model visibility based on default pill
        _updateModelVisibility();

        // Back to home buttons
        document.querySelectorAll('.standalone-back').forEach(btn => {
            btn.addEventListener('click', () => returnToHome());
        });

        // Manage links
        document.getElementById('link-saved-projects')?.addEventListener('click', () => {
            showStandaloneView('view-saved-projects');
            AB_PopupProjects.loadSavedProjects();
        });
        document.getElementById('link-history')?.addEventListener('click', () => {
            showStandaloneView('view-history');
            AB_PopupProjects.loadRunHistory();
        });
        document.getElementById('link-batch')?.addEventListener('click', () => {
            showStandaloneView('view-batch');
            AB_PopupProjects.loadBatchQueue();
        });

        // Settings button
        document.getElementById('btn-settings')?.addEventListener('click', () => {
            showStandaloneView('view-settings');
        });

        // Help Center button
        document.getElementById('btn-help')?.addEventListener('click', () => {
            showStandaloneView('view-help');
        });
    }

    /**
     * Populate the Image Model and Video Model <select> dropdowns
     * from AB_CONSTANTS.IMAGE_MODELS / VIDEO_MODELS.
     */
    function _populateModelDropdowns() {
        const imgSelect = document.getElementById('home-image-model');
        const vidSelect = document.getElementById('home-video-model');

        if (imgSelect && imgSelect.options.length === 0) {
            AB_CONSTANTS.IMAGE_MODELS.forEach((m, i) => {
                const opt = new Option(m.label, m.value, i === 0, i === 0);
                imgSelect.add(opt);
            });
        }

        if (vidSelect && vidSelect.options.length === 0) {
            AB_CONSTANTS.VIDEO_MODELS.forEach((m, i) => {
                const opt = new Option(m.label, m.value, i === 0, i === 0);
                vidSelect.add(opt);
            });
        }
    }

    /**
     * Show/hide Image Model vs Video Model based on the active mode pill.
     * - Create Image → show Image Model only
     * - Text to Video / Frames to Video → show Video Model only
     * - No mode or I2V → hide both
     */
    function _updateModelVisibility() {
        const activePill = document.querySelector('.mode-pill.active');
        const mode = activePill?.dataset.mode || '';
        const imageField = document.getElementById('field-image-model');
        const videoField = document.getElementById('field-video-model');
        if (!imageField || !videoField) return;

        if (mode === 'create-image') {
            imageField.classList.remove('hidden');
            videoField.classList.add('hidden');
        } else if (mode === 'text-to-video' || mode === 'frames-to-video') {
            imageField.classList.add('hidden');
            videoField.classList.remove('hidden');
        } else {
            imageField.classList.add('hidden');
            videoField.classList.add('hidden');
        }
    }

    function returnToHome() {
        document.querySelectorAll('.standalone-view').forEach(v => v.classList.add('hidden'));
        document.getElementById('home-screen').classList.remove('hidden');
    }

    function showStandaloneView(viewId) {
        document.getElementById('home-screen').classList.add('hidden');
        document.querySelectorAll('.standalone-view').forEach(v => v.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
    }

    function showF2VProgress() {
        document.getElementById('f2v-project-form')?.classList.add('hidden');
        document.getElementById('f2v-progress-section')?.classList.remove('hidden');
    }

    function showF2VProject() {
        document.getElementById('f2v-progress-section')?.classList.add('hidden');
        document.getElementById('f2v-project-form')?.classList.remove('hidden');
    }

    return {
        setInitCallback,
        checkDomainGate,
        initTabs,
        returnToHome,
        showStandaloneView,
        showF2VProgress,
        showF2VProject,
    };
})();
