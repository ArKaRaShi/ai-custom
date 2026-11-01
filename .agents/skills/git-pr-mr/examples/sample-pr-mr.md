# Illustrative PR and MR structures

These examples illustrate structure, not a mandatory template. Adapt sections and detail to the change and repository conventions. NEVER copy example facts, values, commands, results, or links into a real description unless independently verified.

## Complete example

````markdown
fix(orders): retry transient delivery failures

## Summary
Temporary delivery failures currently discard order events. Retry transient failures so recoverable deliveries can succeed.

## What's included
- Retry delivery after a transient server error.
- Stop retrying after the configured attempt limit.

## Testing
- `pytest tests/test_delivery.py`: 3 passed, including retries and the attempt limit.
````

## Summary

```markdown
<!-- Avoid: outcome without context -->
## Summary
Update order delivery.

<!-- Prefer: problem and outcome -->
## Summary
Temporary delivery failures discard order events. Retry transient failures so recoverable deliveries can succeed.
```

The first description leaves reviewers unable to judge the reason for the change.

## What's included

```markdown
<!-- Avoid: file inventory without behavior -->
## What's included
- Change delivery.py and settings.py.

<!-- Prefer: observable behavior -->
## What's included
- Retry delivery after a transient server error.
- Stop retrying after the configured attempt limit.
```

A file inventory makes reviewers reconstruct the behavior from the diff.

## Configuration

Use one `dotenv` block, filled only from verified configuration. Sensitive and unknown values remain blank.

````markdown
## Configuration

```dotenv
#required
API_KEY=

#optional
PORT=3000
```

When `PORT` is unset, the application uses port 3000.
````

## Migrations and deployment

```markdown
<!-- Avoid: omitting a destructive step -->
## Migrations and deployment
Run the database migration.

<!-- Prefer: name the consequence and verified command -->
## Migrations and deployment
The migration drops the legacy `orders.note` column and its data. Run `make migrate` before deploying the application.
```

Hiding a destructive migration can cause irreversible data loss. Verify commands and deploy order for the real change.

## Performance

```markdown
<!-- Avoid: unsupported improvement -->
## Performance
The endpoint is faster.

<!-- Prefer: measurement and conditions -->
## Performance
In a local benchmark with 1,000 records, median response time fell from 80 ms to 50 ms.
```

Unmeasured claims can mislead reviewers. Include numbers only when an actual measurement supports them.

## Breaking changes

```markdown
<!-- Avoid: naming a break without migration guidance -->
## Breaking changes
The `status` field changed.

<!-- Prefer: describe the old and new contracts -->
## Breaking changes
Replace reads of `status` with `state` in API clients before deploying this version.
```

Without a migration instruction, consumers can continue using the removed contract and fail after deployment.

## Testing

```markdown
<!-- Avoid: an unverifiable result -->
## Testing
Tests passed.

<!-- Prefer: command and observed outcome -->
## Testing
- `pytest tests/test_delivery.py`: 3 passed.
```

A generic claim does not identify the checks that ran. Never report an unrun command as passing.

## Related requests

When real dependencies exist, add their actual GitHub PR or GitLab MR URLs in a final section. Do not invent links or include an empty section.
