"use strict";

const STORAGE_KEY = "volumePercent";
const NATIVE_MATCH_GAIN_KEY = "nativeMatchGain";
const CURVE_EXPONENT_KEY = "curveExponent";
const DISABLED_HOSTS_KEY = "disabledHosts";
const GAIN_EVENT = "__volumeBoosterSetGain";

const slider = document.getElementById("volumeSlider");
const valueLabel = document.getElementById("valueLabel");
const mainPanel = document.getElementById("mainPanel");
const settingsPanel = document.getElementById("settingsPanel");
const settingsToggle = document.getElementById("settingsToggle");
const settingsBack = document.getElementById("settingsBack");
const nativeMatchGainInput = document.getElementById("nativeMatchGainInput");
const curveExponentInput = document.getElementById("curveExponentInput");
const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");
const siteEnabledToggle = document.getElementById("siteEnabledToggle");
const siteStatusText = document.getElementById("siteStatusText");
const refreshNotice = document.getElementById("refreshNotice");
const refreshButton = document.getElementById("refreshButton");

let currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
let currentPercent = 100;
let currentHostname = "";
let isCurrentSiteEnabled = true;
let needsRefresh = false;

function updateLabel(percent) {
  valueLabel.textContent = `${percent}%`;
  slider.setAttribute("aria-valuenow", String(percent));
}

/**
 * tabs.sendMessage only hits the top frame by default. W3Schools / many sites
 * play media inside iframes; we broadcast with executeScript so every frame
 * receives the same CustomEvent in the extension isolated world.
 */
function broadcastGainToAllFrames(tabId, percent, gain, settings) {
  const detailJson = JSON.stringify({
    percent,
    gain,
    settings,
    enabled: isCurrentSiteEnabled,
  });
  const code = `document.dispatchEvent(new CustomEvent(${JSON.stringify(
    GAIN_EVENT
  )},{detail:${detailJson}}));`;
  return browser.tabs.executeScript(tabId, {
    allFrames: true,
    matchAboutBlank: true,
    code,
  });
}

function setPanelState(showSettings) {
  mainPanel.classList.toggle("active-panel", !showSettings);
  settingsPanel.classList.toggle("active-panel", showSettings);
  settingsPanel.setAttribute("aria-hidden", String(!showSettings));
  settingsToggle.setAttribute(
    "aria-label",
    showSettings ? "Close settings" : "Open settings"
  );
}

function getSettingsFromInputs() {
  return normalizeGainSettings({
    nativeMatchGain: nativeMatchGainInput.value,
    curveExponent: curveExponentInput.value,
  });
}

function syncSettingsInputs(settings) {
  nativeMatchGainInput.value = settings.nativeMatchGain.toFixed(1);
  curveExponentInput.value = settings.curveExponent.toFixed(1);
}

function saveAndNotifyTab(percent, settings, options) {
  const gain = percentToGain(percent, settings);
  const payloadSettings = normalizeGainSettings(settings);
  const opts = options || {};
  if (opts.persistPercent) {
    browser.storage.local.set({ [STORAGE_KEY]: percent });
  }

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (tab == null || tab.id === undefined) {
      return;
    }
    broadcastGainToAllFrames(tab.id, percent, gain, payloadSettings).catch(
      () => {
        /* restricted URLs, etc. */
      }
    );
  });
}

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

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

function setNeedsRefresh(value) {
  needsRefresh = Boolean(value);
  refreshNotice.hidden = !needsRefresh;
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
    return normalizeHostname(parsed.hostname);
  } catch {
    return "";
  }
}

function updateSiteToggleUI() {
  if (!currentHostname) {
    siteEnabledToggle.checked = false;
    siteEnabledToggle.disabled = true;
    siteStatusText.textContent = "This tab cannot be controlled by the extension.";
    setNeedsRefresh(false);
    return;
  }
  siteEnabledToggle.disabled = false;
  siteEnabledToggle.checked = isCurrentSiteEnabled;
  siteStatusText.textContent = isCurrentSiteEnabled
    ? `${currentHostname} will allow extension injection.`
    : `${currentHostname} is excluded and will not inject after reload.`;
}

function persistSiteEnabled(enabled) {
  if (!currentHostname) {
    return Promise.resolve();
  }
  return browser.storage.local.get(DISABLED_HOSTS_KEY).then((stored) => {
    const disabledHosts = parseDisabledHosts(stored[DISABLED_HOSTS_KEY]);
    const filtered = disabledHosts.filter((host) => host !== currentHostname);
    const next = enabled ? filtered : filtered.concat(currentHostname);
    return browser.storage.local.set({ [DISABLED_HOSTS_KEY]: next });
  });
}

