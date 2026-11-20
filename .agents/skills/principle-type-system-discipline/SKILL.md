---
name: principle-type-system-discipline
description: Use when designing types, reviewing a function signature, or modeling states and ids in a typed language.
disable-model-invocation: true
---

# Type System Discipline

**Principle:** Let the type checker reject impossible states, mixed-up primitives, and unhandled variants before the code runs.

**Why:** A bare `int` or `str` accepts every value, so a swapped argument or a half-built object compiles and fails in production.

## The Pattern

- **Name semantic primitives.** Two parameters of the same primitive type that mean different things get different types. Validate once, where the value is created.
- **Parse external data at the boundary.** JSON, request bodies, CLI args, config, environment variables, and database rows go through one parse step that returns the typed model. Code past that point takes the model, not a dict.
- **Derive from the schema that owns the shape.** When an OpenAPI file, serializer, or model defines a shape, generate or reuse its type instead of hand-writing a parallel copy.
- **Make illegal states unrepresentable.** Model "loading / failed / ready" as a union of variants, not three booleans where `loading and failed` is possible.
- **Exhaust the variants.** When code branches on a union or enum, make the checker fail if a new variant is added and one branch is missing.

## Examples

```python
# Avoid: swapping the two ids type-checks
def link(project_id: int, sensor_id: int) -> None: ...

# Prefer: distinct types, created once at the boundary
ProjectId = NewType("ProjectId", int)
SensorId = NewType("SensorId", int)
def link(project_id: ProjectId, sensor_id: SensorId) -> None: ...
```

```python
# Avoid: a dict that may or may not have the keys
def run(data: dict[str, Any]) -> None:
    sensor = data["false_alarm_sensor"]

# Prefer: parse once, then pass the typed object
@dataclass(frozen=True)
class CleansingRequest:
    sensor: Sensor
    rows: list[CleansingRow]

request = parse_cleansing_request(serializer.validated_data)
```

```ts
// Avoid: three flags allow a state that cannot exist
type State = { loading: boolean; error?: string; data?: Report }

// Prefer: one variant at a time, and `switch` is checked for completeness
type State =
  | { kind: "loading" }
  | { kind: "failed"; error: string }
  | { kind: "ready"; data: Report }
```

## The Tests

- Can two arguments of the same primitive type be swapped without the checker noticing?
- Where does untyped data become a typed model, and does everything after that point use the model?
- Is this type a hand-written copy of a shape a schema already defines?
- Does the type allow a combination of fields that can never occur?
- If someone adds a variant, will a missed branch fail to compile or type-check?

**Constraint:** Add a type only when it prevents a real mix-up or invalid state. Do not wrap every `int`. Do not add `cast` or `Any` to make a checker pass; that removes the guarantee this skill exists for.
