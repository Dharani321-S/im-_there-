// Content script for YouTube Smart Notes

const SW_SN_YT_STYLE_ID = 'sw-sn-style';
const SW_SN_SIDEBAR_ID = 'sw-sn-sidebar';
const SW_SN_NOTES_ID = 'sw-sn-notes';

function injectStylesheet() {
  if (document.getElementById(SW_SN_YT_STYLE_ID)) return;

  const link = document.createElement('link');
  link.id = SW_SN_YT_STYLE_ID;
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

async function callOpenAIForNotes(subtitlesText, videoTitle) {
  const apiKey = await getApiKey();

  const systemPrompt =
    'You are a helpful study assistant. You create concise study notes from YouTube video subtitles. ' +
    'Use clear bullet points, simple English, and highlight the most important sentences by wrapping them in **double asterisks**.';

  const userPrompt =
    `Create study notes for this YouTube video.\n\n` +
    (videoTitle ? `Title: ${videoTitle}\n\n` : '') +
    `Subtitles:\n` +
    subtitlesText.slice(0, 12000); // keep within reasonable size

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
        {
          role: 'user',
          content:
            userPrompt +
            '\n\nFormat:\n• Main topic\n• 4-10 key bullet points\n• Short list of important concepts'
        }
      ],
      temperature: 0.3,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('No notes returned by the AI API.');
  }
  return message;
}

function createSidebar() {
  let sidebar = document.getElementById(SW_SN_SIDEBAR_ID);
  if (sidebar) return sidebar;

  sidebar = document.createElement('div');
  sidebar.id = SW_SN_SIDEBAR_ID;
  sidebar.className = 'sw-sn-sidebar sw-sn-collapsed';

  const header = document.createElement('div');
  header.className = 'sw-sn-sidebar-header';

  const title = document.createElement('span');
  title.className = 'sw-sn-sidebar-title';
  title.textContent = 'Smart Notes';

  const toggle = document.createElement('button');
  toggle.className = 'sw-sn-sidebar-toggle';
  toggle.textContent = '⟨';
  toggle.title = 'Collapse / expand notes';
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('sw-sn-collapsed');
    toggle.textContent = sidebar.classList.contains('sw-sn-collapsed') ? '⟨' : '⟩';
  });

  header.appendChild(title);
  header.appendChild(toggle);

  const toolbar = document.createElement('div');
  toolbar.className = 'sw-sn-sidebar-toolbar';

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy notes to clipboard';
  copyBtn.addEventListener('click', () => {
    const notesEl = document.getElementById(SW_SN_NOTES_ID);
    if (!notesEl) return;
    const text = notesEl.textContent || '';
    navigator.clipboard
      .writeText(text)
      .catch(() => {
        // Ignore clipboard errors silently
      });
  });

  const exportTextBtn = document.createElement('button');
  exportTextBtn.textContent = 'Export .txt';
  exportTextBtn.title = 'Download notes as a text file';
  exportTextBtn.addEventListener('click', () => {
    const notesEl = document.getElementById(SW_SN_NOTES_ID);
    if (!notesEl) return;
    const text = notesEl.textContent || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-notes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const exportPdfBtn = document.createElement('button');
  exportPdfBtn.textContent = 'Export PDF';
  exportPdfBtn.title = 'Open printable view (use Save as PDF)';
  exportPdfBtn.addEventListener('click', () => {
    const notesEl = document.getElementById(SW_SN_NOTES_ID);
    if (!notesEl) return;
    const text = notesEl.textContent || '';
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    w.document.write(
      '<!DOCTYPE html><html><head><title>YouTube Notes</title></head><body>' +
        '<h1>YouTube Notes</h1><pre style="white-space:pre-wrap;font-family:system-ui, sans-serif;">' +
        escaped +
        '</pre>' +
        '<script>window.onload = function(){window.print();};</script>' +
        '</body></html>'
    );
    w.document.close();
  });

  toolbar.appendChild(copyBtn);
  toolbar.appendChild(exportTextBtn);
  toolbar.appendChild(exportPdfBtn);

  const body = document.createElement('div');
  body.className = 'sw-sn-sidebar-body';

  const notes = document.createElement('div');
  notes.id = SW_SN_NOTES_ID;
  notes.className = 'sw-sn-notes';
  notes.textContent = 'Smart notes for this video will appear here.';

  body.appendChild(toolbar);
  body.appendChild(notes);

  sidebar.appendChild(header);
  sidebar.appendChild(body);

  document.body.appendChild(sidebar);
  return sidebar;
}

function renderNotes(rawText) {
  const notesEl = document.getElementById(SW_SN_NOTES_ID);
  if (!notesEl) return;

  let escaped = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;/');

  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');
  escaped = escaped.replace(/\n{2,}/g, '\n\n');
  escaped = escaped.replace(/\n/g, '<br>');

  notesEl.innerHTML = escaped;
}

function setNotesMessage(message) {
  const notesEl = document.getElementById(SW_SN_NOTES_ID);
  if (!notesEl) return;
  notesEl.textContent = message;
}

function getVideoIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get('v')) {
      return u.searchParams.get('v');
    }
    const pathParts = u.pathname.split('/');
    const maybeId = pathParts[pathParts.length - 1];
    if (u.pathname.startsWith('/shorts/') && maybeId) {
      return maybeId;
    }
  } catch (e) {
    return null;
  }
  return null;
}

