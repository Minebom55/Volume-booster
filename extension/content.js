"use strict";

const STORAGE_KEY = "volumePercent";

let audioContext = null;
let currentGain = 1;
/** @type {WeakMap<HTMLMediaElement, GainNode>} */
const elementGainNodes = new WeakMap();
/** @type {Set<GainNode>} */
const gainNodes = new Set();

function ensureContext() {
  if (audioContext) {
    return audioContext;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  audioContext = new Ctx();
  return audioContext;
}

function resumeContextIfNeeded() {
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function percentToGain(percent) {
  return percent / 100;
}

function applyGainToAllNodes() {
  gainNodes.forEach((gainNode) => {
    gainNode.gain.value = currentGain;
  });
}

function wireMediaElement(el) {
  if (!(el instanceof HTMLMediaElement)) {
    return;
  }
  if (elementGainNodes.has(el)) {
    return;
  }

  const ctx = ensureContext();
  if (!ctx) {
    return;
  }

  try {
    const source = ctx.createMediaElementAudioSource(el);
    const gainNode = ctx.createGain();
    gainNode.gain.value = currentGain;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    elementGainNodes.set(el, gainNode);
    gainNodes.add(gainNode);
  } catch (err) {
    /* CORS, duplicate routing, or unsupported media */
    console.warn("[Volume Booster] Could not attach to media element:", err);
  }
}

function scanExistingMedia(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll("audio, video").forEach(wireMediaElement);
}

function observeNewMedia() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        if (node instanceof HTMLMediaElement) {
          wireMediaElement(node);
        }
        if (node.querySelectorAll) {
          scanExistingMedia(node);
        }
      }
    }
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "SET_GAIN") {
    return;
  }
  if (typeof message.gain === "number" && Number.isFinite(message.gain)) {
    currentGain = message.gain;
  } else if (typeof message.percent === "number") {
    const clamped = Math.min(500, Math.max(100, Number(message.percent)));
    currentGain = percentToGain(clamped);
  }
  resumeContextIfNeeded();
  applyGainToAllNodes();
});

let observerStarted = false;

function initFromStorage() {
  scanExistingMedia(document);
  if (!observerStarted) {
    observerStarted = true;
    observeNewMedia();
  }
  browser.storage.local.get(STORAGE_KEY).then((stored) => {
    const v = stored[STORAGE_KEY];
    if (typeof v === "number" && v >= 100 && v <= 500) {
      currentGain = percentToGain(Math.round(v));
    }
    applyGainToAllNodes();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFromStorage, {
    once: true,
  });
} else {
  initFromStorage();
}

document.addEventListener(
  "click",
  () => {
    resumeContextIfNeeded();
  },
  true
);
