/**
 * AutoBoom — Popup Projects
 * Saved projects list, batch queue, history, diagnostics, F2V progress,
 * downloads, session recovery, connection check, credits, and state polling.
 */
const AB_PopupProjects = (() => {
    const H = AB_PopupHelpers;
    const Nav = AB_PopupNavigation;

    // ─── Saved Projects: Pagination & Search State ───
    const PROJECTS_INITIAL = 15;
    const PROJECTS_INCREMENT = 10;
    let _projectsDisplayLimit = PROJECTS_INITIAL;
    let _projectSearchQuery = '';
    let _allSortedProjects = [];

    function initSavedProjectsControls() {
        const searchInput = document.getElementById('saved-projects-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                _projectSearchQuery = e.target.value.trim().toLowerCase();
                _projectsDisplayLimit = PROJECTS_INITIAL;
                _renderSavedProjects();
            });
        }
        const loadMoreBtn = document.getElementById('btn-load-more-projects');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                _projectsDisplayLimit += PROJECTS_INCREMENT;
                _renderSavedProjects();
            });
        }
    }

    async function loadSavedProjects() {
        try {
            const projects = await H.sendMessage({ type: 'GET_PROJECTS' });
            const list = document.getElementById('saved-projects-list');

            if (!projects || Object.keys(projects).length === 0) {
                list.innerHTML = '<div class="empty-state small">No projects saved yet.</div>';
                document.getElementById('saved-projects-count').textContent = '';
                document.getElementById('btn-load-more-projects')?.classList.add('hidden');
                return;
            }

            _allSortedProjects = Object.entries(projects).sort((a, b) => {
                return (b[1].updatedAt || 0) - (a[1].updatedAt || 0);
            });

            for (const [id, project] of _allSortedProjects) {
                if (project.status !== 'completed') {
                    try {
                        const prog = await H.sendMessage({ type: 'GET_PROJECT_PROGRESS', payload: { projectId: id } });
                        if (prog?.currentState === 'COMPLETED') {
                            project.status = 'completed';
                            H.sendMessage({ type: 'SAVE_PROJECT', payload: { projectId: id, project } });
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            _renderSavedProjects();
        } catch (e) {
            console.error('Failed to load projects:', e);
        }
    }

    function _renderSavedProjects() {
        const list = document.getElementById('saved-projects-list');
        const countEl = document.getElementById('saved-projects-count');
        const loadMoreBtn = document.getElementById('btn-load-more-projects');

        const filtered = _projectSearchQuery
            ? _allSortedProjects.filter(([, p]) => p.name.toLowerCase().includes(_projectSearchQuery))
            : _allSortedProjects;

        if (filtered.length === 0) {
            list.innerHTML = _projectSearchQuery
                ? '<div class="empty-state small">No projects match your search.</div>'
                : '<div class="empty-state small">No projects saved yet.</div>';
            countEl.textContent = '';
            loadMoreBtn?.classList.add('hidden');
            return;
        }

        const visible = filtered.slice(0, _projectsDisplayLimit);
        const hasMore = filtered.length > _projectsDisplayLimit;

        countEl.textContent = `Showing ${visible.length} of ${filtered.length}`;

        if (hasMore) {
            loadMoreBtn?.classList.remove('hidden');
        } else {
            loadMoreBtn?.classList.add('hidden');
        }

        list.innerHTML = '';

        for (const [id, project] of visible) {
            const isCompleted = project.status === 'completed';

            const item = document.createElement('div');
            item.className = `project-item${isCompleted ? ' project-completed' : ''}`;

            let modeLabel, modeClass;
            if (project.mode === 'create-image') {
                modeLabel = 'Create Image';
                modeClass = 'ci';
            } else if (project.mode === 'text-to-video') {
                modeLabel = 'Text to Video';
                modeClass = 't2v';
            } else {
                modeLabel = 'Frames to Video';
                modeClass = 'f2v';
            }

            item.innerHTML = `
          <span class="mode-badge mode-${modeClass}">${modeLabel}</span>
          <div class="project-item-info">
            <span class="project-item-name">${H.escapeHtml(project.name)}</span>
            <span class="project-item-meta">${project.imagePrompts.length} img · ${(project.animationPrompts || []).length} anim · ${project.aspectRatio}${isCompleted ? ' · Done' : ''}</span>
          </div>
          <div class="project-item-actions">
            ${isCompleted ? '<button class="icon-btn" title="Download videos" data-action="download" data-id="' + id + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg></button>' : ''}
            <button class="icon-btn" title="Load into editor" data-action="load" data-id="${id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/></svg></button>
            <button class="icon-btn" title="Duplicate" data-action="clone" data-id="${id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            <button class="icon-btn" title="Add to queue" data-action="add-batch" data-id="${id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            <button class="icon-btn" title="Run" data-action="run" data-id="${id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4l15 8-15 8V4z"/></svg></button>
            <button class="icon-btn btn-delete" title="Delete" data-action="delete" data-id="${id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
          </div>
        `;

            const dlBtn = item.querySelector('[data-action="download"]');
            if (dlBtn) {
                dlBtn.addEventListener('click', async () => {
                    // Show loading spinner on the button
                    const originalHTML = dlBtn.innerHTML;
                    dlBtn.disabled = true;
                    dlBtn.classList.add('icon-btn-loading');
                    dlBtn.innerHTML = '<span class="btn-spinner"></span>';
                    dlBtn.title = 'Downloading...';
                    try {
                        await downloadVideos(project.name, project.flowUrl);
                    } finally {
                        dlBtn.disabled = false;
                        dlBtn.classList.remove('icon-btn-loading');
                        dlBtn.innerHTML = originalHTML;
                        dlBtn.title = 'Download videos';
                    }
                });
            }

            item.querySelector('[data-action="load"]').addEventListener('click', async () => {
                if (project.flowUrl) {
                    H.sendMessage({
                        type: 'NAVIGATE_TO_PROJECT',
                        payload: { flowUrl: project.flowUrl },
                    });
                }
                if (project.mode === 'text-to-video') {
                    AB_PopupT2VForm.loadProjectIntoT2VForm(project);
                } else if (project.mode === 'create-image') {
                    AB_PopupCIForm.loadProjectIntoCIForm(project);
                } else {
                    AB_PopupF2VForm.loadProjectIntoForm(project);
                }
            });

            item.querySelector('[data-action="clone"]').addEventListener('click', async () => {
                const result = await H.sendMessage({ type: 'CLONE_PROJECT', payload: { projectId: id } });
                const cloneName = result?.project?.name || 'Copy';
                H.showNotification(`Duplicated as "${cloneName}"`, 'success');
                await loadSavedProjects();
                // Scroll list to top so the new clone is visible
                const list = document.getElementById('saved-projects-list');
                if (list) list.scrollTop = 0;
            });

            item.querySelector('[data-action="add-batch"]').addEventListener('click', async () => {
                await H.sendMessage({ type: 'ADD_TO_BATCH', payload: { projectId: id } });
                H.showNotification('Added to batch queue', 'success');
                loadBatchQueue();
            });

            item.querySelector('[data-action="run"]').addEventListener('click', async () => {
                // Load project to count prompts
                const proj = await H.sendMessage({ type: 'GET_PROJECT', payload: { projectId: id } });
                const p = proj?.project || project;
                const promptCount = (p.imagePrompts || p.videoPrompts || []).length || 1;

                // Check usage limit before starting (count = total prompts)
                const allowed = await AB_PopupPremium.checkUsageBeforeStart(promptCount);
                if (!allowed) return;

                // Check if another project is already running
                const runStatus = await H.sendMessage({ type: 'GET_ORCHESTRATOR_STATUS' });
                if (runStatus?.running) {
                    H.showNotification(`⚠️ "${runStatus.projectName}" is still running. Stop it first.`, 'error');
                    return;
                }

                const targetTabId = await H.getActiveFlowTabId();
                await H.sendMessage({ type: AB_EVENTS.START_PROJECT, payload: { projectId: id, targetTabId } });
                Nav.showStandaloneView('view-f2v');
                Nav.showF2VProgress();
            });

            item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
                if (confirm(`Delete "${project.name}"?`)) {
                    await H.sendMessage({ type: 'DELETE_PROJECT', payload: { projectId: id } });
                    loadSavedProjects();
                }
            });

            list.appendChild(item);
        }
    }

    // ─── Batch Queue ───
    function initBatchTab() {
        document.getElementById('btn-start-batch')?.addEventListener('click', async () => {
            await H.sendMessage({ type: AB_EVENTS.START_BATCH });
            loadBatchQueue();
        });
        document.getElementById('btn-start-batch-selected')?.addEventListener('click', async () => {
            // Remove unchecked projects, then start
            const checkboxes = document.querySelectorAll('.batch-item-cb');
            const uncheckedIds = [];
            checkboxes.forEach(cb => {
                if (!cb.checked) uncheckedIds.push(cb.dataset.id);
            });
            for (const id of uncheckedIds) {
                await H.sendMessage({ type: 'REMOVE_FROM_BATCH', payload: { projectId: id } });
            }
            await H.sendMessage({ type: AB_EVENTS.START_BATCH });
            loadBatchQueue();
        });
        document.getElementById('btn-pause-batch')?.addEventListener('click', async () => {
            await H.sendMessage({ type: AB_EVENTS.PAUSE_BATCH });
            loadBatchQueue();
        });
        document.getElementById('btn-resume-batch')?.addEventListener('click', async () => {
            await H.sendMessage({ type: AB_EVENTS.RESUME_BATCH });
            loadBatchQueue();
        });
        document.getElementById('btn-stop-batch')?.addEventListener('click', async () => {
            await H.sendMessage({ type: AB_EVENTS.STOP_BATCH });
            loadBatchQueue();
        });
        document.getElementById('btn-clear-batch')?.addEventListener('click', async () => {
            if (!confirm('Clear all projects from batch queue?')) return;
            const queue = await H.sendMessage({ type: 'GET_BATCH_STATUS' });
            if (queue?.projectIds) {
                for (const id of queue.projectIds) {
                    await H.sendMessage({ type: 'REMOVE_FROM_BATCH', payload: { projectId: id } });
                }
            }
            loadBatchQueue();
        });
        document.getElementById('btn-batch-delete-selected')?.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('.batch-item-cb:checked');
            for (const cb of checkboxes) {
                await H.sendMessage({ type: 'REMOVE_FROM_BATCH', payload: { projectId: cb.dataset.id } });
            }
            loadBatchQueue();
        });
        document.getElementById('batch-select-all-cb')?.addEventListener('change', (e) => {
            document.querySelectorAll('.batch-item-cb').forEach(cb => {
                cb.checked = e.target.checked;
            });
        });
    }

    const _STATUS_LABELS = {
        queued: { text: 'Queued', cls: 'badge-muted' },
        running: { text: '▶ Running', cls: 'badge-info' },
        completed: { text: '✅ Done', cls: 'badge-success' },
        error: { text: '❌ Failed', cls: 'badge-danger' },
    };

    async function loadBatchQueue() {
        try {
            const queue = await H.sendMessage({ type: 'GET_BATCH_STATUS' });
            const list = document.getElementById('batch-queue-list');
            const statusBar = document.getElementById('batch-status-bar');
            const statusText = document.getElementById('batch-status-text');

            // Show/hide action buttons based on state
            const isRunning = queue?.isRunning;
            const isPaused = queue?.isPaused;
            document.getElementById('btn-start-batch')?.classList.toggle('hidden', isRunning || isPaused);
            document.getElementById('btn-start-batch-selected')?.classList.toggle('hidden', isRunning || isPaused);
            document.getElementById('btn-pause-batch')?.classList.toggle('hidden', !isRunning || isPaused);
            document.getElementById('btn-resume-batch')?.classList.toggle('hidden', !isPaused);
            document.getElementById('btn-stop-batch')?.classList.toggle('hidden', !isRunning && !isPaused);

            // Waiting countdown
            if (queue?.waitingUntil && queue.waitingUntil > Date.now()) {
                const secsLeft = Math.ceil((queue.waitingUntil - Date.now()) / 1000);
                statusBar?.classList.remove('hidden');
                if (statusText) statusText.textContent = `⏳ Waiting ${secsLeft}s before next project...`;
            } else if (isRunning) {
                statusBar?.classList.remove('hidden');
                if (statusText) statusText.textContent = `▶ Batch running — project ${(queue.currentIndex || 0) + 1} of ${queue.projectIds?.length || 0}`;
            } else {
                statusBar?.classList.add('hidden');
            }

            if (!queue || !queue.projectIds || queue.projectIds.length === 0) {
                list.innerHTML = '<div class="empty-state small">Queue is empty. Add projects from any mode view.</div>';
                return;
            }

            list.innerHTML = '';
            const projects = await H.sendMessage({ type: 'GET_PROJECTS' });

            queue.projectIds.forEach((id, i) => {
                const project = projects[id];
                if (!project) return;

                const ps = queue.projectStatuses[i];
                const st = _STATUS_LABELS[ps?.status] || _STATUS_LABELS.queued;
                const modeBadge = project.mode === 'text-to-video' ? 'T2V' :
                    project.mode === 'create-image' ? 'IMG' : 'F2V';

                const item = document.createElement('div');
                item.className = 'batch-item';
                item.draggable = true;
                item.dataset.id = id;
                item.dataset.index = i;
                item.innerHTML = `
                    <span class="batch-drag-handle" title="Drag to reorder">≡</span>
                    <input type="checkbox" class="batch-item-cb" data-id="${id}" checked>
                    <div class="batch-item-info">
                        <span class="batch-item-name">${H.escapeHtml(project.name)}</span>
                        <div class="batch-item-meta">
                            <span class="badge badge-sm badge-mode">${modeBadge}</span>
                            <span class="badge badge-sm ${st.cls}">${st.text}</span>
                        </div>
                    </div>
                    <div class="batch-item-actions">
                        <button class="icon-btn" title="Load into Editor" data-action="load">✏️</button>
                        <button class="icon-btn" title="Remove" data-action="remove">×</button>
                    </div>
                `;

                // Load into Editor
                item.querySelector('[data-action="load"]').addEventListener('click', () => {
                    if (project.mode === 'text-to-video') {
                        AB_PopupT2VForm.loadProjectIntoT2VForm(project);
                    } else if (project.mode === 'create-image') {
                        AB_PopupCIForm.loadProjectIntoCIForm(project);
                    } else {
                        AB_PopupF2VForm.loadProjectIntoForm(project);
                    }
                    H.showNotification(`Loaded "${project.name}" into editor`, 'success');
                });

                // Remove
                item.querySelector('[data-action="remove"]').addEventListener('click', async () => {
                    await H.sendMessage({ type: 'REMOVE_FROM_BATCH', payload: { projectId: id } });
                    loadBatchQueue();
                });

                // Drag-and-drop
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', i.toString());
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', () => item.classList.remove('dragging'));
                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    item.classList.add('drag-over');
                });
                item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
                item.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    item.classList.remove('drag-over');
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIdx = i;
                    if (fromIdx === toIdx) return;
                    const newOrder = [...queue.projectIds];
                    const [moved] = newOrder.splice(fromIdx, 1);
                    newOrder.splice(toIdx, 0, moved);
                    await H.sendMessage({ type: 'REORDER_BATCH', payload: { projectIds: newOrder } });
                    loadBatchQueue();
                });

                list.appendChild(item);
            });
        } catch (e) {
            console.error('Failed to load batch queue:', e);
        }
    }

    // ─── Diagnostics ───
    function initDiagnosticsTab() {
        document.getElementById('btn-run-diag').addEventListener('click', _runDiagnostics);
        const diagBtn = document.getElementById('btn-diagnostics');
        if (diagBtn) {
            diagBtn.addEventListener('click', () => {
                Nav.showStandaloneView('view-diag');
                _runDiagnostics();
            });
        }
    }

    async function _runDiagnostics() {
        const btn = document.getElementById('btn-run-diag');
        btn.disabled = true;
        btn.textContent = '⏳ Running...';

        try {
            const result = await H.sendMessage({ type: AB_EVENTS.RUN_DIAGNOSTICS });

            if (!result || result.error || result.score === undefined) {
                const errMsg = result?.error || '';
                const friendly = errMsg.includes('Receiving end does not exist')
                    ? 'Content script not loaded — please refresh the Flow tab first'
                    : errMsg.includes('No active Flow tab')
                        ? 'No active Flow tab — open labs.google/fx/tools/flow first'
                        : errMsg || 'Diagnostics failed — is Flow page open?';
                H.showNotification(friendly, 'error');
                btn.disabled = false;
                btn.textContent = '🔍 Run Check';
                return;
            }

            const scoreContainer = document.getElementById('diag-score');
            scoreContainer.classList.remove('hidden');

            const scoreValue = document.getElementById('diag-score-value');
            const scoreLabel = document.getElementById('diag-score-label');
            const criticalLabel = document.getElementById('diag-critical-label');
            const scoreCircle = scoreContainer.querySelector('.score-circle');

            scoreValue.textContent = `${result.score}%`;
            scoreLabel.textContent = result.healthy ? 'All critical selectors found' : 'Some selectors missing';
            criticalLabel.textContent = `Critical: ${result.criticalFound}/${result.criticalTotal}`;

            scoreCircle.className = 'score-circle';
            if (result.score >= 80) scoreCircle.classList.add('healthy');
            else if (result.score >= 50) scoreCircle.classList.add('warning');
            else scoreCircle.classList.add('error');

            const resultsContainer = document.getElementById('diag-results');
            resultsContainer.innerHTML = '';

            for (const [key, r] of Object.entries(result.details)) {
                const item = document.createElement('div');
                item.className = 'diag-item';
                item.innerHTML = `
          <span class="diag-icon">${r.found ? (r.visible ? '🟢' : '🟡') : '🔴'}</span>
          <span class="diag-name">${r.description || key}</span>
          ${r.critical ? '<span class="diag-tag critical">CRITICAL</span>' : '<span class="diag-tag">optional</span>'}
        `;
                resultsContainer.appendChild(item);
            }
        } catch (e) {
            H.showNotification('Diagnostics failed — is Flow page open?', 'error');
        }

        btn.disabled = false;
        btn.textContent = '🔍 Run Check';
    }

    // ─── F2V Progress Tab ───
    let _f2vCompletionHandled = false;

    function initProgressTab() {
        document.getElementById('btn-pause').addEventListener('click', async () => {
            await H.sendMessage({ type: AB_EVENTS.PAUSE_PROJECT });
        });

        document.getElementById('btn-resume').addEventListener('click', async () => {
            const status = await H.sendMessage({ type: 'GET_ORCHESTRATOR_STATUS' });
            if (status?.projectId) {
                await H.sendMessage({ type: AB_EVENTS.RESUME_PROJECT, payload: { projectId: status.projectId } });
            }
        });

        document.getElementById('btn-stop').addEventListener('click', async () => {
            if (confirm('Stop the current project?')) {
                await H.sendMessage({ type: AB_EVENTS.STOP_PROJECT });
            }
        });

        document.getElementById('btn-download-videos').addEventListener('click', () => downloadVideos());
    }

    async function downloadVideos(overrideName, flowUrl) {
        const btn = document.getElementById('btn-download-videos');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Fetching videos...'; }

        const updateBtn = (text) => { if (btn) btn.innerHTML = text; };

        try {
            updateBtn(flowUrl ? '⏳ Opening project...' : '⏳ Fetching videos...');
            const urlsResult = await H.sendMessage({
                type: 'GET_VIDEO_URLS_FOR_DOWNLOAD',
                payload: { flowUrl },
            });
            const videos = urlsResult?.videos || [];

            if (videos.length === 0) {
                H.showNotification('No videos found. Make sure the Flow tab is open on the project.', 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                return;
            }

            const projectName = overrideName || document.getElementById('job-project-name')?.textContent || 'AutoBoom';
            updateBtn(`⏳ Saving ${videos.length} videos...`);

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
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        }
    }

    function updateProgress(status) {
        const noJob = document.getElementById('no-active-job');
        const activeJob = document.getElementById('active-job');
        const progressSection = document.getElementById('f2v-progress-section');
        const isF2VProgressVisible = progressSection && !progressSection.classList.contains('hidden');

        if (!status || !status.running || status.state === 'COMPLETED') {
            if (isF2VProgressVisible && !_f2vCompletionHandled) {
                _f2vCompletionHandled = true;
                if (status?.state === 'COMPLETED') {
                    H.showNotification('🎉 Project completed! Ready for a new one.', 'success');
                    // fetchCredits(); // TODO: re-enable when credits tracking is needed
                }
                AB_PopupF2VForm.resetProjectForm();
                Nav.showF2VProject();
                return;
            }
            noJob.classList.remove('hidden');
            activeJob.classList.add('hidden');
            return;
        }

        _f2vCompletionHandled = false;

        noJob.classList.add('hidden');
        activeJob.classList.remove('hidden');

        document.getElementById('job-project-name').textContent = status.projectName || 'Unknown';

        const phaseBadge = document.getElementById('job-phase');
        const isT2V = status.phase === 'text-to-video';
        if (isT2V) {
            phaseBadge.textContent = 'T2V';
            phaseBadge.className = 'badge badge-success';
        } else {
            phaseBadge.textContent = status.phase === 'images' ? 'IMAGES' : 'VIDEOS';
            phaseBadge.className = `badge ${status.phase === 'images' ? 'badge-info' : 'badge-success'}`;
        }

        let progress = 0;
        if (isT2V) {
            const vidDone = status.videoResults?.filter(r => r.status === 'submitted' || r.status === 'downloaded').length || 0;
            progress = status.totalVideos > 0 ? Math.round((vidDone / status.totalVideos) * 100) : 0;
        } else if (status.phase === 'images') {
            const done = status.imageResults?.filter(r => r.status === 'ready').length || 0;
            progress = status.totalImages > 0 ? Math.round((done / status.totalImages) * 50) : 0;
        } else {
            const imgDone = 50;
            const vidDone = status.videoResults?.filter(r => r.status === 'submitted' || r.status === 'downloaded').length || 0;
            progress = status.totalVideos > 0 ? imgDone + Math.round((vidDone / status.totalVideos) * 50) : imgDone;
        }

        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = `${progress}%`;

        document.getElementById('detail-phase').textContent = status.phase || '—';
        document.getElementById('detail-step').textContent = `${(status.currentIndex || 0) + 1} / ${isT2V ? status.totalVideos : (status.phase === 'images' ? status.totalImages : status.totalVideos)}`;
        document.getElementById('detail-state').textContent = status.state || '—';

        const imgGrid = document.getElementById('image-progress');
        imgGrid.innerHTML = '';
        if (!isT2V) {
            status.imageResults?.forEach((r, i) => {
                const dot = document.createElement('div');
                dot.className = `step-dot ${r.status}`;
                dot.textContent = i + 1;
                dot.title = `Scene ${i + 1}: ${r.status}`;
                imgGrid.appendChild(dot);
            });
        }

        const vidGrid = document.getElementById('video-progress');
        vidGrid.innerHTML = '';
        status.videoResults?.forEach((r, i) => {
            const dot = document.createElement('div');
            dot.className = `step-dot ${r.status}`;
            if (isT2V) {
                dot.textContent = i + 1;
                dot.title = `Prompt ${i + 1}: ${r.status}`;
            } else if (r.startScene === r.endScene) {
                dot.textContent = i + 1;
                dot.title = `Video ${i + 1}: ${r.status}`;
            } else {
                dot.textContent = `${r.startScene}-${r.endScene}`;
                dot.title = `Video ${r.startScene}→${r.endScene}: ${r.status}`;
            }
            vidGrid.appendChild(dot);
        });

        const isPaused = status.state === 'PAUSED';
        const isComplete = status.state === 'COMPLETED';
        document.getElementById('btn-pause').classList.toggle('hidden', isPaused || isComplete);
        document.getElementById('btn-resume').classList.toggle('hidden', !isPaused || isComplete);
        document.getElementById('btn-stop').classList.toggle('hidden', isComplete);

        const hasVideos = status.videoResults?.some(r => r.status === 'submitted' || r.status === 'downloaded') || false;
        document.getElementById('btn-download-videos').classList.toggle('hidden', !(hasVideos || isComplete));
    }

    // ─── History ───
    function initHistoryTab() {
        document.getElementById('btn-clear-history').addEventListener('click', async () => {
            if (!confirm('Clear all run history?')) return;
            await chrome.runtime.sendMessage({ type: AB_EVENTS.CLEAR_RUN_HISTORY });
            loadRunHistory();
        });
        loadRunHistory();
        AB_PopupSettings.initTelegramSettings();
    }

    async function loadRunHistory() {
        try {
            const resp = await chrome.runtime.sendMessage({ type: AB_EVENTS.GET_RUN_HISTORY });
            const history = resp?.history || [];
            _renderHistory(history);
        } catch (e) {
            console.warn('Failed to load run history:', e);
        }
    }

    function _renderHistory(history) {
        const list = document.getElementById('history-list');
        const statsEl = document.getElementById('history-stats');

        if (!history.length) {
            list.innerHTML = '<div class="empty-state small">No runs yet. Run a project to see history.</div>';
            statsEl.classList.add('hidden');
            return;
        }

        statsEl.classList.remove('hidden');
        const completed = history.filter(r => r.status === 'completed').length;
        const avgMs = history.reduce((sum, r) => sum + (r.durationMs || 0), 0) / history.length;

        document.getElementById('stat-total-runs').textContent = history.length;
        document.getElementById('stat-success-rate').textContent = `${Math.round((completed / history.length) * 100)}%`;
        document.getElementById('stat-avg-duration').textContent = H.formatDuration(avgMs);

        list.innerHTML = history.map(run => {
            const date = new Date(run.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const images = `${run.imagesCompleted || 0}/${run.totalImages || 0} imgs`;
            const videos = `${run.videosCompleted || 0}/${run.totalVideos || 0} vids`;
            return `
                <div class="history-item">
                    <div class="history-status-dot ${run.status}"></div>
                    <div class="history-info">
                        <div class="history-name">${H.escapeHtml(run.projectName || 'Unknown')}</div>
                        <div class="history-meta">${date} · ${images} · ${videos}${run.error ? ' · ❌ ' + H.escapeHtml(run.error.substring(0, 40)) : ''}</div>
                    </div>
                    <div class="history-duration">${H.formatDuration(run.durationMs)}</div>
                </div>`;
        }).join('');
    }

    // ─── Connection & Credits ───
    async function checkConnection() {
        try {
            const response = await H.sendMessage({ type: AB_EVENTS.GET_PAGE_STATUS });
            if (response) {
                _setConnected(true, response.onFlowPage ? 'Connected to Flow' : 'Flow page not open');
            } else {
                _setConnected(false, 'Extension service not responding');
            }
        } catch (e) {
            _setConnected(false, 'Not connected');
        }
    }

    async function fetchCredits() {
        try {
            const tabs = await chrome.tabs.query({ url: ['*://labs.google/flow/*', '*://labs.google/fx/*'] });
            if (!tabs || !tabs.length) return;

            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: AB_EVENTS.EXECUTE_ACTION,
                    payload: { action: AB_ACTIONS.GET_CREDITS, params: {} },
                }, (resp) => {
                    if (chrome.runtime.lastError) resolve(null);
                    else resolve(resp);
                });
            });

            const badge = document.getElementById('credits-badge');
            if (response?.credits) {
                const formatted = Number(response.credits).toLocaleString();
                badge.textContent = `💎 ${formatted}`;
                badge.title = `${formatted} AI Credits`;
                badge.classList.remove('hidden');
            }
        } catch (e) { /* silently ignore */ }
    }

    function _setConnected(connected, text) {
        const bar = document.getElementById('connection-status');
        const label = document.getElementById('status-text');
        bar.className = `status-bar ${connected ? 'status-connected' : 'status-disconnected'}`;
        label.textContent = text;
    }

    // ─── Session Recovery ───
    async function checkForRecovery() {
        try {
            const resp = await chrome.runtime.sendMessage({ type: 'GET_INTERRUPTED_JOBS' });
            const jobs = resp?.jobs || [];
            if (jobs.length === 0) return;

            const statusResp = await H.sendMessage({ type: AB_EVENTS.GET_ORCHESTRATOR_STATUS });
            if (statusResp && !statusResp.running) {
                const state = statusResp.state || '';
                if (!state || state === 'COMPLETED' || state === 'ERROR' || state === 'IDLE') {
                    await chrome.runtime.sendMessage({ type: 'CLEAR_INTERRUPTED_JOBS' });
                    return;
                }
            }

            const job = jobs[0];
            const banner = document.getElementById('recovery-banner');
            const details = document.getElementById('recovery-details');

            details.textContent = `"${job.projectName}" — ${job.imagesCompleted}/${job.totalImages} images, ${job.phase} phase`;
            banner.classList.remove('hidden');

            document.getElementById('btn-recovery-resume').addEventListener('click', async () => {
                banner.classList.add('hidden');
                await chrome.runtime.sendMessage({ type: 'CLEAR_INTERRUPTED_JOBS' });
                await chrome.runtime.sendMessage({ type: AB_EVENTS.RESUME_PROJECT, payload: { projectId: job.projectId } });
                Nav.showF2VProgress();
            });

            document.getElementById('btn-recovery-dismiss').addEventListener('click', async () => {
                banner.classList.add('hidden');
                await chrome.runtime.sendMessage({ type: 'CLEAR_INTERRUPTED_JOBS' });
            });
        } catch (e) {
            // Silently ignore recovery check failures
        }
    }

    // ─── State Polling ───
    function startStatePolling() {
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === AB_EVENTS.STATE_UPDATE) {
                updateProgress(message.payload);
                AB_PopupT2VForm.updateT2VProgress(message.payload);
                AB_PopupCIForm.updateCIProgress(message.payload);
            }
            if (message.type === AB_EVENTS.BATCH_UPDATE) {
                loadBatchQueue();
            }
        });

        setInterval(async () => {
            try {
                const status = await H.sendMessage({ type: 'GET_ORCHESTRATOR_STATUS' });
                updateProgress(status);
                AB_PopupT2VForm.updateT2VProgress(status);
                AB_PopupCIForm.updateCIProgress(status);
            } catch (e) { /* ignore */ }
        }, 2000);
    }

    return {
        initSavedProjectsControls,
        loadSavedProjects,
        initBatchTab,
        loadBatchQueue,
        initDiagnosticsTab,
        initProgressTab,
        initHistoryTab,
        loadRunHistory,
        checkConnection,
        checkForRecovery,
        startStatePolling,
        updateProgress,
        downloadVideos,
    };
})();
