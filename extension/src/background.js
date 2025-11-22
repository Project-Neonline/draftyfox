import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

const ResponseSchema = z.object({
  replacement: z.string().describe('The replacement text for the selected portion')
});

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

async function processText(selectionContext, actionPrompt, systemPrompt, pageContext) {
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

  const structuredChat = chat.withStructuredOutput(ResponseSchema);

  let fullSystemPrompt = systemPrompt;
  if (pageContext?.text) {
    fullSystemPrompt += `

Page context for reference:
Title: ${pageContext.title}
URL: ${pageContext.url}
Content:
${pageContext.text}`;
  }

  const userMessage = `Instruction: ${actionPrompt}

TEXT BEFORE:
${selectionContext.before || '(start of text)'}

SELECTED TEXT (modify this):
>>>${selectionContext.selected}<<<

TEXT AFTER:
${selectionContext.after || '(end of text)'}`;

  console.log('[DraftyFox Background] Processing:', { actionPrompt, selectionContext });

  const response = await structuredChat.invoke([
    new SystemMessage(fullSystemPrompt),
    new HumanMessage(userMessage)
  ]);

  console.log('[DraftyFox Background] Response:', response);

  return response.replacement;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'processText') {
    processText(
      request.selectionContext,
      request.actionPrompt,
      request.systemPrompt,
      request.pageContext
    )
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
