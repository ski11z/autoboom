/**
 * AutoBoom — CI Form Module
 * Create Image form initialization, prompt management, progress updates, and project loading.
 */
const AB_PopupCIForm = (() => {
    const H = AB_PopupHelpers;

    function init() {
        // Chain Mode toggle
        const chainCheckbox = document.getElementById('ci-chain-mode');
        const chainRefWrap = document.getElementById('ci-chain-ref-wrap');
        const chainSection = chainCheckbox?.closest('.ci-chain-section');
        const chainState = document.getElementById('ci-chain-state');
        chainCheckbox?.addEventListener('change', () => {
            if (chainCheckbox.checked) {
                chainRefWrap?.classList.remove('hidden');
                chainSection?.classList.add('chain-active');
                if (chainState) { chainState.textContent = 'ON'; chainState.classList.add('on'); }
            } else {
                chainRefWrap?.classList.add('hidden');
                chainSection?.classList.remove('chain-active');
                if (chainState) { chainState.textContent = 'OFF'; chainState.classList.remove('on'); }
            }
        });

        // Add Image Prompt button
        document.getElementById('btn-ci-add-image-prompt')?.addEventListener('click', () => {
            addCIPromptItem();
        });

        // Add initial prompt fields
        addCIPromptItem();
        addCIPromptItem();

        // Batch Prompts toggle
        const batchToggleBtn = document.getElementById('btn-ci-batch-toggle');
        const batchArea = document.getElementById('ci-batch-area');
        batchToggleBtn?.addEventListener('click', () => {
            const isHidden = batchArea.classList.contains('hidden');
            if (isHidden) {
                batchArea.classList.remove('hidden');
                batchToggleBtn.textContent = 'Hide';
                document.getElementById('ci-batch-textarea').focus();
            } else {
                batchArea.classList.add('hidden');
                batchToggleBtn.textContent = 'Show';
            }
        });

        // Batch Import — split by double newline (paragraphs)
        document.getElementById('btn-ci-batch-import')?.addEventListener('click', () => {
            const batchText = document.getElementById('ci-batch-textarea')?.value?.trim();
            if (!batchText) {
                H.showNotification('Paste your prompts first', 'error');
                return;
            }

            const paragraphs = batchText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
            if (paragraphs.length === 0) {
                H.showNotification('No prompts found', 'error');
                return;
            }

            const list = document.getElementById('ci-image-prompts-list');
            H.ciImagePrompts = [];
            list.innerHTML = '';

            paragraphs.forEach(prompt => {
                addCIPromptItem();
                const textareas = list.querySelectorAll('textarea');
                const lastTA = textareas[textareas.length - 1];
                if (lastTA) {
                    lastTA.value = prompt;
                    H.ciImagePrompts[H.ciImagePrompts.length - 1] = prompt;
                }
            });

            H.showNotification(`Imported ${paragraphs.length} prompts`, 'success');

            batchArea.classList.add('hidden');
            batchToggleBtn.textContent = 'Show';
            document.getElementById('ci-batch-textarea').value = '';
        });


        document.getElementById('btn-ci-create')?.addEventListener('click', async () => {
            const prompts = H.ciImagePrompts.filter(p => p.trim());

            if (prompts.length === 0) {
                H.showNotification('Please enter at least one prompt', 'error');
                return;
            }

            const name = document.getElementById('home-project-name')?.value?.trim() || `Images ${new Date().toLocaleString()}`;
            const aspectRatio = document.getElementById('home-aspect-ratio')?.value || '9:16';
            const outputCount = parseInt(document.getElementById('home-output-count')?.value || '1', 10);
            const imageModel = document.getElementById('home-image-model')?.value || AB_CONSTANTS.DEFAULTS.IMAGE_MODEL;
            const chainMode = document.getElementById('ci-chain-mode')?.checked || false;
            const chainFirstRef = document.getElementById('ci-chain-first-ref')?.value?.trim() || '';

            try {
                const createResult = await H.sendMessage({
                    type: 'CREATE_PROJECT',
                    payload: {
                        name,
                        mode: 'create-image',
                        aspectRatio,
                        outputCount,
                        imageModel,
                        imagePrompts: prompts,
                        referenceUrls: [],
                        chainMode,
                        chainFirstRef,
                    },
                });

                if (!createResult?.success) {
                    H.showNotification('Failed to create image project', 'error');
                    return;
                }

                const project = createResult.project;

                // Check usage limit before starting (count = number of image prompts)
                const allowed = await AB_PopupPremium.checkUsageBeforeStart(prompts.length);
                if (!allowed) return;

                // Check if another project is already running
                const runStatus = await H.sendMessage({ type: 'GET_ORCHESTRATOR_STATUS' });
                if (runStatus?.running) {
                    H.showNotification(`⚠️ "${runStatus.projectName}" is still running. Stop it first.`, 'error');
                    return;
                }

                const targetTabId = await H.getActiveFlowTabId();
                await H.sendMessage({
                    type: AB_EVENTS.START_PROJECT,
                    payload: { projectId: project.id, targetTabId },
                });

                const ciBody = document.querySelector('#view-create-image .t2v-body');
                ciBody?.classList.add('hidden');
                document.getElementById('ci-progress')?.classList.remove('hidden');
                document.getElementById('ci-progress-name').textContent = project.name;
                H.showNotification('Image project started!', 'success');
            } catch (err) {
                H.showNotification('Failed to start image project: ' + err.message, 'error');
            }
        });

        // Save to Batch button
        document.getElementById('btn-ci-batch')?.addEventListener('click', async () => {
            const batchBtn = document.getElementById('btn-ci-batch');
            if (batchBtn?.hasAttribute('data-locked')) return;
            const prompts = H.ciImagePrompts.filter(p => p.trim());

            if (prompts.length === 0) {
                H.showNotification('Please enter at least one prompt', 'error');
                return;
            }

            const name = document.getElementById('home-project-name')?.value?.trim() || `Images ${new Date().toLocaleString()}`;
            const aspectRatio = document.getElementById('home-aspect-ratio')?.value || '9:16';
            const outputCount = parseInt(document.getElementById('home-output-count')?.value || '1', 10);
            const imageModel = document.getElementById('home-image-model')?.value || AB_CONSTANTS.DEFAULTS.IMAGE_MODEL;
            const chainMode = document.getElementById('ci-chain-mode')?.checked || false;
            const chainFirstRef = document.getElementById('ci-chain-first-ref')?.value?.trim() || '';

            try {
                const createResult = await H.sendMessage({
                    type: 'CREATE_PROJECT',
                    payload: { name, mode: 'create-image', aspectRatio, outputCount, imageModel, imagePrompts: prompts, referenceUrls: [], chainMode, chainFirstRef },
                });
                if (!createResult?.success) {
                    H.showNotification('Failed to create project', 'error');
                    return;
                }
                await H.sendMessage({ type: 'ADD_TO_BATCH', payload: { projectId: createResult.project.id } });
                H.showNotification(`📦 "${name}" added to batch queue`, 'success');
            } catch (err) {
                H.showNotification('Failed to add to batch: ' + err.message, 'error');
            }
        });

        // CI Pause/Resume/Stop buttons
        document.getElementById('btn-ci-pause')?.addEventListener('click', async () => {
            try {
                await H.sendMessage({ type: AB_EVENTS.PAUSE_PROJECT });
            } catch (e) { /* ignore */ }
        });

        document.getElementById('btn-ci-resume')?.addEventListener('click', async () => {
            try {
                const status = await H.sendMessage({ type: 'GET_ORCHESTRATOR_STATUS' });
                if (status?.projectId) {
                    await H.sendMessage({ type: AB_EVENTS.RESUME_PROJECT, payload: { projectId: status.projectId } });
                }
            } catch (e) { /* ignore */ }
        });

        document.getElementById('btn-ci-stop')?.addEventListener('click', async () => {
            try {
                await H.sendMessage({ type: AB_EVENTS.STOP_PROJECT });
                document.getElementById('ci-progress')?.classList.add('hidden');
                const ciBody = document.querySelector('#view-create-image .t2v-body');
                ciBody?.classList.remove('hidden');
                H.showNotification('Image project stopped', 'info');
            } catch (e) { /* ignore */ }
        });
    }

    function addCIPromptItem() {
        const list = document.getElementById('ci-image-prompts-list');
        const index = H.ciImagePrompts.length;
        H.ciImagePrompts.push('');

        const item = document.createElement('div');
        item.className = 'prompt-item';
        item.innerHTML = `
      <span class="prompt-number">P${index + 1}</span>
      <textarea placeholder="Describe the scene..." data-index="${index}" data-type="ci-image"></textarea>
      <button class="btn-remove" data-index="${index}" data-type="ci-image">×</button>
    `;

        const textarea = item.querySelector('textarea');
        textarea.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            H.ciImagePrompts[idx] = e.target.value;
        });

        const removeBtn = item.querySelector('.btn-remove');
        removeBtn.addEventListener('click', () => {
            const idx = parseInt(removeBtn.dataset.index);
            H.ciImagePrompts.splice(idx, 1);
            _rebuildCIPromptList();
        });

        list.appendChild(item);
        _updateCIPromptCount();
    }

    function _rebuildCIPromptList() {
        const list = document.getElementById('ci-image-prompts-list');
        const savedValues = [...H.ciImagePrompts];
        H.ciImagePrompts = [];
        list.innerHTML = '';

        savedValues.forEach((val, i) => {
            addCIPromptItem();
            const textarea = list.querySelectorAll('textarea')[i];
            if (textarea) {
                textarea.value = val;
                H.ciImagePrompts[i] = val;
            }
        });
    }

    function _updateCIPromptCount() {
        const el = document.getElementById('ci-image-prompt-count');
        if (el) el.textContent = H.ciImagePrompts.length;
    }

    // ─── CI Progress Update ───
    function updateCIProgress(status) {
        const progressEl = document.getElementById('ci-progress');
        if (!progressEl || progressEl.classList.contains('hidden')) return;
        if (!status || !status.running) {
            if (status?.phase === 'create-image' || status?.state === 'COMPLETED') {
                document.getElementById('ci-detail-state').textContent = status.state || 'COMPLETED';

                // Set progress to 100% on completion
                if (status?.state === 'COMPLETED') {
                    document.getElementById('ci-progress-fill').style.width = '100%';
                    document.getElementById('ci-progress-pct').textContent = '100%';

                    // Auto-reset back to editor after 3 seconds
                    setTimeout(() => {
                        progressEl.classList.add('hidden');
                        const ciBody = document.querySelector('#view-create-image .t2v-body');
                        ciBody?.classList.remove('hidden');
                        // Reset progress bars for next run
                        document.getElementById('ci-progress-fill').style.width = '0%';
                        document.getElementById('ci-progress-pct').textContent = '0%';
                        document.getElementById('ci-detail-state').textContent = '—';
                        const dotsEl = document.getElementById('ci-prompt-dots');
                        if (dotsEl) dotsEl.innerHTML = '';
                    }, 3000);
                }
            }
            // Hide all action buttons when not running
            document.getElementById('btn-ci-pause')?.classList.add('hidden');
            document.getElementById('btn-ci-resume')?.classList.add('hidden');
            document.getElementById('btn-ci-stop')?.classList.add('hidden');
            return;
        }

        if (status.phase !== 'create-image' && status.state !== 'CREATE_IMAGE_PHASE') return;

        document.getElementById('ci-progress-name').textContent = status.projectName || '—';

        const imgDone = status.imageResults?.filter(r => r.status === 'ready').length || 0;
        const pct = status.totalImages > 0 ? Math.round((imgDone / status.totalImages) * 100) : 0;
        document.getElementById('ci-progress-fill').style.width = `${pct}%`;
        document.getElementById('ci-progress-pct').textContent = `${pct}%`;

        document.getElementById('ci-detail-phase').textContent = 'create-image';
        document.getElementById('ci-detail-step').textContent = `${(status.currentIndex || 0) + 1} / ${status.totalImages || 0}`;
        document.getElementById('ci-detail-state').textContent = status.state || '—';

        const dotsEl = document.getElementById('ci-prompt-dots');
        dotsEl.innerHTML = '';
        status.imageResults?.forEach((r, i) => {
            const dot = document.createElement('div');
            dot.className = `step-dot ${r.status}`;
            dot.textContent = i + 1;
            dot.title = `Image ${i + 1}: ${r.status}`;
            dotsEl.appendChild(dot);
        });

        const isPaused = status.state === 'PAUSED';
        document.getElementById('btn-ci-pause').classList.toggle('hidden', isPaused);
        document.getElementById('btn-ci-resume').classList.toggle('hidden', !isPaused);
    }

    // ─── Load CI Project ───
    function loadProjectIntoCIForm(project) {
        H.currentProject = project;
        AB_PopupNavigation.showStandaloneView('view-create-image');

        const nameEl = document.getElementById('home-project-name');
        if (nameEl) nameEl.value = project.name || '';
        const aspectEl = document.getElementById('home-aspect-ratio');
        if (aspectEl) aspectEl.value = project.aspectRatio || '9:16';
        const outputsEl = document.getElementById('home-output-count');
        if (outputsEl) outputsEl.value = project.outputCount || project.outputsPerPrompt || 1;
        const imageModelEl = document.getElementById('home-image-model');
        if (imageModelEl && project.imageModel) imageModelEl.value = project.imageModel;

        const prompts = project.imagePrompts || [];
        const list = document.getElementById('ci-image-prompts-list');
        H.ciImagePrompts = [];
        list.innerHTML = '';

        prompts.forEach(prompt => {
            addCIPromptItem();
            const textareas = list.querySelectorAll('textarea');
            const lastTA = textareas[textareas.length - 1];
            if (lastTA) {
                lastTA.value = prompt;
                H.ciImagePrompts[H.ciImagePrompts.length - 1] = prompt;
            }
        });

        if (prompts.length === 0) {
            addCIPromptItem();
            addCIPromptItem();
        }

        const chainCb = document.getElementById('ci-chain-mode');
        const chainRefW = document.getElementById('ci-chain-ref-wrap');
        const chainFirstRefEl = document.getElementById('ci-chain-first-ref');
        if (chainCb) {
            chainCb.checked = !!project.chainMode;
            if (project.chainMode) {
                chainRefW?.classList.remove('hidden');
            } else {
                chainRefW?.classList.add('hidden');
            }
        }
        if (chainFirstRefEl) chainFirstRefEl.value = project.chainFirstRef || '';

        H.showNotification(`Loaded CI: "${project.name}"`, 'success');
    }

    return {
        init,
        addCIPromptItem,
        updateCIProgress,
        loadProjectIntoCIForm,
    };
})();
