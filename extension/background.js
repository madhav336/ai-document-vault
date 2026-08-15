const MENU_ID = "save-to-ai-bookmark-vault";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Save to AI Bookmark Vault",
    contexts: ["page", "link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  const title = tab?.title || url;
  saveBookmark(url, title);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.url) saveBookmark(tab.url, tab.title || tab.url);
});

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

async function saveBookmark(url, title) {
  const { apiBaseUrl, apiKey } = await chrome.storage.local.get(["apiBaseUrl", "apiKey"]);

  if (!apiBaseUrl || !apiKey) {
    setBadge("!", "#f59e0b");
    chrome.action.openPopup?.();
    return;
  }

  try {
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ title, url, tags: [] }),
    });

    if (res.ok) {
      setBadge("✓", "#22c55e");
    } else {
      setBadge("✗", "#ef4444");
    }
  } catch (err) {
    setBadge("✗", "#ef4444");
  }
}
