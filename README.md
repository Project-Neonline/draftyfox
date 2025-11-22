# DraftyFox

AI-powered text enhancement for editable fields in your browser.

## Features

- **Quick text actions**: Paraphrase, Shorten, Expand, Improve, Formal, Casual
- **Custom prompts**: Save your own prompts for reuse
- **Context-aware**: Uses page content and surrounding text for better results
- **Works everywhere**: Inputs, textareas, contenteditable elements
- **Hotkey activated**: `Ctrl+M` to trigger on selected text
- **Privacy-first**: No backend, API calls go directly to your configured provider

## Installation

```bash
cd extension
npm install
npm run build
```

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension` folder

## Configuration

Click the extension icon to configure:

- **API Key**: Your OpenAI-compatible API key
- **Base URL**: API endpoint (default: `https://api.openai.com/v1`)
- **Model**: Model name (default: `gpt-4o`)

## Usage

1. Select text in any editable field
2. Press `Ctrl+M`
3. Choose an action or enter a custom prompt

## Customization

Edit `prompts.json` to customize actions and system prompt:

```json
{
  "systemPrompt": "Your system prompt here...",
  "actions": [
    {
      "id": "paraphrase",
      "label": "Paraphrase",
      "prompt": "Paraphrase the selected text..."
    }
  ]
}
```

Rebuild after editing: `npm run build`

## Development

```bash
npm run watch
```

## Tech Stack

- LangChain.js for LLM integration
- Zod for structured output
- esbuild for bundling
