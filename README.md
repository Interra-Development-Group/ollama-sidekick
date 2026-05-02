# A Chrome Extension

A Chrome extension to interact with local models. Right now it requires Ollama with an embedding and a chat model.

## Developers: Getting Started
To Test Locally (once errors are fixed)
### Prerequisites
```shell
brew install node   # if needed (needs Node 20+)
npm install         # install deps

# Start Ollama with CORS open for the extension
OLLAMA_ORIGINS="chrome-extension://*" ollama serve

# Pull required models (one-time)
ollama pull llama3.2
ollama pull nomic-embed-text

# Start the Plasmo dev build watcher
npm run dev
# → outputs to build/chrome-mv3-dev/
```

### Load into Chrome
chrome://extensions → Developer mode ON → Load unpacked → select build/chrome-mv3-dev