/**
 * AutoBoom — Notifications Module
 * Sends notifications via Telegram Bot API, Discord Webhooks, and generic HTTP webhooks.
 */

const AB_Notifications = (() => {
    const MODULE = 'Notifications';

    // ─── Telegram ───

    async function _sendTelegram(botToken, chatId, text) {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
            }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Telegram API error: ${err.description || response.statusText}`);
        }
        return await response.json();
    }

    // ─── Discord ───

    async function _sendDiscord(webhookUrl, title, description, color) {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title,
                    description,
                    color: color || 0x5865F2, // Discord blurple
                    footer: { text: 'AutoBoom' },
                    timestamp: new Date().toISOString(),
                }],
            }),
        });
        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`Discord webhook error: ${response.status} ${err.substring(0, 200)}`);
        }
    }

    // ─── Generic HTTP Webhook ───

    async function _sendWebhook(url, payload, headers = {}) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`Webhook error: ${response.status} ${err.substring(0, 200)}`);
        }
    }

    // ─── High-level Notification Functions ───

    async function notifyProjectCompleted(project, progress) {
        const allSettings = await _getAllSettings();

        const duration = progress.startedAt
            ? _formatDuration(Date.now() - progress.startedAt)
            : 'unknown';

        const imgDone = progress.imageResults?.filter(r => r.status === 'ready').length || 0;
        const imgTotal = progress.totalImages || 0;
        const vidDone = progress.videoResults?.filter(r => r.status === 'submitted' || r.status === 'downloaded').length || 0;
        const vidTotal = progress.totalVideos || 0;
        const imgErr = progress.imageResults?.filter(r => r.status === 'error').length || 0;
        const vidErr = progress.videoResults?.filter(r => r.status === 'error').length || 0;
        const hasErrors = imgErr > 0 || vidErr > 0;

        // ── Telegram ──
        if (allSettings.telegram.enabled) {
            const emoji = hasErrors ? '⚠️' : '✅';
            const lines = [
                `${emoji} *AutoBoom — Project ${hasErrors ? 'Completed with Errors' : 'Completed'}*`,
                ``,
                `📋 *${project.name}*`,
                `🖼 Images: ${imgDone}/${imgTotal}${imgErr ? ` (${imgErr} failed)` : ''}`,
                `🎬 Videos: ${vidDone}/${vidTotal}${vidErr ? ` (${vidErr} failed)` : ''}`,
                `⏱ Duration: ${duration}`,
            ];
            if (project.flowUrl) lines.push(``, `🔗 [Open in Flow](${project.flowUrl})`);
            try {
                await _sendTelegram(allSettings.telegram.botToken, allSettings.telegram.chatId, lines.join('\n'));
                AB_Logger.info(MODULE, 'Telegram notification sent (completed)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Telegram notification failed:', e.message);
            }
        }

        // ── Discord ──
        if (allSettings.discord.enabled) {
            const color = hasErrors ? 0xFFA500 : 0x43B581; // orange or green
            const desc = [
                `**${project.name}**`,
                `🖼 Images: ${imgDone}/${imgTotal}${imgErr ? ` (${imgErr} failed)` : ''}`,
                `🎬 Videos: ${vidDone}/${vidTotal}${vidErr ? ` (${vidErr} failed)` : ''}`,
                `⏱ Duration: ${duration}`,
            ];
            if (project.flowUrl) desc.push(`[Open in Flow](${project.flowUrl})`);
            try {
                await _sendDiscord(allSettings.discord.webhookUrl,
                    hasErrors ? '⚠️ Project Completed with Errors' : '✅ Project Completed',
                    desc.join('\n'), color);
                AB_Logger.info(MODULE, 'Discord notification sent (completed)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Discord notification failed:', e.message);
            }
        }

        // ── Generic Webhook ──
        if (allSettings.webhook.enabled) {
            try {
                await _sendWebhook(allSettings.webhook.url, {
                    event: hasErrors ? 'project.completed_with_errors' : 'project.completed',
                    project: { id: project.id, name: project.name, flowUrl: project.flowUrl },
                    stats: { imgDone, imgTotal, imgErr, vidDone, vidTotal, vidErr, duration },
                    timestamp: new Date().toISOString(),
                }, _parseHeaders(allSettings.webhook.headers));
                AB_Logger.info(MODULE, 'Webhook notification sent (completed)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Webhook notification failed:', e.message);
            }
        }
    }

    async function notifyProjectError(project, progress, errorMsg) {
        const allSettings = await _getAllSettings();

        const imgDone = progress.imageResults?.filter(r => r.status === 'ready').length || 0;
        const imgTotal = progress.totalImages || 0;

        // ── Telegram ──
        if (allSettings.telegram.enabled) {
            const lines = [
                `❌ *AutoBoom — Project Failed*`,
                ``,
                `📋 *${project.name}*`,
                `💥 Error: ${errorMsg || 'Unknown error'}`,
                `🖼 Images done: ${imgDone}/${imgTotal}`,
            ];
            if (project.flowUrl) lines.push(``, `🔗 [Open in Flow](${project.flowUrl})`);
            try {
                await _sendTelegram(allSettings.telegram.botToken, allSettings.telegram.chatId, lines.join('\n'));
                AB_Logger.info(MODULE, 'Telegram notification sent (error)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Telegram notification failed:', e.message);
            }
        }

        // ── Discord ──
        if (allSettings.discord.enabled) {
            const desc = [
                `**${project.name}**`,
                `💥 Error: ${errorMsg || 'Unknown error'}`,
                `🖼 Images done: ${imgDone}/${imgTotal}`,
            ];
            if (project.flowUrl) desc.push(`[Open in Flow](${project.flowUrl})`);
            try {
                await _sendDiscord(allSettings.discord.webhookUrl, '❌ Project Failed', desc.join('\n'), 0xED4245);
                AB_Logger.info(MODULE, 'Discord notification sent (error)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Discord notification failed:', e.message);
            }
        }

        // ── Generic Webhook ──
        if (allSettings.webhook.enabled) {
            try {
                await _sendWebhook(allSettings.webhook.url, {
                    event: 'project.error',
                    project: { id: project.id, name: project.name, flowUrl: project.flowUrl },
                    error: errorMsg || 'Unknown error',
                    stats: { imgDone, imgTotal },
                    timestamp: new Date().toISOString(),
                }, _parseHeaders(allSettings.webhook.headers));
                AB_Logger.info(MODULE, 'Webhook notification sent (error)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Webhook notification failed:', e.message);
            }
        }
    }

    // ─── Test Functions ───

    async function sendTestMessage(botToken, chatId) {
        const msg = `🧪 *AutoBoom Test*\n\nYour Telegram notifications are working! 🎉`;
        await _sendTelegram(botToken, chatId, msg);
        return { success: true };
    }

    async function sendDiscordTest(webhookUrl) {
        await _sendDiscord(webhookUrl, '🧪 AutoBoom Test', 'Your Discord notifications are working! 🎉', 0x5865F2);
        return { success: true };
    }

    async function sendWebhookTest(url, headers) {
        await _sendWebhook(url, {
            event: 'test',
            message: 'AutoBoom webhook test — working!',
            timestamp: new Date().toISOString(),
        }, _parseHeaders(headers));
        return { success: true };
    }

    // ─── Settings Helpers ───

    async function _getAllSettings() {
        try {
            const result = await chrome.storage.local.get(['ab_telegram', 'ab_discord', 'ab_webhook']);
            const tg = result.ab_telegram || {};
            const dc = result.ab_discord || {};
            const wh = result.ab_webhook || {};
            return {
                telegram: {
                    enabled: tg.enabled || false,
                    botToken: tg.botToken || '',
                    chatId: tg.chatId || '',
                },
                discord: {
                    enabled: dc.enabled || false,
                    webhookUrl: dc.webhookUrl || '',
                },
                webhook: {
                    enabled: wh.enabled || false,
                    url: wh.url || '',
                    headers: wh.headers || '',
                },
            };
        } catch (e) {
            return {
                telegram: { enabled: false, botToken: '', chatId: '' },
                discord: { enabled: false, webhookUrl: '' },
                webhook: { enabled: false, url: '', headers: '' },
            };
        }
    }

    /**
     * Parse header string "Key: Value\nKey2: Value2" into an object.
     */
    function _parseHeaders(headerStr) {
        if (!headerStr) return {};
        const headers = {};
        headerStr.split('\n').forEach(line => {
            const idx = line.indexOf(':');
            if (idx > 0) {
                headers[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
            }
        });
        return headers;
    }

    function _formatDuration(ms) {
        if (!ms || ms < 0) return '—';
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return `${secs}s`;
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        if (mins < 60) return `${mins}m ${remSecs}s`;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hrs}h ${remMins}m`;
    }

    /**
     * Notify about a policy violation during image generation.
     * @param {object} project - Project data
     * @param {number} imageIndex - 0-based image index
     * @param {string} originalPrompt - The original prompt that was rejected
     * @param {string|null} rewrittenPrompt - The AI-rewritten prompt (null if not attempted or failed)
     * @param {boolean} recovered - Whether recovery ultimately succeeded
     */
    async function notifyPolicyViolation(project, imageIndex, originalPrompt, rewrittenPrompt, recovered) {
        const allSettings = await _getAllSettings();

        // ── Telegram ──
        if (allSettings.telegram.enabled) {
            const emoji = recovered ? '✅' : '❌';
            const lines = [
                `⚠️ *AutoBoom — Policy Violation*`,
                ``,
                `📋 *${project.name}*`,
                `🖼 Image ${imageIndex + 1}/${project.imagePrompts?.length || '?'}`,
                ``,
                `📝 *Original prompt:*`,
                `\`${originalPrompt?.substring(0, 300) || 'N/A'}\``,
            ];
            if (rewrittenPrompt) {
                lines.push(``, `🤖 *AI-rewritten prompt:*`, `\`${rewrittenPrompt.substring(0, 300)}\``);
            }
            lines.push(``, `${emoji} Recovery: ${recovered ? 'Succeeded' : 'Failed'}`);
            if (project.flowUrl) lines.push(``, `🔗 [Open in Flow](${project.flowUrl})`);

            try {
                await _sendTelegram(allSettings.telegram.botToken, allSettings.telegram.chatId, lines.join('\n'));
                AB_Logger.info(MODULE, 'Telegram notification sent (policy violation)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Telegram notification failed:', e.message);
            }
        }

        // ── Discord ──
        if (allSettings.discord.enabled) {
            const desc = [
                `**${project.name}** — Image ${imageIndex + 1}`,
                `**Original:** ${originalPrompt?.substring(0, 200) || 'N/A'}`,
            ];
            if (rewrittenPrompt) desc.push(`**AI Rewrite:** ${rewrittenPrompt.substring(0, 200)}`);
            desc.push(`**Recovery:** ${recovered ? '✅ Succeeded' : '❌ Failed'}`);
            try {
                await _sendDiscord(allSettings.discord.webhookUrl,
                    '⚠️ Policy Violation', desc.join('\n'), recovered ? 0xFFA500 : 0xED4245);
                AB_Logger.info(MODULE, 'Discord notification sent (policy violation)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Discord notification failed:', e.message);
            }
        }

        // ── Webhook ──
        if (allSettings.webhook.enabled) {
            try {
                await _sendWebhook(allSettings.webhook.url, {
                    event: 'policy_violation',
                    project: { id: project.id, name: project.name, flowUrl: project.flowUrl },
                    imageIndex,
                    originalPrompt,
                    rewrittenPrompt,
                    recovered,
                    timestamp: new Date().toISOString(),
                }, _parseHeaders(allSettings.webhook.headers));
                AB_Logger.info(MODULE, 'Webhook notification sent (policy violation)');
            } catch (e) {
                AB_Logger.warn(MODULE, 'Webhook notification failed:', e.message);
            }
        }
    }

    return {
        notifyProjectCompleted, notifyProjectError, notifyPolicyViolation,
        sendTestMessage, sendDiscordTest, sendWebhookTest,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Notifications = AB_Notifications;
}
