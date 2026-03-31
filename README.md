# **Disclaimer** this extention and reposatory is 99% AI generated do with that what you will

# 🔊 Volume Booster — Firefox Extension

> Push your browser audio beyond the default 100% limit — up to 500% — using the Web Audio API.

Firefox caps webpage volume at 100% natively. Volume Booster breaks that ceiling by routing all audio and video elements through a `GainNode`, letting you crank quiet tabs, videos, or music players to levels that are actually audible. It works on YouTube, Spotify Web, SoundCloud, and any other site that uses HTML5 `<audio>` or `<video>` elements.

---

## ✨ Features

- 🎚️ **Volume slider from 100% to 500%** — smooth gain control beyond the browser default
- 🔁 **Live updates** — changes apply instantly without reloading the page
- 👁️ **Works on dynamic pages** — a `MutationObserver` catches media loaded after the page opens (e.g. YouTube)

---

## 📦 Installation

### Option 1 — Install from Firefox Add-ons (recommended)

1. Open the add-on page:
   [https://addons.mozilla.org/sv-SE/firefox/addon/500-volume-booster/](https://addons.mozilla.org/sv-SE/firefox/addon/500-volume-booster/)
2. Select **Add to Firefox**.
3. Confirm permissions and finish installation.

This is the easiest and most stable method for normal use.

---

### Option 2 — Temporary install from this repository (development/testing)

1. **Download or clone this repository**

   Click the green **Code** button on this page → **Download ZIP**, then unzip it.
   Or if you have Git installed:
   ```bash
   git clone https://github.com/minebom55/volume-booster.git
   ```

2. **Open Firefox** and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```

3. Select **Load Temporary Add-on...**

4. Navigate to the folder you downloaded and select the **`manifest.json`** file.

5. The extension icon appears in your Firefox toolbar.

> Temporary installs are removed when Firefox fully closes and must be added again after restart.


---

## 🚀 How to use

1. Click the **Volume Booster icon** in the Firefox toolbar to open the popup.
2. Drag the slider right to increase volume beyond 100%.
3. The gain is applied instantly to all audio and video on the active tab.


---

## 🔧 Development

To make changes and reload:

1. Edit the source files in your local copy.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Reload** next to the extension — no need to re-add it.
4. To debug:
   - **Content script logs** → `F12` on the active tab
   - **Popup logs** → Right-click the extension icon → **Inspect**
   - **Background script logs** → `about:debugging` → **Inspect**

---

## 📋 Permissions used

| Permission | Reason |
|---|---|
| `activeTab` | To inject the content script into the current tab |
| `tabs` | To send messages from the popup to the content script |
| `storage` | To save your volume level and settings locally |

---

## 📄 License

MIT — do whatever you want with it.
