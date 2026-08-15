const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const apiKeyInput = document.getElementById("apiKey");
const statusEl = document.getElementById("status");

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f87171" : "#4ade80";
}

async function loadSettings() {
  const { apiBaseUrl, apiKey } = await chrome.storage.local.get(["apiBaseUrl", "apiKey"]);
  apiBaseUrlInput.value = apiBaseUrl || "http://127.0.0.1:8000";
  apiKeyInput.value = apiKey || "";
}

document.getElementById("saveSettings").addEventListener("click", async () => {
  const apiBaseUrl = apiBaseUrlInput.value.trim().replace(/\/$/, "");
  const apiKey = apiKeyInput.value.trim();

  if (!apiBaseUrl || !apiKey) {
    showStatus("Both fields are required.", true);
    return;
  }

  let origin;
  try {
    origin = new URL(apiBaseUrl).origin + "/*";
  } catch {
    showStatus("Invalid URL.", true);
    return;
  }

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    showStatus("Permission denied — can't reach that host.", true);
    return;
  }

  await chrome.storage.local.set({ apiBaseUrl, apiKey });
  showStatus("Settings saved.", false);
});

document.getElementById("saveCurrentPage").addEventListener("click", async () => {
  const { apiBaseUrl, apiKey } = await chrome.storage.local.get(["apiBaseUrl", "apiKey"]);
  if (!apiBaseUrl || !apiKey) {
    showStatus("Save your settings first.", true);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showStatus("Couldn't read the current tab.", true);
    return;
  }

  showStatus("Saving...", false);
  try {
    const res = await fetch(`${apiBaseUrl}/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ title: tab.title || tab.url, url: tab.url, tags: [] }),
    });
    if (res.ok) {
      showStatus("Saved to your vault!", false);
    } else {
      const data = await res.json().catch(() => ({}));
      showStatus(data.detail || "Failed to save.", true);
    }
  } catch {
    showStatus("Network error — check the API URL.", true);
  }
});

loadSettings();
