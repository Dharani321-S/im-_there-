// Popup script: manage API key in chrome.storage

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveApiKey');
  const statusEl = document.getElementById('status');

  if (!apiKeyInput || !saveButton || !statusEl) {
    return;
  }

  chrome.storage.sync.get(['openaiApiKey'], (result) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = 'Could not load saved key.';
      return;
    }
    if (result.openaiApiKey) {
      apiKeyInput.value = result.openaiApiKey;
      statusEl.textContent = 'Key loaded from storage.';
    } else {
      statusEl.textContent = 'No key saved yet.';
    }
  });

  saveButton.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      statusEl.textContent = 'Please enter a valid key.';
      return;
    }

    chrome.storage.sync.set({ openaiApiKey: key }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error saving key.';
        return;
      }
      statusEl.textContent = 'Key saved.';
    });
  });
});

