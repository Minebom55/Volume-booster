"use strict";

const STORAGE_KEY = "volumePercent";
const GAIN_EVENT = "__volumeBoosterSetGain";

const slider = document.getElementById("volumeSlider");
const valueLabel = document.getElementById("valueLabel");

function updateLabel(percent) {
  valueLabel.textContent = `${percent}%`;
  slider.setAttribute("aria-valuenow", String(percent));
}

/**
 * tabs.sendMessage only hits the top frame by default. W3Schools / many sites
 * play media inside iframes; we broadcast with executeScript so every frame
 * receives the same CustomEvent in the extension isolated world.
 */
function broadcastGainToAllFrames(tabId, percent, gain) {
  const detailJson = JSON.stringify({ percent, gain });
  const code = `document.dispatchEvent(new CustomEvent(${JSON.stringify(
    GAIN_EVENT
  )},{detail:${detailJson}}));`;
  return browser.tabs.executeScript(tabId, {
    allFrames: true,
    matchAboutBlank: true,
    code,
  });
}

function saveAndNotifyTab(percent) {
  const gain = percentToGain(percent);
  browser.storage.local.set({ [STORAGE_KEY]: percent });

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (tab == null || tab.id === undefined) {
      return;
    }
    broadcastGainToAllFrames(tab.id, percent, gain).catch(() => {
      /* restricted URLs, etc. */
    });
  });
}

function onSliderInput() {
  const percent = Number(slider.value);
  updateLabel(percent);
  saveAndNotifyTab(percent);
}

document.addEventListener("DOMContentLoaded", () => {
  browser.storage.local.get(STORAGE_KEY).then((stored) => {
    let percent = 100;
    if (
      typeof stored[STORAGE_KEY] === "number" &&
      stored[STORAGE_KEY] >= 100 &&
      stored[STORAGE_KEY] <= 500
    ) {
      percent = Math.round(stored[STORAGE_KEY]);
    }
    slider.value = String(percent);
    updateLabel(percent);
    saveAndNotifyTab(percent);
  });

  slider.addEventListener("input", onSliderInput);
});
