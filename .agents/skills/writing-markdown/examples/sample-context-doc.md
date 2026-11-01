# Context: Pump Health Scoring

<!--
Keywords: pump_performance, MachineHealth, cavitation_score, bearing_wear
Target paths: pump_performance/services/scoring.py, pump_performance/models/
Models: MachineHealthScore, SensorCatalog
Errors: InsufficientTelemetryData, SensorCadenceError
-->

This document defines scoring calculations and invariants for pump health monitoring.

> **Index:**
>
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | Ubiquitous Language | L22-L33 | [#ubiquitous-language](#ubiquitous-language) |
> | Core Invariants | L34-L43 | [#core-invariants](#core-invariants) |
> | Calculations and Formulas | L44-L55 | [#calculations-and-formulas](#calculations-and-formulas) |
> | Engineering Patterns | L56-L75 | [#engineering-patterns](#engineering-patterns) |
> | Verification | L76-L83 | [#verification](#verification) |

## Ubiquitous Language

The table below maps domain concepts to their exact code implementations:

| Domain Term | Code Model or Class | Description |
| --- | --- | --- |
| Health Index | `MachineHealthScore.index` | Composite health value between 0.0 and 100.0 |
| Warning State | `HealthState.WARNING` | Score below 70.0 for three consecutive cycles |
| Critical State | `HealthState.CRITICAL` | Score below 40.0 or active trip alert |

---

## Core Invariants

The scoring service MUST enforce these invariants:

1. **Deterministic calculation:** scoring functions must produce identical outputs for matching telemetry.
2. **Missing data boundary:** if telemetry gaps exceed 60 minutes, mark state as `UNKNOWN` rather than estimating values.
3. **Database routing:** write raw sensor readings to `timescaledb`. Store composite scores in the `default` MySQL database.

---

## Calculations and Formulas

Health index (`H`) is a weighted sum of sensor anomaly probabilities:

```text
H = 100 - sum(weight_i * probability_i)
```

Where `weight_i` is the failure mode weight and `probability_i` is the score from the classifier.

---

## Engineering Patterns

When loading sensor time-series data for scoring, use explicit range boundaries:

```python
# Avoid: unbounded query fetching entire telemetry history
readings = SensorData.objects.filter(sensor_id=sensor_id).order_by("time")

# Prefer: bounded range query matching the scoring cadence
readings = SensorData.objects.filter(
    sensor_id=sensor_id,
    time__gte=window_start,
    time__lt=window_end,
).order_by("time")
```

Rationale: unbounded time-series queries exhaust worker memory on sensors with years of historical telemetry.

---

## Verification

To verify scoring calculations against historical records, run:

```bash
.venv-app/bin/python manage.py test pump_performance.tests.services.test_scoring
```
