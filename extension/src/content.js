import prompts from '../prompts.json';

const SENSITIVE_TYPES = ['password', 'email', 'tel', 'credit-card', 'ssn'];
const SENSITIVE_AUTOCOMPLETE = ['current-password', 'new-password', 'cc-number', 'cc-csc', 'cc-exp'];

let tooltip = null;
let currentTarget = null;
let currentSelection = null;

function isSensitiveField(element) {
  if (!element) return true;

  const type = element.type?.toLowerCase();
  if (SENSITIVE_TYPES.includes(type)) return true;

  const autocomplete = element.autocomplete?.toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE.some(s => autocomplete?.includes(s))) return true;

  const name = (element.name || '').toLowerCase();
  const id = (element.id || '').toLowerCase();
  const placeholder = (element.placeholder || '').toLowerCase();

  const sensitivePatterns = ['password', 'passwd', 'secret', 'token', 'apikey', 'api_key', 'credit', 'cvv', 'ssn'];
  return sensitivePatterns.some(p => name.includes(p) || id.includes(p) || placeholder.includes(p));
}

function isEditableElement(element) {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  if (tagName === 'input' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden'].includes(element.type)) return true;
  if (tagName === 'textarea') return true;
  if (element.isContentEditable) return true;
  return false;
}

function getSelectionContext(element) {
  if (element.isContentEditable) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const fullText = container.textContent || '';
      const selectedText = selection.toString();

      const tempRange = document.createRange();
      tempRange.selectNodeContents(container);
      tempRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = tempRange.toString();

      const textAfter = fullText.substring(textBefore.length + selectedText.length);

      return {
        selected: selectedText,
        before: textBefore.slice(-500),
        after: textAfter.slice(0, 500),
        start: null,
        end: null,
        isContentEditable: true
      };
    }
    return null;
  }

  const start = element.selectionStart;
  const end = element.selectionEnd;
  if (start !== end && start !== null && end !== null) {
    const fullText = element.value;
    const selected = fullText.substring(start, end);
    if (selected.trim()) {
      return {
        selected,
        before: fullText.substring(Math.max(0, start - 500), start),
        after: fullText.substring(end, end + 500),
        start,
        end,
        isContentEditable: false
      };
    }
  }
  return null;
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['customPrompts'], result => {
      resolve({
        customPrompts: result.customPrompts || []
      });
    });
  });
}

function extractPageContext() {
  const title = document.title || '';
  const url = window.location.href;
  let text = document.body.innerText || document.body.textContent || '';

  const maxLength = 8000;
  if (text.length > maxLength) {
    text = text.substring(text.length - maxLength);
  }

  console.log('[DraftyFox] Page context:', { title, url, textLength: text.length });

  return { title, url, text };
}

async function processText(selectionContext, actionPrompt) {
  const pageContext = extractPageContext();

  return new Promise((resolve, reject) => {
    try {
      if (!chrome.runtime?.id) {
        reject(new Error('Extension updated. Please refresh the page.'));
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: 'processText',
          selectionContext,
          actionPrompt,
          systemPrompt: prompts.systemPrompt,
          pageContext
        },
        response => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message;
            if (msg.includes('Extension context invalidated') || msg.includes('Receiving end does not exist')) {
              reject(new Error('Extension updated. Please refresh the page.'));
            } else {
              reject(new Error(msg));
            }
          } else if (response?.success) {
            resolve(response.result);
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        }
      );
    } catch (e) {
      reject(new Error('Extension updated. Please refresh the page.'));
    }
  });
}

