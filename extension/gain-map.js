"use strict";

const DEFAULT_NATIVE_MATCH_GAIN = 0.6;
const DEFAULT_CURVE_EXPONENT = 2.0;

const DEFAULT_SETTINGS = Object.freeze({
  nativeMatchGain: DEFAULT_NATIVE_MATCH_GAIN,
  curveExponent: DEFAULT_CURVE_EXPONENT,
});

function clampNativeMatchGain(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_NATIVE_MATCH_GAIN;
  }
  return Math.max(0.1, Math.min(5.0, n));
}

function clampCurveExponent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_CURVE_EXPONENT;
  }
  return Math.max(1.0, Math.min(5.0, n));
}

function normalizeGainSettings(input) {
  const settings = input || {};
  return {
    nativeMatchGain: clampNativeMatchGain(settings.nativeMatchGain),
    curveExponent: clampCurveExponent(settings.curveExponent),
  };
}

function percentToGain(percent, settingsInput) {
  const p = Math.min(500, Math.max(100, Number(percent)));
  const settings = normalizeGainSettings(settingsInput);
  return settings.nativeMatchGain * Math.pow(p / 100, settings.curveExponent);
}
