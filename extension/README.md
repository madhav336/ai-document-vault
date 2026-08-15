# AI Bookmark Vault — Browser Extension

Save the current page to your vault from any tab — no popup windows, no need to have the web app open.

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
2. Click **Load unpacked** and select this `extension/` folder.
3. Click the extension icon in the toolbar, and:
   - Set **Backend API URL** to your backend (e.g. `http://127.0.0.1:8000` locally, or your deployed Railway/Render URL).
   - Set **Personal API key** — generate one from the web app: **Settings → Browser Extension**.
   - Click **Save Settings**. You'll be asked to grant permission for that host.

## Use

- Click the toolbar icon and **Save Current Page**, or
- Right-click any page or link and choose **Save to AI Bookmark Vault**.

A green checkmark badge on the icon means it saved; red means it failed (check your API URL/key in the popup).
