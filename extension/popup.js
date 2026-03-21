"use strict";

const STORAGE_KEY = "volumePercent";
const slider = document.getElementById("volumeSlider");
const valueLabel = document.getElementById("valueLabel");

function percentToGain(percent) {
  return percent / 100;
}

function updateLabel(percent) {
  valueLabel.textContent = `${percent}%`;
  slider.setAttribute("aria-valuenow", String(percent));
}

function saveAndNotifyTab(percent) {
  const gain = percentToGain(percent);
  browser.storage.local.set({ [STORAGE_KEY]: percent });

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (!tab || tab.id === undefined) {
      return;
    }
    browser.tabs
      .sendMessage(tab.id, { type: "SET_GAIN", percent, gain })
      .catch(() => {
        /* tab may not allow scripts or have no content script */
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
