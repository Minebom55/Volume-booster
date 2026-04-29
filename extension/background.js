"use strict";

const DISABLED_HOSTS_KEY = "disabledHosts";

function normalizeHostEntry(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    try {
      host = new URL(`https://${raw}`).hostname;
    } catch {
      host = raw;
    }
  }

  host = String(host || "").trim().toLowerCase();
  host = host.split("/")[0].split("?")[0].split("#")[0];
  if (host.includes("@")) {
    host = host.split("@").pop() || "";
  }
  if (host.includes(":")) {
    host = host.split(":")[0];
  }
  while (host.startsWith(".")) {
    host = host.slice(1);
  }
  while (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  if (!/^[a-z0-9.-]+$/.test(host)) {
    return "";
  }
  return host;
}

function parseDisabledHosts(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const value of input) {
    const host = normalizeHostEntry(value);
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    out.push(host);
  }
  return out;
}

function getTabHostname(tab) {
  try {
    const rawUrl = tab && typeof tab.url === "string" ? tab.url : "";
    if (!rawUrl) {
      return "";
    }
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return normalizeHostEntry(parsed.hostname);
  } catch {
    return "";
  }
}

function shouldInjectIntoTab(tab) {
  const hostname = getTabHostname(tab);
  if (!hostname) {
    return Promise.resolve(false);
  }
  return browser.storage.local.get(DISABLED_HOSTS_KEY).then((stored) => {
    const disabledHosts = parseDisabledHosts(stored[DISABLED_HOSTS_KEY]);
    return !disabledHosts.includes(hostname);
  });
}

function injectScripts(tabId) {
  return browser.tabs.executeScript(tabId, {
    file: "gain-map.js",
    allFrames: true,
    runAt: "document_idle",
  }).then(() =>
    browser.tabs.executeScript(tabId, {
      file: "content.js",
      allFrames: true,
      runAt: "document_idle",
    })
  );
}

function maybeInjectTab(tabId, tab) {
  if (tabId == null || !tab) {
    return;
  }
  shouldInjectIntoTab(tab)
    .then((allowed) => {
      if (!allowed) {
        return;
      }
      return injectScripts(tabId);
    })
    .catch(() => {});
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") {
    return;
  }
  maybeInjectTab(tabId, tab);
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  browser.tabs.get(tabId).then((tab) => {
    maybeInjectTab(tabId, tab);
  }).catch(() => {});
});

browser.runtime.onInstalled.addListener(() => {
  browser.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => {
      if (tab.id !== undefined) {
        maybeInjectTab(tab.id, tab);
      }
    });
  }).catch(() => {});
});
