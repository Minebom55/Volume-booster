"use strict";

const STORAGE_KEY = "volumePercent";
const NATIVE_MATCH_GAIN_KEY = "nativeMatchGain";
const CURVE_EXPONENT_KEY = "curveExponent";
const GAIN_EVENT = "__volumeBoosterSetGain";
const DEBUG_ENDPOINT = "http://127.0.0.1:7712/ingest/f058744e-7698-441d-82d2-5ec078e34a2d";
const DEBUG_SESSION = "006059";

let audioContext = null;
let currentGain = 1;
let currentPercent = 100;
let currentSettings = normalizeGainSettings(DEFAULT_SETTINGS);
/** @type {WeakMap<HTMLMediaElement, GainNode>} */
const elementGainNodes = new WeakMap();
/** @type {Set<GainNode>} */
const gainNodes = new Set();
/** @type {WeakSet<HTMLMediaElement>} */
const skipWireMedia = new WeakSet();

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

function safeErrorMessage(err) {
  try {
    if (err != null && typeof err.message === "string" && err.message.length) {
      return err.message;
    }
    return String(err);
  } catch {
    return "unavailable (Firefox DeadObject / detached node)";
  }
}

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

/**
 * Firefox 122+ uses createMediaElementAudioSource (spec name). Older Firefox
 * and some engines only expose the legacy createMediaElementSource.
 */
function createMediaElementSourceNode(ctx, mediaElement) {
  if (typeof ctx.createMediaElementAudioSource === "function") {
    return ctx.createMediaElementAudioSource(mediaElement);
  }
  if (typeof ctx.createMediaElementSource === "function") {
    return ctx.createMediaElementSource(mediaElement);
  }
  return null;
}

function applyGainToAllNodes() {
  gainNodes.forEach((gainNode) => {
    try {
      gainNode.gain.value = currentGain;
    } catch {
      /* graph may be torn down after navigation */
    }
  });
}

function applyGainFromPayload(detail) {
  if (!detail) {
    return;
  }
  // #region agent log
  debugLog(
    "pre-fix",
    "H1",
    "content.js:applyGainFromPayload",
    "payload received",
    {
      hasPercent: typeof detail.percent === "number",
      hasGain: typeof detail.gain === "number",
      hasSettings: Boolean(detail.settings),
      currentPercentBefore: currentPercent,
      currentGainBefore: currentGain,
    }
  );
  // #endregion
  if (typeof detail.gain === "number" && Number.isFinite(detail.gain)) {
    currentGain = Number(detail.gain);
  } else if (typeof detail.percent === "number") {
    const clamped = Math.min(500, Math.max(100, Number(detail.percent)));
    currentPercent = clamped;
    currentGain = percentToGain(clamped, currentSettings);
  }
  if (detail.settings) {
    currentSettings = normalizeGainSettings(detail.settings);
    currentGain = percentToGain(currentPercent, currentSettings);
  }
  // #region agent log
  debugLog(
    "pre-fix",
    "H1",
    "content.js:applyGainFromPayload",
    "payload applied",
    {
      currentPercentAfter: currentPercent,
      currentGainAfter: currentGain,
      nativeMatchGain: currentSettings.nativeMatchGain,
      curveExponent: currentSettings.curveExponent,
    }
  );
  // #endregion
  resumeContextIfNeeded();
  applyGainToAllNodes();
}

function wireMediaElement(el) {
  let media;
  try {
    if (!(el instanceof HTMLMediaElement)) {
      return;
    }
    media = el;
    if (skipWireMedia.has(media)) {
      return;
    }
    if (elementGainNodes.has(media)) {
      return;
    }
    if (!media.isConnected) {
      return;
    }
    if (media.ownerDocument !== document) {
      return;
    }
    void media.tagName;
  } catch {
    return;
  }

  const ctx = ensureContext();
  if (!ctx) {
    return;
  }

  try {
    const source = createMediaElementSourceNode(ctx, media);
    if (!source) {
      console.warn(
        "[Volume Booster] This browser does not support routing HTML media through Web Audio."
      );
      return;
    }
    const gainNode = ctx.createGain();
    gainNode.gain.value = currentGain;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    elementGainNodes.set(media, gainNode);
    gainNodes.add(gainNode);
  } catch (err) {
    try {
      skipWireMedia.add(media);
    } catch {
      /* media reference may already be invalid */
    }
    console.warn(
      "[Volume Booster] Could not attach to media element:",
      safeErrorMessage(err)
    );
  }
}

