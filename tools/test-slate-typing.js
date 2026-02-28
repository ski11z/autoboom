/**
 * PASTE THIS INTO DEVTOOLS CONSOLE ON THE FLOW EDITOR PAGE
 * Tests different methods to type into the Slate.js editor
 */
(async function testSlateTyping() {
    const TEST_TEXT = 'AUTOBOOM_TEST_PROMPT_123';
    const editor = document.querySelector('[data-slate-editor="true"]');

    if (!editor) {
        console.error('❌ Slate editor not found!');
        return;
    }

    console.log('═══ SLATE TYPING DIAGNOSTIC ═══');
    console.log('Editor found:', editor.tagName, editor.className.substring(0, 40));

    // Check placeholder before
    const placeholderBefore = editor.querySelector('[data-slate-placeholder]');
    console.log('Placeholder visible before:', !!placeholderBefore);
    console.log('Text before:', JSON.stringify(editor.textContent.substring(0, 60)));

    // === METHOD 1: Direct execCommand ===
    console.log('\n--- METHOD 1: execCommand insertText ---');
    editor.focus();
    await new Promise(r => setTimeout(r, 300));
    document.execCommand('selectAll', false, null);
    await new Promise(r => setTimeout(r, 100));
    const result1 = document.execCommand('insertText', false, TEST_TEXT);
    await new Promise(r => setTimeout(r, 500));

    const placeholder1 = editor.querySelector('[data-slate-placeholder]');
    const text1 = editor.textContent.trim();
    console.log('  execCommand returned:', result1);
    console.log('  Text in DOM:', JSON.stringify(text1.substring(0, 60)));
    console.log('  Placeholder still visible:', !!placeholder1);
    console.log('  ✅ TEXT REGISTERED IN SLATE:', !placeholder1 && text1.includes(TEST_TEXT));

    // Clean up for next test
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 300));

    // === METHOD 2: Simulated click + execCommand ===
    console.log('\n--- METHOD 2: Real click events + execCommand ---');
    const rect = editor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const props = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

    editor.dispatchEvent(new PointerEvent('pointerdown', { ...props, pointerId: 1 }));
    editor.dispatchEvent(new MouseEvent('mousedown', props));
    editor.dispatchEvent(new PointerEvent('pointerup', { ...props, pointerId: 1 }));
    editor.dispatchEvent(new MouseEvent('mouseup', props));
    editor.dispatchEvent(new MouseEvent('click', props));
    await new Promise(r => setTimeout(r, 500));
    editor.focus();
    await new Promise(r => setTimeout(r, 300));

    document.execCommand('selectAll', false, null);
    await new Promise(r => setTimeout(r, 100));
    const result2 = document.execCommand('insertText', false, TEST_TEXT);
    await new Promise(r => setTimeout(r, 500));

    const placeholder2 = editor.querySelector('[data-slate-placeholder]');
    const text2 = editor.textContent.trim();
    console.log('  execCommand returned:', result2);
    console.log('  Text in DOM:', JSON.stringify(text2.substring(0, 60)));
    console.log('  Placeholder still visible:', !!placeholder2);
    console.log('  ✅ TEXT REGISTERED IN SLATE:', !placeholder2 && text2.includes(TEST_TEXT));

    // Clean up
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 300));

    // === METHOD 3: InputEvent dispatch ===
    console.log('\n--- METHOD 3: InputEvent with insertText ---');
    editor.focus();
    await new Promise(r => setTimeout(r, 300));

    const beforeInputEvent = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: TEST_TEXT,
        bubbles: true,
        cancelable: true,
    });
    editor.dispatchEvent(beforeInputEvent);
    await new Promise(r => setTimeout(r, 500));

    const placeholder3 = editor.querySelector('[data-slate-placeholder]');
    const text3 = editor.textContent.trim();
    console.log('  Text in DOM:', JSON.stringify(text3.substring(0, 60)));
    console.log('  Placeholder still visible:', !!placeholder3);
    console.log('  ✅ TEXT REGISTERED IN SLATE:', !placeholder3 && text3.includes(TEST_TEXT));

    // Clean up
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 300));

    // === METHOD 4: Clipboard paste ===
    console.log('\n--- METHOD 4: ClipboardEvent paste ---');
    editor.focus();
    await new Promise(r => setTimeout(r, 300));

    const dt = new DataTransfer();
    dt.setData('text/plain', TEST_TEXT);
    const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
    });
    editor.dispatchEvent(pasteEvent);
    await new Promise(r => setTimeout(r, 500));

    const placeholder4 = editor.querySelector('[data-slate-placeholder]');
    const text4 = editor.textContent.trim();
    console.log('  Text in DOM:', JSON.stringify(text4.substring(0, 60)));
    console.log('  Placeholder still visible:', !!placeholder4);
    console.log('  ✅ TEXT REGISTERED IN SLATE:', !placeholder4 && text4.includes(TEST_TEXT));

    console.log('\n═══ END DIAGNOSTIC ═══');
    console.log('Summary: Copy and paste ALL the output above to the developer.');
})();