function onSiteToggleChange() {
  if (!currentHostname || siteEnabledToggle.disabled) {
    return;
  }
  isCurrentSiteEnabled = Boolean(siteEnabledToggle.checked);
  updateSiteToggleUI();
  setNeedsRefresh(true);
  persistSiteEnabled(isCurrentSiteEnabled).catch(() => {});
  saveAndNotifyTab(currentPercent, currentSettings, { persistPercent: false });
}

function onSliderInput() {
  const percent = Number(slider.value);
  currentPercent = percent;
  updateLabel(percent);
  saveAndNotifyTab(percent, currentSettings, { persistPercent: false });
}

function onSliderChange() {
  browser.storage.local.set({ [STORAGE_KEY]: currentPercent });
}

function onSettingsInput() {
  currentSettings = getSettingsFromInputs();
  syncSettingsInputs(currentSettings);
  saveAndNotifyTab(currentPercent, currentSettings, { persistPercent: false });
}

function onSettingsChange() {
  browser.storage.local.set({
    [NATIVE_MATCH_GAIN_KEY]: currentSettings.nativeMatchGain,
    [CURVE_EXPONENT_KEY]: currentSettings.curveExponent,
  });
}

function onResetDefaults() {
  currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
  isCurrentSiteEnabled = true;
  syncSettingsInputs(currentSettings);
  updateSiteToggleUI();
  setNeedsRefresh(true);
  browser.storage.local.set({
    [NATIVE_MATCH_GAIN_KEY]: currentSettings.nativeMatchGain,
    [CURVE_EXPONENT_KEY]: currentSettings.curveExponent,
  });
  persistSiteEnabled(true).catch(() => {});
  saveAndNotifyTab(currentPercent, currentSettings, { persistPercent: false });
}

document.addEventListener("DOMContentLoaded", () => {
  Promise.all([
    browser.tabs.query({ active: true, currentWindow: true }),
    browser.storage.local.get([
      STORAGE_KEY,
      NATIVE_MATCH_GAIN_KEY,
      CURVE_EXPONENT_KEY,
      DISABLED_HOSTS_KEY,
    ]),
  ]).then(([tabs, stored]) => {
    const tab = tabs[0];
    currentHostname = getTabHostname(tab);
    const disabledHosts = parseDisabledHosts(stored[DISABLED_HOSTS_KEY]);
    isCurrentSiteEnabled =
      !currentHostname || !disabledHosts.includes(currentHostname);

    let percent = 100;
    if (
      typeof stored[STORAGE_KEY] === "number" &&
      stored[STORAGE_KEY] >= 100 &&
      stored[STORAGE_KEY] <= 500
    ) {
      percent = Math.round(stored[STORAGE_KEY]);
    }
    currentSettings = normalizeGainSettings({
      nativeMatchGain: stored[NATIVE_MATCH_GAIN_KEY],
      curveExponent: stored[CURVE_EXPONENT_KEY],
    });
    currentPercent = percent;
    slider.value = String(percent);
    updateLabel(percent);
    syncSettingsInputs(currentSettings);
    updateSiteToggleUI();
    setNeedsRefresh(false);
    saveAndNotifyTab(percent, currentSettings, { persistPercent: true });
    setPanelState(false);
  });

  slider.addEventListener("input", onSliderInput);
  slider.addEventListener("change", onSliderChange);
  nativeMatchGainInput.addEventListener("input", onSettingsInput);
  nativeMatchGainInput.addEventListener("change", onSettingsChange);
  curveExponentInput.addEventListener("input", onSettingsInput);
  curveExponentInput.addEventListener("change", onSettingsChange);
  siteEnabledToggle.addEventListener("change", onSiteToggleChange);
  refreshButton.addEventListener("click", () => {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab == null || tab.id === undefined) {
        return;
      }
      browser.tabs.reload(tab.id).catch(() => {});
      setNeedsRefresh(false);
    });
  });
  resetDefaultsBtn.addEventListener("click", onResetDefaults);
  settingsToggle.addEventListener("click", () => {
    const opening = !settingsPanel.classList.contains("active-panel");
    setPanelState(opening);
  });
  settingsBack.addEventListener("click", () => {
    setPanelState(false);
  });
});