async function fetchSubtitlesForVideo(videoId) {
  const base = 'https://www.youtube.com/api/timedtext';
  const params = new URLSearchParams({
    lang: 'en',
    v: videoId,
    fmt: 'json3'
  });

  const url = `${base}?${params.toString()}`;
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    throw new Error('Subtitles not available for this video.');
  }

  const text = await response.text();

  let subtitlesText = '';
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data.events)) {
      for (const ev of data.events) {
        if (Array.isArray(ev.segs)) {
          for (const seg of ev.segs) {
            if (typeof seg.utf8 === 'string') {
              subtitlesText += seg.utf8 + ' ';
            }
          }
        }
      }
    }
  } catch {
    subtitlesText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  subtitlesText = subtitlesText.replace(/\s+/g, ' ').trim();
  if (!subtitlesText) {
    throw new Error('Could not parse subtitles for this video.');
  }
  return subtitlesText;
}

let currentVideoId = null;
let generating = false;

async function generateNotesForCurrentVideo() {
  if (generating) return;

  const videoId = getVideoIdFromUrl(location.href);
  if (!videoId) {
    setNotesMessage('No video detected.');
    return;
  }

  currentVideoId = videoId;
  const sidebar = createSidebar();
  sidebar.classList.remove('sw-sn-collapsed');

  setNotesMessage('Fetching subtitles and generating notes...');
  generating = true;

  try {
    const subtitles = await fetchSubtitlesForVideo(videoId);
    let videoTitle = '';
    const titleEl = document.querySelector('h1.title yt-formatted-string') || document.querySelector('h1.title');
    if (titleEl && titleEl.textContent) {
      videoTitle = titleEl.textContent.trim();
    }

    const notes = await callOpenAIForNotes(subtitles, videoTitle);
    renderNotes(notes);
  } catch (err) {
    const msg =
      err && err.message
        ? err.message
        : 'Could not generate notes for this video.';
    setNotesMessage(msg);
  } finally {
    generating = false;
  }
}

function startVideoObserver() {
  createSidebar();

  let lastUrl = location.href;

  setTimeout(generateNotesForCurrentVideo, 4000);

  setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      currentVideoId = null;
      setNotesMessage('Loading new video...');
      setTimeout(generateNotesForCurrentVideo, 3000);
    }
  }, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startVideoObserver);
} else {
  startVideoObserver();
}