function replaceText(element, selectionContext, newText) {
  if (selectionContext.isContentEditable) {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
      range.collapse(false);
    }
  } else {
    const before = element.value.substring(0, selectionContext.start);
    const after = element.value.substring(selectionContext.end);
    element.value = before + newText + after;
    element.selectionStart = selectionContext.start;
    element.selectionEnd = selectionContext.start + newText.length;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function createTooltip(x, y, selectionContext, element) {
  removeTooltip();

  tooltip = document.createElement('div');
  tooltip.className = 'draftyfox-tooltip';

  const actions = prompts.actions;
  const rows = [];
  let currentRow = document.createElement('div');
  currentRow.className = 'draftyfox-tooltip-row';

  actions.forEach((action, i) => {
    if (i > 0 && i % 2 === 0) {
      rows.push(currentRow);
      currentRow = document.createElement('div');
      currentRow.className = 'draftyfox-tooltip-row';
    }
    const btn = document.createElement('button');
    btn.className = 'draftyfox-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => handleAction(action.prompt, selectionContext, element));
    currentRow.appendChild(btn);
  });
  rows.push(currentRow);
  rows.forEach(row => tooltip.appendChild(row));

  const customBtn = document.createElement('button');
  customBtn.className = 'draftyfox-btn draftyfox-btn-custom';
  customBtn.textContent = '+ Custom';
  customBtn.addEventListener('click', () => showCustomInput(selectionContext, element));
  tooltip.appendChild(customBtn);

  getSettings().then(settings => {
    if (settings.customPrompts.length > 0) {
      const savedSection = document.createElement('div');
      savedSection.className = 'draftyfox-saved-prompts';

      const label = document.createElement('div');
      label.className = 'draftyfox-saved-label';
      label.textContent = 'Saved';
      savedSection.appendChild(label);

      const savedRow = document.createElement('div');
      savedRow.className = 'draftyfox-tooltip-row';

      settings.customPrompts.slice(0, 4).forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'draftyfox-btn draftyfox-btn-saved';
        btn.textContent = p.name;
        btn.title = p.prompt;
        btn.addEventListener('click', () => handleAction(p.prompt, selectionContext, element));
        savedRow.appendChild(btn);
      });

      savedSection.appendChild(savedRow);
      tooltip.appendChild(savedSection);
    }
  });

  document.body.appendChild(tooltip);

  const rect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;

  let left = x - rect.width / 2;
  let top = y - rect.height - 10;

  if (left + rect.width > viewportWidth - 10) {
    left = viewportWidth - rect.width - 10;
  }
  if (left < 10) left = 10;

  if (top < 10) {
    top = y + 30;
  }

  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top = `${top + window.scrollY}px`;

  currentTarget = element;
  currentSelection = selectionContext;
}

function showCustomInput(selectionContext, element) {
  if (!tooltip) return;

  const existing = tooltip.querySelector('.draftyfox-custom-row');
  if (existing) {
    existing.querySelector('input').focus();
    return;
  }

  const row = document.createElement('div');
  row.className = 'draftyfox-custom-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'draftyfox-custom-input';
  input.placeholder = 'Enter custom instruction...';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'draftyfox-btn draftyfox-btn-submit';
  submitBtn.textContent = 'Go';

  const handleSubmit = () => {
    const prompt = input.value.trim();
    if (prompt) {
      handleAction(prompt, selectionContext, element);
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') removeTooltip();
  });

  submitBtn.addEventListener('click', handleSubmit);

  row.appendChild(input);
  row.appendChild(submitBtn);
  tooltip.appendChild(row);

  input.focus();
}

async function handleAction(actionPrompt, selectionContext, element) {
  if (!tooltip) return;

  const originalContent = tooltip.innerHTML;
  tooltip.innerHTML = '<div class="draftyfox-loading"><div class="draftyfox-spinner"></div>Processing...</div>';

  try {
    const result = await processText(selectionContext, actionPrompt);
    replaceText(element, selectionContext, result);
    removeTooltip();
  } catch (error) {
    tooltip.innerHTML = originalContent;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'draftyfox-error';
    errorDiv.textContent = error.message || 'Failed to process text';
    tooltip.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }
}

function removeTooltip() {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
  currentTarget = null;
  currentSelection = null;
}

function getSelectionPosition(element) {
  if (element.isContentEditable) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top };
    }
  }

  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  const lineHeight = parseInt(computedStyle.lineHeight) || parseInt(computedStyle.fontSize) * 1.2 || 20;
  const paddingTop = parseInt(computedStyle.paddingTop) || 0;
  const paddingLeft = parseInt(computedStyle.paddingLeft) || 0;

  const text = element.value.substring(0, element.selectionStart);
  const lines = text.split('\n');
  const currentLineIndex = lines.length - 1;

  const y = rect.top + paddingTop + (currentLineIndex * lineHeight);
  const x = rect.left + paddingLeft + 50;

  return { x, y };
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    removeTooltip();
    return;
  }

  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'm') {
    e.preventDefault();

    const activeElement = document.activeElement;
    console.log('[DraftyFox] Hotkey pressed, active element:', activeElement?.tagName, activeElement);

    if (!isEditableElement(activeElement) || isSensitiveField(activeElement)) {
      console.log('[DraftyFox] Not an editable element or sensitive field');
      return;
    }

    const selectionContext = getSelectionContext(activeElement);
    console.log('[DraftyFox] Selection context:', selectionContext);

    if (!selectionContext) {
      console.log('[DraftyFox] No selection found');
      return;
    }

    const pos = getSelectionPosition(activeElement);
    createTooltip(pos.x, pos.y, selectionContext, activeElement);
  }
});

document.addEventListener('mousedown', e => {
  if (tooltip && !tooltip.contains(e.target)) {
    removeTooltip();
  }
});

document.addEventListener('scroll', removeTooltip, true);
