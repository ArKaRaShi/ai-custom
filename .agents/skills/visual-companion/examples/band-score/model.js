/* The band score, with no DOM, so scripts/model-check.ts can test it against the reference code.
   A machine of a given size is expected to run inside a band of readings that moves with its size. The score is where the reading
   sits in that band, 0 to 100, cut off at both ends. The constants are illustrative, not from a real system.
   A page inlines this file in a <script>; the check script imports it. */
globalThis.bandModel = (size, reading) => {
  const log = size > 0 ? Math.log(size) : null;
  const lo = log === null ? null : 40 + 5.5 * log;
  const hi = log === null ? null : 58 + 4.5 * log;
  const hasBand = lo !== null && lo < hi;
  const raw = hasBand && reading !== null ? ((reading - lo) / (hi - lo)) * 100 : null;
  const score = raw === null ? null : Math.max(0, Math.min(100, raw));
  const tone = score === null ? "no_data" : score <= 50 ? "critical" : score <= 75 ? "warning" : "normal";
  return { lo: hasBand ? lo : null, hi: hasBand ? hi : null, score, tone };
};
