import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiKey', 'baseUrl', 'model'], result => {
      resolve({
        apiKey: result.apiKey || '',
        baseUrl: result.baseUrl || 'https://api.openai.com/v1',
        model: result.model || 'gpt-4o'
      });
    });
  });
}

async function processText(text, systemPrompt) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    throw new Error('API key not configured. Click the DraftyFox extension icon to set it up.');
  }

  const chat = new ChatOpenAI({
    openAIApiKey: settings.apiKey,
    modelName: settings.model,
    configuration: {
      baseURL: settings.baseUrl
    }
  });

  const response = await chat.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(text)
  ]);

  return response.content.trim();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'processText') {
    processText(request.text, request.prompt)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
