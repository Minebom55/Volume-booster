"use strict";

const STORAGE_KEY = "volumePercent";
const NATIVE_MATCH_GAIN_KEY = "nativeMatchGain";
const CURVE_EXPONENT_KEY = "curveExponent";
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

let currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
let currentPercent = 100;

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

function saveAndNotifyTab(percent, settings) {
  const gain = percentToGain(percent, settings);
  const payloadSettings = normalizeGainSettings(settings);
  browser.storage.local.set({ [STORAGE_KEY]: percent });

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
  saveAndNotifyTab(percent, currentSettings);
}

function onSettingsInput() {
  currentSettings = getSettingsFromInputs();
  syncSettingsInputs(currentSettings);
  browser.storage.local.set({
    [NATIVE_MATCH_GAIN_KEY]: currentSettings.nativeMatchGain,
    [CURVE_EXPONENT_KEY]: currentSettings.curveExponent,
  });
  saveAndNotifyTab(currentPercent, currentSettings);
}

function onResetDefaults() {
  currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
  syncSettingsInputs(currentSettings);
  browser.storage.local.set({
    [NATIVE_MATCH_GAIN_KEY]: currentSettings.nativeMatchGain,
    [CURVE_EXPONENT_KEY]: currentSettings.curveExponent,
  });
  saveAndNotifyTab(currentPercent, currentSettings);
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
    saveAndNotifyTab(percent, currentSettings);
    setPanelState(false);
  });

  slider.addEventListener("input", onSliderInput);
  nativeMatchGainInput.addEventListener("input", onSettingsInput);
  curveExponentInput.addEventListener("input", onSettingsInput);
  resetDefaultsBtn.addEventListener("click", onResetDefaults);
  settingsToggle.addEventListener("click", () => {
    const opening = !settingsPanel.classList.contains("active-panel");
    setPanelState(opening);
  });
  settingsBack.addEventListener("click", () => {
    setPanelState(false);
  });
});
