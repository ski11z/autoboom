/**
 * AutoBoom — T2V Form Module
 * Text-to-Video form initialization, project creation, progress updates, and downloads.
 */
const AB_PopupT2VForm = (() => {
    const H = AB_PopupHelpers;

    let _t2vProjectName = '';
    let _t2vFlowUrl = '';

    function init() {
        // Prompt mode toggle
        const singleBtn = document.getElementById('t2v-mode-single');
        const multiBtn = document.getElementById('t2v-mode-multi');
        const singleWrap = document.getElementById('t2v-single-wrap');
        const multiWrap = document.getElementById('t2v-multi-wrap');

        singleBtn?.addEventListener('click', () => {
            singleBtn.classList.add('active');
            multiBtn.classList.remove('active');
            singleWrap.classList.remove('hidden');
            multiWrap.classList.add('hidden');
        });

        multiBtn?.addEventListener('click', () => {
            multiBtn.classList.add('active');
            singleBtn.classList.remove('active');
            multiWrap.classList.remove('hidden');
            singleWrap.classList.add('hidden');
        });

        // Multi-prompt line counter
        const multiTextarea = document.getElementById('t2v-prompts-multi');
        const countEl = document.getElementById('t2v-prompt-count');
        multiTextarea?.addEventListener('input', () => {
            const lines = multiTextarea.value.split('\n').filter(l => l.trim().length > 0);
            const span = countEl?.querySelector('span:last-child');
            if (span) span.textContent = `${lines.length} prompt${lines.length !== 1 ? 's' : ''}`;
        });

        // Create Videos button
        document.getElementById('btn-t2v-create')?.addEventListener('click', async () => {
            const isMulti = multiBtn.classList.contains('active');
            let prompts = [];

            if (isMulti) {
                prompts = multiTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
            } else {
                const single = document.getElementById('t2v-prompt')?.value?.trim();
                if (single) prompts = [single];
            }

            if (prompts.length === 0) {
                H.showNotification('Please enter at least one prompt', 'error');
                return;
            }

            const name = document.getElementById('home-project-name')?.value?.trim() || `T2V ${new Date().toLocaleString()}`;
            const aspectRatio = document.getElementById('home-aspect-ratio')?.value || '9:16';
            const outputCount = parseInt(document.getElementById('home-output-count')?.value || '1', 10);
            const videoModel = document.getElementById('home-video-model')?.value || AB_CONSTANTS.DEFAULTS.VIDEO_MODEL;

            try {
                const createResult = await H.sendMessage({
                    type: 'CREATE_PROJECT',
                    payload: {
                        name,
                        mode: 'text-to-video',
                        aspectRatio,
                        outputCount,
                        videoModel,
                        videoPrompts: prompts,
                    },
                });

                if (!createResult?.success) {
                    H.showNotification('Failed to create T2V project', 'error');
                    return;
                }

                const project = createResult.project;

                // Check usage limit before starting (count = number of video prompts)
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

                // Show T2V progress
                document.querySelector('.t2v-body').classList.add('hidden');
                document.getElementById('t2v-progress').classList.remove('hidden');
                document.getElementById('t2v-progress-name').textContent = project.name;
                H.showNotification('T2V project started!', 'success');
            } catch (err) {
                H.showNotification('Failed to start T2V project: ' + err.message, 'error');
            }
        });

        // Save to Batch button
        document.getElementById('btn-t2v-batch')?.addEventListener('click', async () => {
            const batchBtn = document.getElementById('btn-t2v-batch');
            if (batchBtn?.hasAttribute('data-locked')) return;
            const isMulti = multiBtn.classList.contains('active');
            let prompts = [];

            if (isMulti) {
                prompts = multiTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
            } else {
                const single = document.getElementById('t2v-prompt')?.value?.trim();
                if (single) prompts = [single];
            }

            if (prompts.length === 0) {
                H.showNotification('Please enter at least one prompt', 'error');
                return;
            }

            const name = document.getElementById('home-project-name')?.value?.trim() || `T2V ${new Date().toLocaleString()}`;
            const aspectRatio = document.getElementById('home-aspect-ratio')?.value || '9:16';
            const outputCount = parseInt(document.getElementById('home-output-count')?.value || '1', 10);
            const videoModel = document.getElementById('home-video-model')?.value || AB_CONSTANTS.DEFAULTS.VIDEO_MODEL;

            try {
                const createResult = await H.sendMessage({
                    type: 'CREATE_PROJECT',
                    payload: { name, mode: 'text-to-video', aspectRatio, outputCount, videoModel, videoPrompts: prompts },
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

        // T2V Pause/Resume/Stop buttons
        document.getElementById('btn-t2v-pause')?.addEventListener('click', async () => {
            try {
                await H.sendMessage({ type: AB_EVENTS.PAUSE_PROJECT });
            } catch (e) { /* ignore */ }
        });

        document.getElementById('btn-t2v-resume')?.addEventListener('click', async () => {
            try {
                const status = await H.sendMessage({ type: 'GET_ORCHESTRATOR_STATUS' });
                if (status?.projectId) {
                    await H.sendMessage({ type: AB_EVENTS.RESUME_PROJECT, payload: { projectId: status.projectId } });
                }
            } catch (e) { /* ignore */ }
        });

        document.getElementById('btn-t2v-stop')?.addEventListener('click', async () => {
            try {
                await H.sendMessage({ type: AB_EVENTS.STOP_PROJECT });
                document.getElementById('t2v-progress').classList.add('hidden');
                document.querySelector('.t2v-body').classList.remove('hidden');
                H.showNotification('T2V project stopped', 'info');
            } catch (e) { /* ignore */ }
        });

        // T2V Back to Home (after completion)
        document.getElementById('btn-t2v-back-home')?.addEventListener('click', () => {
            document.getElementById('t2v-progress').classList.add('hidden');
            document.querySelector('.t2v-body').classList.remove('hidden');
            // Reset progress UI for next run
            document.getElementById('t2v-progress-fill').style.width = '0%';
            document.getElementById('t2v-progress-pct').textContent = '0%';
            document.getElementById('t2v-detail-state').textContent = '—';
            document.getElementById('btn-t2v-download')?.classList.add('hidden');
            document.getElementById('btn-t2v-back-home')?.classList.add('hidden');
        });

        // T2V Download Videos button
        document.getElementById('btn-t2v-download')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-t2v-download');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '⏳ Fetching videos...';

            try {
                const urlsResult = await H.sendMessage({
                    type: 'GET_VIDEO_URLS_FOR_DOWNLOAD',
                    payload: { flowUrl: _t2vFlowUrl || undefined },
                });
                const videos = urlsResult?.videos || [];

                if (videos.length === 0) {
                    H.showNotification('No videos found. Make sure the Flow tab is open on the project.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    return;
                }

                const projectName = _t2vProjectName || 'T2V-Project';
                btn.innerHTML = `⏳ Saving ${videos.length} videos...`;

                const result = await H.sendMessage({
                    type: 'DOWNLOAD_VIDEOS_TO_FOLDER',
                    payload: { videos, folderName: projectName },
                });

                if (result?.downloaded > 0) {
                    H.showNotification(`Saving ${result.downloaded} videos to "${projectName}" folder`, 'success');
                } else {
                    H.showNotification('Failed to start any downloads', 'error');
                }
            } catch (err) {
                H.showNotification('Download failed: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // ─── T2V Progress Update ───
    function updateT2VProgress(status) {
        const progressEl = document.getElementById('t2v-progress');
        if (!progressEl || progressEl.classList.contains('hidden')) return;
        const downloadBtn = document.getElementById('btn-t2v-download');

        if (!status || !status.running) {
            if (status?.phase === 'text-to-video' || status?.state === 'COMPLETED') {
                document.getElementById('t2v-detail-state').textContent = status.state || 'COMPLETED';
                const allDone = status.videoResults?.every(r => r.status === 'submitted' || r.status === 'downloaded');
                if (allDone && downloadBtn) {
                    downloadBtn.classList.remove('hidden');
                }
                // Show Back to Home button on completion
                const backHomeBtn = document.getElementById('btn-t2v-back-home');
                if (backHomeBtn && status?.state === 'COMPLETED') {
                    backHomeBtn.classList.remove('hidden');
                }
                // Set progress to 100% on completion
                if (status?.state === 'COMPLETED') {
                    document.getElementById('t2v-progress-fill').style.width = '100%';
                    document.getElementById('t2v-progress-pct').textContent = '100%';
                }
            }
            // Hide all action buttons when not running
            document.getElementById('btn-t2v-pause')?.classList.add('hidden');
            document.getElementById('btn-t2v-resume')?.classList.add('hidden');
            document.getElementById('btn-t2v-stop')?.classList.add('hidden');
            return;
        }

        _t2vProjectName = status.projectName || '';
        _t2vFlowUrl = status.flowUrl || '';

        document.getElementById('t2v-progress-name').textContent = status.projectName || '—';

        const vidDone = status.videoResults?.filter(r => r.status === 'submitted' || r.status === 'downloaded').length || 0;
        const pct = status.totalVideos > 0 ? Math.round((vidDone / status.totalVideos) * 100) : 0;
        document.getElementById('t2v-progress-fill').style.width = `${pct}%`;
        document.getElementById('t2v-progress-pct').textContent = `${pct}%`;

        document.getElementById('t2v-detail-phase').textContent = 'text-to-video';
        document.getElementById('t2v-detail-step').textContent = `${(status.currentIndex || 0) + 1} / ${status.totalVideos || 0}`;
        document.getElementById('t2v-detail-state').textContent = status.state || '—';

        const dotsEl = document.getElementById('t2v-prompt-dots');
        dotsEl.innerHTML = '';
        status.videoResults?.forEach((r, i) => {
            const dot = document.createElement('div');
            dot.className = `step-dot ${r.status}`;
            dot.textContent = i + 1;
            dot.title = `Prompt ${i + 1}: ${r.status}`;
            dotsEl.appendChild(dot);
        });

        const isPaused = status.state === 'PAUSED';
        document.getElementById('btn-t2v-pause').classList.toggle('hidden', isPaused);
        document.getElementById('btn-t2v-resume').classList.toggle('hidden', !isPaused);
    }

    // ─── Load T2V Project ───
    function loadProjectIntoT2VForm(project) {
        H.currentProject = project;
        AB_PopupNavigation.showStandaloneView('view-t2v');

        const nameEl = document.getElementById('home-project-name');
        if (nameEl) nameEl.value = project.name || '';
        const aspectEl = document.getElementById('home-aspect-ratio');
        if (aspectEl) aspectEl.value = project.aspectRatio || '9:16';
        const outputsEl = document.getElementById('home-output-count');
        if (outputsEl) outputsEl.value = project.outputCount || project.outputsPerPrompt || 1;
        const videoModelEl = document.getElementById('home-video-model');
        if (videoModelEl && project.videoModel) videoModelEl.value = project.videoModel;

        const prompts = project.videoPrompts || [];
        if (prompts.length > 1) {
            document.getElementById('t2v-mode-multi')?.click();
            const multiTextarea = document.getElementById('t2v-prompts-multi');
            if (multiTextarea) multiTextarea.value = prompts.join('\n');
        } else {
            document.getElementById('t2v-mode-single')?.click();
            const singleInput = document.getElementById('t2v-prompt');
            if (singleInput) singleInput.value = prompts[0] || '';
        }

        H.showNotification(`Loaded T2V: "${project.name}"`, 'success');
    }

    return {
        init,
        updateT2VProgress,
        loadProjectIntoT2VForm,
    };
})();
