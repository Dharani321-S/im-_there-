// Content script for word explanations on all non-YouTube pages

const SW_SN_STYLE_ID = 'sw-sn-style';
const SW_SN_POPUP_ID = 'sw-sn-word-popup';

function injectStylesheet() {
  if (document.getElementById(SW_SN_STYLE_ID)) return;

  const link = document.createElement('link');
  link.id = SW_SN_STYLE_ID;
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = chrome.runtime.getURL('style.css');
  document.documentElement.appendChild(link);
}

injectStylesheet();

function getApiKey() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(['openaiApiKey'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        const key = result.openaiApiKey;
        if (!key) {
          reject(new Error('API key not set. Click the extension icon to configure it.'));
          return;
        }
        resolve(key);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function callOpenAIForDefinition(word) {
  const apiKey = await getApiKey();

  const systemPrompt =
    'You are a helpful English tutor. You explain single English words in very simple English, in one short sentence, suitable for language learners at A2-B1 level.';

  const userPrompt = `Explain this English word in one short, simple sentence (no more than 15 words). Do not include the word itself in the explanation.\n\nWord: ${word}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 80
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('No explanation returned by the AI API.');
  }
  return message;
}

function createOrGetPopup() {
  let popup = document.getElementById(SW_SN_POPUP_ID);
  if (popup) return popup;

  popup = document.createElement('div');
  popup.id = SW_SN_POPUP_ID;
  popup.className = 'sw-sn-popup';

  const textEl = document.createElement('div');
  textEl.className = 'sw-sn-popup-text';
  popup.appendChild(textEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sw-sn-popup-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    popup.style.display = 'none';
  });
  popup.appendChild(closeBtn);

  document.body.appendChild(popup);
  return popup;
}

function showPopupNearSelection(message, range) {
  const popup = createOrGetPopup();
  const textEl = popup.querySelector('.sw-sn-popup-text');
  if (textEl) {
    textEl.textContent = message;
  }

  const rect = range.getBoundingClientRect();
  const top = window.scrollY + rect.top - 40;
  const left = window.scrollX + rect.left;

  popup.style.top = `${Math.max(top, 10)}px`;
  popup.style.left = `${Math.max(left, 10)}px`;
  popup.style.display = 'block';
}

function isLikelySingleWord(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).length !== 1) return false;
  return /^[A-Za-z][A-Za-z'-]*$/.test(trimmed);
}

let swSnFetchInProgress = false;

async function handleDoubleClick(event) {
  if (swSnFetchInProgress) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const text = selection.toString();
  if (!isLikelySingleWord(text)) return;

  const range = selection.getRangeAt(0);

  const popup = createOrGetPopup();
  const textEl = popup.querySelector('.sw-sn-popup-text');
  if (textEl) {
    textEl.textContent = 'Thinking...';
  }
  showPopupNearSelection('Thinking...', range);

  swSnFetchInProgress = true;
  try {
    const explanation = await callOpenAIForDefinition(text.trim());
    showPopupNearSelection(explanation, range);
  } catch (err) {
    const msg =
      err && err.message
        ? err.message
        : 'Could not get explanation. Please try again.';
    showPopupNearSelection(msg, range);
  } finally {
    swSnFetchInProgress = false;
  }
}

document.addEventListener('dblclick', handleDoubleClick, true);

