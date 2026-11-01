# Runbook: Celery Worker Queue Recovery

This runbook guides queue clearing and consumer restart when task processing stalls.

> **Index:**
>
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | Symptoms and Triggers | L15-L22 | [#symptoms-and-triggers](#symptoms-and-triggers) |
> | Preflight Checks | L23-L50 | [#preflight-checks](#preflight-checks) |
> | Recovery Steps | L51-L80 | [#recovery-steps](#recovery-steps) |
> | Verification | L81-L97 | [#verification](#verification) |
> | Rollback | L98-L113 | [#rollback](#rollback) |

## Symptoms and Triggers

- Redis queue length exceeds 5,000 pending items on `default_queue`.
- Celery worker log records repeated `WorkerLostError` entries.
- Telemetry processing latency exceeds 15 minutes.

---

## Preflight Checks

Confirm worker daemon and broker status before mutating queues:

```bash
celery -A apm status
```

Expected output:

```text
-> celery@worker-app: OK
```

Confirm Redis broker connectivity:

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

Expected output:

```text
PONG
```

---

## Recovery Steps

Follow these recovery steps in order:

### Step 1: Revoke stalled tasks

Cancel stalled active tasks to prevent cascading database transaction deadlocks:

```bash
celery -A apm control purge
```

Expected output:

```text
Purged 0 messages
```

### Step 2: Restart Celery worker service

Restart the worker process under the system service manager:

```bash
sudo service celery-worker restart
```

Gate: confirm exit code is 0 before proceeding to verification.

---

## Verification

Confirm consumers are active and accepting tasks:

```bash
celery -A apm inspect active_queues
```

Expected output:

```text
-> celery@worker-app:
    * {'name': 'default_queue', 'routing_key': 'default'}
```

---

## Rollback

If the worker fails to reconnect within 60 seconds, follow these rollback actions:

1. Restore prior service configuration:

   ```bash
   sudo service celery-worker revert
   ```

2. Restart worker in fallback single-process mode:

   ```bash
   celery -A apm worker --concurrency=1 --loglevel=INFO
   ```