/**
 * Walk light DOM + open shadow roots to find <audio>/<video> (e.g. YouTube).
 */
function scanDeep(root) {
  if (!root) {
    return;
  }
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();

    if (node instanceof HTMLMediaElement) {
      wireMediaElement(node);
      continue;
    }

    if (node instanceof Element) {
      if (node.shadowRoot) {
        stack.push(node.shadowRoot);
      }
      const ch = node.children;
      for (let i = ch.length - 1; i >= 0; i--) {
        stack.push(ch[i]);
      }
    } else if (
      node instanceof ShadowRoot ||
      node instanceof DocumentFragment
    ) {
      const ch = node.children;
      for (let i = ch.length - 1; i >= 0; i--) {
        stack.push(ch[i]);
      }
    }
  }
}

function scanDocumentMedia() {
  const root = document.documentElement || document.body;
  if (root) {
    scanDeep(root);
  }
}

function observeNewMedia() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanDeep(/** @type {Element} */ (node));
        }
      }
    }
  });

  const target = document.documentElement || document.body;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "SET_GAIN") {
    return;
  }
  applyGainFromPayload(message);
});

document.addEventListener(
  GAIN_EVENT,
  (e) => {
    applyGainFromPayload(e.detail);
  },
  false
);

let observerStarted = false;

function initFromStorage() {
  scanDocumentMedia();
  if (!observerStarted) {
    observerStarted = true;
    observeNewMedia();
    window.setInterval(scanDocumentMedia, 1500);
  }
  browser.storage.local
    .get([STORAGE_KEY, NATIVE_MATCH_GAIN_KEY, CURVE_EXPONENT_KEY])
    .then((stored) => {
    const v = stored[STORAGE_KEY];
    if (typeof v === "number" && v >= 100 && v <= 500) {
      currentPercent = Math.round(v);
    }
    currentSettings = normalizeGainSettings({
      nativeMatchGain: stored[NATIVE_MATCH_GAIN_KEY],
      curveExponent: stored[CURVE_EXPONENT_KEY],
    });
    currentGain = percentToGain(currentPercent, currentSettings);
    // #region agent log
    debugLog("pre-fix", "H4", "content.js:initFromStorage", "storage loaded", {
      storedPercent: stored[STORAGE_KEY],
      currentPercent,
      nativeMatchGain: currentSettings.nativeMatchGain,
      curveExponent: currentSettings.curveExponent,
      currentGain,
    });
    // #endregion
    applyGainToAllNodes();
  });
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  let shouldRecalc = false;
  if (
    changes[STORAGE_KEY] &&
    typeof changes[STORAGE_KEY].newValue === "number"
  ) {
    currentPercent = Math.min(
      500,
      Math.max(100, Math.round(changes[STORAGE_KEY].newValue))
    );
    shouldRecalc = true;
  }
  if (changes[NATIVE_MATCH_GAIN_KEY] || changes[CURVE_EXPONENT_KEY]) {
    currentSettings = normalizeGainSettings({
      nativeMatchGain: changes[NATIVE_MATCH_GAIN_KEY]
        ? changes[NATIVE_MATCH_GAIN_KEY].newValue
        : currentSettings.nativeMatchGain,
      curveExponent: changes[CURVE_EXPONENT_KEY]
        ? changes[CURVE_EXPONENT_KEY].newValue
        : currentSettings.curveExponent,
    });
    shouldRecalc = true;
  }
  if (shouldRecalc) {
    currentGain = percentToGain(currentPercent, currentSettings);
    // #region agent log
    debugLog("pre-fix", "H3", "content.js:storage.onChanged", "storage recalc", {
      changedPercent: Boolean(changes[STORAGE_KEY]),
      changedNativeMatchGain: Boolean(changes[NATIVE_MATCH_GAIN_KEY]),
      changedCurveExponent: Boolean(changes[CURVE_EXPONENT_KEY]),
      currentPercent,
      nativeMatchGain: currentSettings.nativeMatchGain,
      curveExponent: currentSettings.curveExponent,
      currentGain,
    });
    // #endregion
    applyGainToAllNodes();
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFromStorage, {
    once: true,
  });
} else {
  initFromStorage();
}

function resumeOnGesture() {
  resumeContextIfNeeded();
}

document.addEventListener("click", resumeOnGesture, true);
document.addEventListener("pointerdown", resumeOnGesture, true);
document.addEventListener("keydown", resumeOnGesture, true);
