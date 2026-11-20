"""Stand-in for the real code that the page's model.js must agree with.

In a real project this is the project's own function, called from a command in spec.json. Here it is a small Python file so the example runs
anywhere. The constants are illustrative.

    python3 reference.py <size> <reading|none>   prints {"lo": ..., "hi": ..., "score": ..., "tone": ...}
"""
import json
import math
import sys


def band(size: float) -> tuple[float, float] | None:
    """The band of readings expected for a machine of this size."""
    if size <= 0:
        return None
    log_size = math.log(size)
    lo = 40.0 + 5.5 * log_size
    hi = 58.0 + 4.5 * log_size
    return (lo, hi) if lo < hi else None


def score(reading: float | None, lo: float, hi: float) -> float | None:
    """Where the reading sits in the band, 0 to 100, cut off at both ends."""
    if reading is None:
        return None
    return max(0.0, min(100.0, (reading - lo) / (hi - lo) * 100))


def tone(value: float | None) -> str:
    if value is None:
        return "no_data"
    return "critical" if value <= 50 else "warning" if value <= 75 else "normal"


def main(argv: list[str]) -> int:
    size = float(argv[0])
    reading = None if argv[1] == "none" else float(argv[1])
    limits = band(size)
    lo, hi = limits if limits else (None, None)
    value = score(reading, lo, hi) if limits else None
    label = tone(value)
    result = {"lo": lo, "hi": hi, "score": value, "tone": label}
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
