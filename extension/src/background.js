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

async function processText(text, systemPrompt, pageContext) {
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

  let contextPrompt = systemPrompt;
  if (pageContext?.text) {
    if (pageContext.isChat) {
      contextPrompt = `${systemPrompt}

This text is being written in a chat/messaging context. Match the conversational tone and style of the ongoing conversation. Keep the response natural and appropriate for the chat.

Chat: ${pageContext.title}
Recent conversation:
${pageContext.text}`;
    } else {
      contextPrompt = `${systemPrompt}

Use the following page context to better understand the tone, style, and subject matter. Adapt your response to match the context appropriately.

Page: ${pageContext.title}
URL: ${pageContext.url}
Content:
${pageContext.text}`;
    }
  }

  const response = await chat.invoke([
    new SystemMessage(contextPrompt),
    new HumanMessage(text)
  ]);

  return response.content.trim();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'processText') {
    processText(request.text, request.prompt, request.pageContext)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
