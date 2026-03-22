"use strict";

/**
 * Maps the slider "percent" (100–500) to Web Audio linear gain.
 *
 * - NATIVE_MATCH_GAIN: Firefox often plays slightly louder through
 *   MediaElementSource + GainNode than the plain <video>/<audio> path at gain 1.
 *   100% uses this so it lines up with “normal” site volume.
 *
 * - PERCENT_CURVE_EXPONENT: Raw linear gain (200% = 2× amplitude) is only about
 *   +6 dB vs 100%, which usually does not feel like “twice as loud.” A modest
 *   exponent (>1) raises mid/high settings so steps feel closer to the label.
 */
const NATIVE_MATCH_GAIN = 0.6;
const PERCENT_CURVE_EXPONENT = 1.08;

function percentToGain(percent) {
  const p = Math.min(500, Math.max(100, Number(percent)));
  return NATIVE_MATCH_GAIN * Math.pow(p / 100, PERCENT_CURVE_EXPONENT);
}
