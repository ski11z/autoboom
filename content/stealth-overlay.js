/**
 * AutoBoom — Stealth Overlay
 * Injects a beautiful full-screen overlay on the Flow page to hide
 * all automation activity. Shows branded progress UI with real-time updates.
 */

const AB_StealthOverlay = (() => {
    const OVERLAY_ID = 'ab-stealth-overlay';
    let _overlayEl = null;

    /**
     * Show the stealth overlay on the page.
     */
    function show() {
        if (_overlayEl) return; // Already visible

        _overlayEl = document.createElement('div');
        _overlayEl.id = OVERLAY_ID;
        _overlayEl.innerHTML = _buildHTML();
        document.body.appendChild(_overlayEl);

        // Inject styles
        if (!document.getElementById('ab-stealth-styles')) {
            const style = document.createElement('style');
            style.id = 'ab-stealth-styles';
            style.textContent = _buildCSS();
            document.head.appendChild(style);
        }

        // Start ambient animation
        requestAnimationFrame(() => {
            _overlayEl.classList.add('ab-stealth-visible');
        });
    }

    /**
     * Hide and remove the overlay.
     */
    function hide() {
        if (!_overlayEl) return;

        _overlayEl.classList.remove('ab-stealth-visible');
        _overlayEl.classList.add('ab-stealth-hiding');

        setTimeout(() => {
            _overlayEl?.remove();
            _overlayEl = null;
        }, 500);
    }

    /**
     * Update the overlay progress display.
     * @param {Object} data - { phase, step, progress, current, total, status }
     */
    function updateProgress(data = {}) {
        if (!_overlayEl) return;

        const phaseEl = _overlayEl.querySelector('.ab-s-phase');
        const stepEl = _overlayEl.querySelector('.ab-s-step');
        const barEl = _overlayEl.querySelector('.ab-s-bar-fill');
        const pctEl = _overlayEl.querySelector('.ab-s-pct');
        const counterEl = _overlayEl.querySelector('.ab-s-counter');
        const statusEl = _overlayEl.querySelector('.ab-s-status');

        if (data.phase && phaseEl) {
            const phaseLabels = {
                'images': '🖼️ Image Generation',
                'videos': '🎬 Video Generation',
                'settings': '⚙️ Configuring Settings',
                'navigation': '🧭 Navigating',
                'complete': '✅ Complete',
                'error': '❌ Error',
            };
            phaseEl.textContent = phaseLabels[data.phase] || data.phase;

            // Update phase indicator dots
            _overlayEl.querySelectorAll('.ab-s-phase-dot').forEach(dot => {
                dot.classList.remove('active', 'done');
            });
            const dots = _overlayEl.querySelectorAll('.ab-s-phase-dot');
            if (data.phase === 'settings' || data.phase === 'navigation') {
                dots[0]?.classList.add('active');
            } else if (data.phase === 'images') {
                dots[0]?.classList.add('done');
                dots[1]?.classList.add('active');
            } else if (data.phase === 'videos') {
                dots[0]?.classList.add('done');
                dots[1]?.classList.add('done');
                dots[2]?.classList.add('active');
            } else if (data.phase === 'complete') {
                dots.forEach(d => d.classList.add('done'));
            }
        }

        if (data.step && stepEl) {
            stepEl.textContent = data.step;
        }

        if (data.progress !== undefined && barEl) {
            const pct = Math.min(100, Math.max(0, data.progress));
            barEl.style.width = `${pct}%`;
            if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
        }

        if (data.current !== undefined && data.total !== undefined && counterEl) {
            counterEl.textContent = `${data.current} / ${data.total}`;
        }

        if (data.status && statusEl) {
            statusEl.textContent = data.status;
        }
    }

    function _buildHTML() {
        return `
            <div class="ab-s-backdrop"></div>
            <div class="ab-s-content">
                <div class="ab-s-glow"></div>
                <div class="ab-s-header">
                    <div class="ab-s-logo">
                        <span class="ab-s-logo-icon">🚀</span>
                        <span class="ab-s-logo-text">AutoBoom</span>
                    </div>
                    <div class="ab-s-badge">STEALTH MODE</div>
                </div>

                <div class="ab-s-phase-track">
                    <div class="ab-s-phase-dot" data-label="Setup">
                        <span class="ab-s-dot-inner"></span>
                    </div>
                    <div class="ab-s-phase-line"></div>
                    <div class="ab-s-phase-dot" data-label="Images">
                        <span class="ab-s-dot-inner"></span>
                    </div>
                    <div class="ab-s-phase-line"></div>
                    <div class="ab-s-phase-dot" data-label="Videos">
                        <span class="ab-s-dot-inner"></span>
                    </div>
                </div>

                <div class="ab-s-main">
                    <div class="ab-s-phase">⚙️ Initializing...</div>
                    <div class="ab-s-step">Preparing workspace</div>
                    <div class="ab-s-bar-container">
                        <div class="ab-s-bar-bg">
                            <div class="ab-s-bar-fill"></div>
                        </div>
                        <div class="ab-s-bar-info">
                            <span class="ab-s-pct">0%</span>
                            <span class="ab-s-counter">— / —</span>
                        </div>
                    </div>
                    <div class="ab-s-status">Working in the background...</div>
                </div>

                <div class="ab-s-footer">
                    <div class="ab-s-pulse"></div>
                    <span>Automation is running — do not close this tab</span>
                </div>
            </div>
        `;
    }

    function _buildCSS() {
        return `
            #${OVERLAY_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.5s ease;
                font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
                pointer-events: all;
            }
            #${OVERLAY_ID}.ab-stealth-visible { opacity: 1; }
            #${OVERLAY_ID}.ab-stealth-hiding { opacity: 0; }

            .ab-s-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.88);
                backdrop-filter: blur(24px) saturate(120%);
                -webkit-backdrop-filter: blur(24px) saturate(120%);
            }

            .ab-s-content {
                position: relative;
                width: 420px;
                max-width: 90vw;
                background: linear-gradient(145deg, rgba(20, 20, 35, 0.95), rgba(12, 12, 24, 0.98));
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 24px;
                padding: 36px 32px;
                box-shadow:
                    0 0 0 1px rgba(255, 255, 255, 0.04),
                    0 24px 80px rgba(0, 0, 0, 0.6),
                    0 0 120px rgba(99, 102, 241, 0.08);
                overflow: hidden;
            }

            .ab-s-glow {
                position: absolute;
                top: -60%;
                left: -30%;
                width: 160%;
                height: 160%;
                background: radial-gradient(ellipse, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
                animation: ab-s-glow-pulse 4s ease-in-out infinite;
                pointer-events: none;
            }
            @keyframes ab-s-glow-pulse {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.1); }
            }

            .ab-s-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 28px;
                position: relative;
            }
            .ab-s-logo {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .ab-s-logo-icon {
                font-size: 28px;
                filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.5));
            }
            .ab-s-logo-text {
                font-size: 22px;
                font-weight: 700;
                background: linear-gradient(135deg, #fff 30%, #a5b4fc);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                letter-spacing: -0.3px;
            }
            .ab-s-badge {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 1.5px;
                color: rgba(165, 180, 252, 0.7);
                background: rgba(99, 102, 241, 0.12);
                border: 1px solid rgba(99, 102, 241, 0.2);
                padding: 4px 10px;
                border-radius: 20px;
            }

            /* Phase Track */
            .ab-s-phase-track {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0;
                margin-bottom: 32px;
                position: relative;
            }
            .ab-s-phase-dot {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                position: relative;
            }
            .ab-s-dot-inner {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.15);
                transition: all 0.4s ease;
            }
            .ab-s-phase-dot.active .ab-s-dot-inner {
                background: #6366f1;
                border-color: #818cf8;
                box-shadow: 0 0 12px rgba(99, 102, 241, 0.6);
                animation: ab-s-dot-pulse 1.5s ease-in-out infinite;
            }
            .ab-s-phase-dot.done .ab-s-dot-inner {
                background: #22c55e;
                border-color: #4ade80;
                box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
            }
            @keyframes ab-s-dot-pulse {
                0%, 100% { box-shadow: 0 0 12px rgba(99, 102, 241, 0.6); }
                50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.9); }
            }
            .ab-s-phase-dot::after {
                content: attr(data-label);
                font-size: 10px;
                color: rgba(255, 255, 255, 0.35);
                font-weight: 500;
                letter-spacing: 0.5px;
            }
            .ab-s-phase-dot.active::after { color: rgba(165, 180, 252, 0.9); }
            .ab-s-phase-dot.done::after { color: rgba(74, 222, 128, 0.8); }

            .ab-s-phase-line {
                flex: 1;
                height: 2px;
                background: rgba(255, 255, 255, 0.08);
                margin: 0 12px;
                margin-bottom: 22px;
                border-radius: 1px;
            }

            /* Main Content */
            .ab-s-main {
                text-align: center;
                position: relative;
            }
            .ab-s-phase {
                font-size: 18px;
                font-weight: 600;
                color: #e2e8f0;
                margin-bottom: 6px;
            }
            .ab-s-step {
                font-size: 13px;
                color: rgba(148, 163, 184, 0.8);
                margin-bottom: 24px;
                min-height: 18px;
            }

            /* Progress Bar */
            .ab-s-bar-container {
                margin-bottom: 20px;
            }
            .ab-s-bar-bg {
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.06);
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            }
            .ab-s-bar-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #6366f1, #818cf8, #a78bfa);
                border-radius: 4px;
                transition: width 0.6s ease;
                position: relative;
            }
            .ab-s-bar-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(
                    90deg,
                    transparent 0%,
                    rgba(255, 255, 255, 0.2) 50%,
                    transparent 100%
                );
                animation: ab-s-shimmer 2s ease-in-out infinite;
            }
            @keyframes ab-s-shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            .ab-s-bar-info {
                display: flex;
                justify-content: space-between;
                margin-top: 8px;
                font-size: 12px;
            }
            .ab-s-pct {
                color: #a5b4fc;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
            }
            .ab-s-counter {
                color: rgba(148, 163, 184, 0.6);
                font-variant-numeric: tabular-nums;
            }

            .ab-s-status {
                font-size: 12px;
                color: rgba(148, 163, 184, 0.5);
                font-style: italic;
            }

            /* Footer */
            .ab-s-footer {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                margin-top: 28px;
                padding-top: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                font-size: 11px;
                color: rgba(148, 163, 184, 0.4);
            }
            .ab-s-pulse {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #22c55e;
                box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
                animation: ab-s-alive 2s ease-in-out infinite;
            }
            @keyframes ab-s-alive {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
        `;
    }

    return { show, hide, updateProgress };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_StealthOverlay = AB_StealthOverlay;
}
