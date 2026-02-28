/**
 * AutoBoom — Upload Actions
 * Simulates file uploads via hidden inputs and drag-and-drop.
 */

const AB_Upload = (() => {

    /**
     * Upload a file through the hidden file input.
     * @param {File|Blob} file - File to upload
     * @param {string} [inputSelector] - Optional specific file input selector key
     */
    async function uploadViaFileInput(file, inputSelector = 'FILE_INPUT') {
        try {
            const input = await AB_DomBridge.queryOne(inputSelector, { timeout: 5000 });
            const dt = new DataTransfer();
            dt.items.add(file instanceof File ? file : new File([file], 'image.png', { type: file.type || 'image/png' }));
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));

            AB_Logger.info('Upload', 'File uploaded via input', { name: file.name || 'image.png' });
            await _sleep(1500);

            return { success: true };
        } catch (err) {
            AB_Logger.error('Upload', 'Upload via file input failed', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Upload by simulating drag-and-drop onto a target element.
     * @param {File|Blob} file - File to upload
     * @param {string} targetSelectorKey - Selector key of the drop target
     */
    async function uploadViaDragDrop(file, targetSelectorKey) {
        try {
            const target = await AB_DomBridge.queryOne(targetSelectorKey, { timeout: 5000 });
            const fileObj = file instanceof File ? file : new File([file], 'image.png', { type: file.type || 'image/png' });

            const dt = new DataTransfer();
            dt.items.add(fileObj);

            // Simulate full drag-and-drop event sequence
            const events = ['dragenter', 'dragover', 'drop'];
            for (const eventType of events) {
                const event = new DragEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dt,
                });
                target.dispatchEvent(event);
                await _sleep(100);
            }

            AB_Logger.info('Upload', 'File uploaded via drag-and-drop', { target: targetSelectorKey });
            await _sleep(1500);

            return { success: true };
        } catch (err) {
            AB_Logger.error('Upload', 'Drag-and-drop upload failed', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Download an image from a URL/blob and return as a File object.
     * Used for the reference image fallback (download previous image, re-upload).
     */
    async function fetchAsFile(url, filename = 'image.png') {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new File([blob], filename, { type: blob.type || 'image/png' });
        } catch (err) {
            AB_Logger.error('Upload', 'Failed to fetch image as file', { url, error: err.message });
            throw err;
        }
    }

    /**
     * Click an upload slot/button to trigger the file chooser, then intercept the file input.
     * @param {string} slotSelectorKey - The upload slot button to click
     * @param {File} file - File to upload
     */
    async function clickSlotAndUpload(slotSelectorKey, file) {
        try {
            // Click the upload slot to trigger file input
            await AB_DomBridge.click(slotSelectorKey);
            await _sleep(500);

            // Find the file input that appeared and set its files
            return await uploadViaFileInput(file);
        } catch (err) {
            AB_Logger.error('Upload', 'Click-and-upload failed', err.message);
            return { success: false, error: err.message };
        }
    }

    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    return { uploadViaFileInput, uploadViaDragDrop, fetchAsFile, clickSlotAndUpload };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_Upload = AB_Upload;
}
