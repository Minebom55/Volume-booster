"use strict";

const STORAGE_KEY = "volumePercent";
const NATIVE_MATCH_GAIN_KEY = "nativeMatchGain";
const CURVE_EXPONENT_KEY = "curveExponent";
const GAIN_EVENT = "__volumeBoosterSetGain";
const DEBUG_ENDPOINT = "http://127.0.0.1:7712/ingest/f058744e-7698-441d-82d2-5ec078e34a2d";
const DEBUG_SESSION = "006059";

const slider = document.getElementById("volumeSlider");
const valueLabel = document.getElementById("valueLabel");
const mainPanel = document.getElementById("mainPanel");
const settingsPanel = document.getElementById("settingsPanel");
const settingsToggle = document.getElementById("settingsToggle");
const settingsBack = document.getElementById("settingsBack");
const nativeMatchGainInput = document.getElementById("nativeMatchGainInput");
const curveExponentInput = document.getElementById("curveExponentInput");
const resetDefaultsBtn = document.getElementById("resetDefaultsBtn");

let currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
let currentPercent = 100;

function debugLog(runId, hypothesisId, location, message, data) {
  if (globalThis.__VB_DEBUG_ENABLED !== true) {
    return;
  }
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION,
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

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
  const detailJson = JSON.stringify({ percent, gain, settings });
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
  // #region agent log
  debugLog("post-fix", "H1", "popup.js:saveAndNotifyTab", "broadcast payload", {
    percent,
    gain,
    persistPercent: Boolean(opts.persistPercent),
    nativeMatchGain: payloadSettings.nativeMatchGain,
    curveExponent: payloadSettings.curveExponent,
  });
  // #endregion

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (tab == null || tab.id === undefined) {
      return;
    }
    broadcastGainToAllFrames(tab.id, percent, gain, payloadSettings).catch(() => {
      /* restricted URLs, etc. */
    });
  });
}

function onSliderInput() {
  const percent = Number(slider.value);
  currentPercent = percent;
  updateLabel(percent);
  saveAndNotifyTab(percent, currentSettings, { persistPercent: false });
}

function onSliderChange() {
  browser.storage.local.set({ [STORAGE_KEY]: currentPercent });
  // #region agent log
  debugLog("post-fix", "H3", "popup.js:onSliderChange", "persist slider percent", {
    percent: currentPercent,
  });
  // #endregion
}

function onSettingsInput() {
  currentSettings = getSettingsFromInputs();
  syncSettingsInputs(currentSettings);
  // #region agent log
  debugLog("post-fix", "H2", "popup.js:onSettingsInput", "settings input parsed", {
    nativeMatchGain: currentSettings.nativeMatchGain,
    curveExponent: currentSettings.curveExponent,
  });
  // #endregion
  saveAndNotifyTab(currentPercent, currentSettings, { persistPercent: false });
}

function onSettingsChange() {
  browser.storage.local.set({
    [NATIVE_MATCH_GAIN_KEY]: currentSettings.nativeMatchGain,
    [CURVE_EXPONENT_KEY]: currentSettings.curveExponent,
  });
  // #region agent log
  debugLog(
    "post-fix",
    "H3",
    "popup.js:onSettingsChange",
    "persist settings values",
    {
      nativeMatchGain: currentSettings.nativeMatchGain,
      curveExponent: currentSettings.curveExponent,
    }
  );
  // #endregion
}

function onResetDefaults() {
  currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
  syncSettingsInputs(currentSettings);
  browser.storage.local.set({
    [NATIVE_MATCH_GAIN_KEY]: currentSettings.nativeMatchGain,
    [CURVE_EXPONENT_KEY]: currentSettings.curveExponent,
  });
  saveAndNotifyTab(currentPercent, currentSettings, { persistPercent: false });
}

document.addEventListener("DOMContentLoaded", () => {
  browser.storage.local
    .get([STORAGE_KEY, NATIVE_MATCH_GAIN_KEY, CURVE_EXPONENT_KEY])
    .then((stored) => {
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
    saveAndNotifyTab(percent, currentSettings, { persistPercent: true });
    setPanelState(false);
  });

  slider.addEventListener("input", onSliderInput);
  slider.addEventListener("change", onSliderChange);
  nativeMatchGainInput.addEventListener("input", onSettingsInput);
  nativeMatchGainInput.addEventListener("change", onSettingsChange);
  curveExponentInput.addEventListener("input", onSettingsInput);
  curveExponentInput.addEventListener("change", onSettingsChange);
  resetDefaultsBtn.addEventListener("click", onResetDefaults);
  settingsToggle.addEventListener("click", () => {
    const opening = !settingsPanel.classList.contains("active-panel");
    setPanelState(opening);
  });
  settingsBack.addEventListener("click", () => {
    setPanelState(false);
  });
});
