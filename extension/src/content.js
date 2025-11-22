const SENSITIVE_TYPES = ['password', 'email', 'tel', 'credit-card', 'ssn'];
const SENSITIVE_AUTOCOMPLETE = ['current-password', 'new-password', 'cc-number', 'cc-csc', 'cc-exp'];

const ACTIONS = [
  { id: 'paraphrase', label: 'Paraphrase', prompt: 'Paraphrase the following text while keeping the same meaning. Return only the paraphrased text, nothing else.' },
  { id: 'shorten', label: 'Shorten', prompt: 'Shorten the following text while preserving its core meaning. Be concise. Return only the shortened text, nothing else.' },
  { id: 'expand', label: 'Expand', prompt: 'Expand the following text with more detail and context. Return only the expanded text, nothing else.' },
  { id: 'improve', label: 'Improve', prompt: 'Improve the phrasing and clarity of the following text. Fix grammar and make it more professional. Return only the improved text, nothing else.' }
];

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

  const sensitivePatterns = ['password', 'passwd', 'secret', 'token', 'apikey', 'api_key', 'credit', 'card', 'cvv', 'ssn', 'social'];
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

function getSelectedTextInEditable(element) {
  if (element.isContentEditable) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && selection.toString().trim()) {
      return { text: selection.toString(), start: null, end: null, isContentEditable: true };
    }
    return null;
  }

  const start = element.selectionStart;
  const end = element.selectionEnd;
  if (start !== end && start !== null && end !== null) {
    const text = element.value.substring(start, end);
    if (text.trim()) {
      return { text, start, end, isContentEditable: false };
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

async function processText(text, systemPrompt) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'processText', text, prompt: systemPrompt },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
}

function replaceText(element, selection, newText) {
  if (selection.isContentEditable) {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
      range.collapse(false);
    }
  } else {
    const before = element.value.substring(0, selection.start);
    const after = element.value.substring(selection.end);
    element.value = before + newText + after;
    element.selectionStart = selection.start;
    element.selectionEnd = selection.start + newText.length;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function createTooltip(x, y, selection, element) {
  removeTooltip();

  tooltip = document.createElement('div');
  tooltip.className = 'draftyfox-tooltip';

  const row1 = document.createElement('div');
  row1.className = 'draftyfox-tooltip-row';

  const row2 = document.createElement('div');
  row2.className = 'draftyfox-tooltip-row';

  ACTIONS.forEach((action, i) => {
    const btn = document.createElement('button');
    btn.className = 'draftyfox-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => handleAction(action.prompt, selection, element, btn));
    (i < 2 ? row1 : row2).appendChild(btn);
  });

  tooltip.appendChild(row1);
  tooltip.appendChild(row2);

  const customBtn = document.createElement('button');
  customBtn.className = 'draftyfox-btn draftyfox-btn-custom';
  customBtn.textContent = '+ Custom';
  customBtn.addEventListener('click', () => showCustomInput(selection, element));
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
        btn.addEventListener('click', () => handleAction(p.prompt, selection, element, btn));
        savedRow.appendChild(btn);
      });

      savedSection.appendChild(savedRow);
      tooltip.appendChild(savedSection);
    }
  });

  document.body.appendChild(tooltip);

  const rect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x;
  let top = y + 10;

  if (left + rect.width > viewportWidth - 10) {
    left = viewportWidth - rect.width - 10;
  }
  if (left < 10) left = 10;

  if (top + rect.height > viewportHeight - 10) {
    top = y - rect.height - 10;
  }

  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top = `${top + window.scrollY}px`;

  currentTarget = element;
  currentSelection = selection;
}

function showCustomInput(selection, element) {
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
      handleAction(prompt + ' Return only the result, nothing else.', selection, element, submitBtn);
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

async function handleAction(prompt, selection, element, triggerBtn) {
  if (!tooltip) return;

  const originalContent = tooltip.innerHTML;
  tooltip.innerHTML = '<div class="draftyfox-loading"><div class="draftyfox-spinner"></div>Processing...</div>';

  try {
    const result = await processText(selection.text, prompt);
    replaceText(element, selection, result);
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

document.addEventListener('mouseup', e => {
  if (tooltip?.contains(e.target)) return;

  setTimeout(() => {
    const activeElement = document.activeElement;

    if (!isEditableElement(activeElement) || isSensitiveField(activeElement)) {
      removeTooltip();
      return;
    }

    const selection = getSelectedTextInEditable(activeElement);
    if (!selection) {
      removeTooltip();
      return;
    }

    createTooltip(e.clientX, e.clientY, selection, activeElement);
  }, 10);
});

document.addEventListener('mousedown', e => {
  if (tooltip && !tooltip.contains(e.target)) {
    removeTooltip();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    removeTooltip();
  }
});

document.addEventListener('scroll', removeTooltip, true);
