const apiKeyInput = document.getElementById('apiKey');
const baseUrlInput = document.getElementById('baseUrl');
const modelInput = document.getElementById('model');
const saveSettingsBtn = document.getElementById('saveSettings');
const settingsStatus = document.getElementById('settingsStatus');
const promptsList = document.getElementById('promptsList');
const addPromptBtn = document.getElementById('addPromptBtn');
const addPromptForm = document.getElementById('addPromptForm');
const promptNameInput = document.getElementById('promptName');
const promptTextInput = document.getElementById('promptText');
const cancelPromptBtn = document.getElementById('cancelPrompt');
const savePromptBtn = document.getElementById('savePrompt');

function loadSettings() {
  chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'customPrompts'], result => {
    apiKeyInput.value = result.apiKey || '';
    baseUrlInput.value = result.baseUrl || 'https://api.openai.com/v1';
    modelInput.value = result.model || 'gpt-4o';
    renderPrompts(result.customPrompts || []);
  });
}

function showStatus(message, isError = false) {
  settingsStatus.textContent = message;
  settingsStatus.className = `status ${isError ? 'error' : 'success'}`;
  setTimeout(() => {
    settingsStatus.className = 'status';
  }, 2000);
}

function renderPrompts(prompts) {
  if (prompts.length === 0) {
    promptsList.innerHTML = '<div class="empty-state">No custom prompts yet</div>';
    return;
  }

  promptsList.innerHTML = prompts.map((p, i) => `
    <div class="prompt-item">
      <div>
        <div class="prompt-name">${escapeHtml(p.name)}</div>
        <div class="prompt-preview">${escapeHtml(p.prompt)}</div>
      </div>
      <button class="btn btn-sm btn-danger" data-index="${i}">×</button>
    </div>
  `).join('');

  promptsList.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', () => deletePrompt(parseInt(btn.dataset.index)));
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function deletePrompt(index) {
  chrome.storage.local.get(['customPrompts'], result => {
    const prompts = result.customPrompts || [];
    prompts.splice(index, 1);
    chrome.storage.local.set({ customPrompts: prompts }, () => {
      renderPrompts(prompts);
    });
  });
}

saveSettingsBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const baseUrl = baseUrlInput.value.trim() || 'https://api.openai.com/v1';
  const model = modelInput.value.trim() || 'gpt-4o';

  if (!apiKey) {
    showStatus('API key is required', true);
    return;
  }

  chrome.storage.local.set({ apiKey, baseUrl, model }, () => {
    showStatus('Settings saved');
  });
});

addPromptBtn.addEventListener('click', () => {
  addPromptForm.classList.add('visible');
  promptNameInput.focus();
});

cancelPromptBtn.addEventListener('click', () => {
  addPromptForm.classList.remove('visible');
  promptNameInput.value = '';
  promptTextInput.value = '';
});

savePromptBtn.addEventListener('click', () => {
  const name = promptNameInput.value.trim();
  const prompt = promptTextInput.value.trim();

  if (!name || !prompt) {
    return;
  }

  chrome.storage.local.get(['customPrompts'], result => {
    const prompts = result.customPrompts || [];
    prompts.push({ name, prompt });
    chrome.storage.local.set({ customPrompts: prompts }, () => {
      renderPrompts(prompts);
      addPromptForm.classList.remove('visible');
      promptNameInput.value = '';
      promptTextInput.value = '';
    });
  });
});

promptNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') promptTextInput.focus();
  if (e.key === 'Escape') cancelPromptBtn.click();
});

promptTextInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') savePromptBtn.click();
  if (e.key === 'Escape') cancelPromptBtn.click();
});

loadSettings();
