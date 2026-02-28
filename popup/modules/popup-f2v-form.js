/**
 * AutoBoom — F2V Form Module
 * Project form, prompt lists, save/load/run, and cost estimator for Frames-to-Video mode.
 */
const AB_PopupF2VForm = (() => {
    const H = AB_PopupHelpers;
    const Nav = AB_PopupNavigation;

    // ─── Project Form ───
    function init() {
        document.getElementById('btn-add-image-prompt').addEventListener('click', () => {
            addPromptItem('image');
        });

        document.getElementById('btn-add-anim-prompt').addEventListener('click', () => {
            addPromptItem('anim');
        });

        document.getElementById('btn-save-project').addEventListener('click', saveProject);
        document.getElementById('btn-run-project').addEventListener('click', runProject);

        // Chain Mode OFF/ON label
        const f2vChain = document.getElementById('f2v-chain-mode');
        const f2vState = document.getElementById('f2v-chain-state');
        const f2vSection = f2vChain?.closest('.ci-chain-section');
        f2vChain?.addEventListener('change', () => {
            if (f2vState) { f2vState.textContent = f2vChain.checked ? 'ON' : 'OFF'; f2vState.classList.toggle('on', f2vChain.checked); }
            f2vSection?.classList.toggle('chain-active', f2vChain.checked);
        });

        // Save to Batch button
        document.getElementById('btn-f2v-batch')?.addEventListener('click', async () => {
            const batchBtn = document.getElementById('btn-f2v-batch');
            if (batchBtn?.hasAttribute('data-locked')) return;
            const name = document.getElementById('home-project-name').value.trim();
            if (!name) { H.showNotification('Please enter a project name', 'error'); return; }

            const chainMode = document.getElementById('f2v-chain-mode')?.checked || false;
            const singleImageMode = !chainMode;
            const filteredImagePrompts = H.imagePrompts.filter(p => p.trim());
            const filteredAnimPrompts = H.animPrompts.filter(p => p.trim());

            if (filteredImagePrompts.length < 1 || filteredAnimPrompts.length < 1) {
                H.showNotification('Please add at least 1 image and 1 animation prompt', 'error');
                return;
            }

            const maxAnimCount = singleImageMode
                ? filteredAnimPrompts.length
                : (filteredImagePrompts.length - 1) + 1;

            try {
                const result = await H.sendMessage({
                    type: 'CREATE_PROJECT',
                    payload: {
                        name,
                        aspectRatio: document.getElementById('home-aspect-ratio').value,
                        outputCount: parseInt(document.getElementById('home-output-count').value, 10) || 1,
                        videoModel: document.getElementById('home-video-model')?.value || AB_CONSTANTS.DEFAULTS.VIDEO_MODEL,
                        imagePrompts: filteredImagePrompts,
                        animationPrompts: filteredAnimPrompts.slice(0, maxAnimCount),
                        singleImageMode,
                    },
                });
                if (!result?.success) {
                    H.showNotification('Failed to create project', 'error');
                    return;
                }
                await H.sendMessage({ type: 'ADD_TO_BATCH', payload: { projectId: result.project.id } });
                H.showNotification(`📦 "${name}" added to batch queue`, 'success');
            } catch (err) {
                H.showNotification('Failed to add to batch: ' + err.message, 'error');
            }
        });

        // New Project button — resets form
        document.getElementById('btn-new-project')?.addEventListener('click', resetProjectForm);

        // Add initial prompts
        addPromptItem('image');
        addPromptItem('image');
        addPromptItem('anim');
    }

    function resetProjectForm() {
        H.currentProject = null;
        document.getElementById('home-project-name').value = '';
        document.getElementById('home-aspect-ratio').value = '16:9';
        document.getElementById('home-output-count').value = '1';

        const chainModeCb = document.getElementById('f2v-chain-mode');
        if (chainModeCb) chainModeCb.checked = false;

        H.imagePrompts = [];
        H.animPrompts = [];
        document.getElementById('image-prompts-list').innerHTML = '';
        document.getElementById('anim-prompts-list').innerHTML = '';

        addPromptItem('image');
        addPromptItem('image');
        addPromptItem('anim');
        updatePromptCounts();
    }

    function addPromptItem(type) {
        const list = document.getElementById(type === 'image' ? 'image-prompts-list' : 'anim-prompts-list');
        const arr = type === 'image' ? H.imagePrompts : H.animPrompts;
        const index = arr.length;

        arr.push('');

        const item = document.createElement('div');
        item.className = 'prompt-item';
        item.innerHTML = `
      <span class="prompt-number">${type === 'image' ? 'P' : 'A'}${index + 1}</span>
      <textarea placeholder="${type === 'image' ? 'Describe the scene...' : 'Describe the transition animation...'}" data-index="${index}" data-type="${type}"></textarea>
      <button class="btn-remove" data-index="${index}" data-type="${type}">×</button>
    `;

        const textarea = item.querySelector('textarea');
        textarea.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (type === 'image') H.imagePrompts[idx] = e.target.value;
            else H.animPrompts[idx] = e.target.value;
        });

        const removeBtn = item.querySelector('.btn-remove');
        removeBtn.addEventListener('click', () => {
            const idx = parseInt(removeBtn.dataset.index);
            if (type === 'image') H.imagePrompts.splice(idx, 1);
            else H.animPrompts.splice(idx, 1);
            _rebuildPromptList(type);
        });

        list.appendChild(item);
        updatePromptCounts();
    }

    function _rebuildPromptList(type) {
        const list = document.getElementById(type === 'image' ? 'image-prompts-list' : 'anim-prompts-list');
        const arr = type === 'image' ? H.imagePrompts : H.animPrompts;
        list.innerHTML = '';

        const savedValues = [...arr];
        if (type === 'image') H.imagePrompts = [];
        else H.animPrompts = [];

        savedValues.forEach((val, i) => {
            addPromptItem(type);
            const textarea = list.querySelectorAll('textarea')[i];
            if (textarea) {
                textarea.value = val;
                if (type === 'image') H.imagePrompts[i] = val;
                else H.animPrompts[i] = val;
            }
        });
    }

    function updatePromptCounts() {
        document.getElementById('image-prompt-count').textContent = H.imagePrompts.length;
        document.getElementById('anim-prompt-count').textContent = H.animPrompts.length;
    }

    async function saveProject() {
        const name = document.getElementById('home-project-name').value.trim();
        if (!name) {
            alert('Please enter a project name');
            return;
        }

        const chainMode = document.getElementById('f2v-chain-mode')?.checked || false;
        const singleImageMode = !chainMode;

        const filteredImagePrompts = H.imagePrompts.filter(p => p.trim());
        const filteredAnimPrompts = H.animPrompts.filter(p => p.trim());

        if (singleImageMode) {
            if (filteredImagePrompts.length < 1) {
                alert('Please add at least 1 image prompt');
                return;
            }
            if (filteredAnimPrompts.length < 1) {
                alert('Please add at least 1 animation prompt');
                return;
            }
        } else {
            if (filteredImagePrompts.length < 2) {
                alert('Please add at least 2 image prompts');
                return;
            }
            const expectedAnimCount = filteredImagePrompts.length - 1;
            if (filteredAnimPrompts.length < expectedAnimCount) {
                alert(`You need at least ${expectedAnimCount} animation prompts for ${filteredImagePrompts.length} images. You have ${filteredAnimPrompts.length}.`);
                return;
            }
        }

        const maxAnimCount = singleImageMode
            ? filteredAnimPrompts.length
            : (filteredImagePrompts.length - 1) + 1;

        const projectData = {
            name,
            aspectRatio: document.getElementById('home-aspect-ratio').value,
            outputCount: parseInt(document.getElementById('home-output-count').value, 10) || 1,
            videoModel: document.getElementById('home-video-model')?.value || AB_CONSTANTS.DEFAULTS.VIDEO_MODEL,
            imagePrompts: filteredImagePrompts,
            animationPrompts: filteredAnimPrompts.slice(0, maxAnimCount),
            singleImageMode,
        };

        try {
            let result;
            if (H.currentProject && H.currentProject.id) {
                projectData.id = H.currentProject.id;
                result = await H.sendMessage({ type: 'UPDATE_PROJECT', payload: projectData });
            } else {
                result = await H.sendMessage({ type: 'CREATE_PROJECT', payload: projectData });
            }
            if (result && result.success) {
                H.currentProject = result.project;
                H.showNotification(H.currentProject ? 'Project updated!' : 'Project saved!', 'success');
                AB_PopupProjects.loadSavedProjects();
            }
        } catch (err) {
            H.showNotification('Failed to save project', 'error');
        }
    }

    function loadProjectIntoForm(project) {
        H.currentProject = project;

        document.getElementById('home-project-name').value = project.name || '';
        document.getElementById('home-aspect-ratio').value = project.aspectRatio || '16:9';
        document.getElementById('home-output-count').value = project.outputCount || project.outputsPerPrompt || 1;
        const videoModelEl = document.getElementById('home-video-model');
        if (videoModelEl && project.videoModel) videoModelEl.value = project.videoModel;

        H.imagePrompts = [...(project.imagePrompts || [])];
        _rebuildPromptList('image');

        H.animPrompts = [...(project.animationPrompts || [])];
        _rebuildPromptList('anim');

        updatePromptCounts();

        const chainModeCb = document.getElementById('f2v-chain-mode');
        if (chainModeCb) chainModeCb.checked = !project.singleImageMode;

        Nav.showStandaloneView('view-f2v');
        Nav.showF2VProject();
        H.showNotification(`Loaded "${project.name}"`, 'success');
    }

    async function runProject() {
        await saveProject();
        if (!H.currentProject) return;

        try {
            // Check usage limit before starting (count = number of image prompts)
            const promptCount = (H.currentProject?.imagePrompts || H.imagePrompts || []).length;
            const allowed = await AB_PopupPremium.checkUsageBeforeStart(promptCount);
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
                payload: { projectId: H.currentProject.id, targetTabId },
            });

            Nav.showF2VProgress();
            H.showNotification('Project started!', 'success');
        } catch (err) {
            H.showNotification('Failed to start project', 'error');
        }
    }

    // ─── Cost Estimator ───
    function initCostEstimator() {
        const imageList = document.getElementById('image-prompts-list');
        const animList = document.getElementById('anim-prompts-list');
        const outputCountEl = document.getElementById('home-output-count');

        const observer = new MutationObserver(_updateCostEstimate);
        if (imageList) observer.observe(imageList, { childList: true });
        if (animList) observer.observe(animList, { childList: true });
        if (outputCountEl) outputCountEl.addEventListener('change', _updateCostEstimate);

        _updateCostEstimate();
    }

    function _updateCostEstimate() {
        const imageCount = document.querySelectorAll('#image-prompts-list .prompt-row').length;
        const animCount = document.querySelectorAll('#anim-prompts-list .prompt-row').length;
        const outputCount = parseInt(document.getElementById('home-output-count')?.value) || 1;

        const imageCost = imageCount * outputCount;
        const videoCost = animCount * 4;
        const totalCost = imageCost + videoCost;

        const el = document.getElementById('cost-estimate');
        if (totalCost > 0) {
            el.textContent = `💰 ~${totalCost} credits (${imageCount} img + ${animCount} vid)`;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    return {
        init,
        resetProjectForm,
        addPromptItem,
        updatePromptCounts,
        loadProjectIntoForm,
        saveProject,
        runProject,
        initCostEstimator,
    };
})();
