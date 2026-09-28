# Citation Style & Source Provenance

Contract for citing technical evidence, specifications, and external documentation.

## Natural Markdown Link Format

Use descriptive link anchors with context badges instead of machine prefixes or raw URLs:

```text
Local File:    [Local <Kind> (<path>:<line>)](<path>#L<line>)
Library Docs:  [<Library> Docs: <Topic>](context7://<lib>/<topic>)
Official Docs: [<Product/Spec Name>](<url>)
```

| Source Type | Anchor Label | Destination Target |
| --- | --- | --- |
| Local File / Config | `Local Manifest (package.json:24)` | `./package.json#L24` |
| Library Docs (Context7) | `Celery Docs: Task Retries` | `context7://celery/task-retries` |
| Official Web Docs / Spec | `AeroSpace Guide` | `https://nikitabobko.github.io/AeroSpace/guide` |

Never output uncited technical claims or raw unadorned URLs.
---

## Placement & Density Rules

Avoid repeating identical links across consecutive lines.

### 1. Section or Block Scope (Default)

When an entire section or procedure derives from one or two primary sources, declare them once in a quote block under the heading:

```markdown
### Worker Connection Pool
> Sources:
> - [Celery Docs: Task Retries](context7://celery/task-retries)

Configure the broker pool with explicit reconnect timeouts:
- Set `broker_connection_retry_on_startup = True` during cold boot.
- Default backoff multiplier is `2.0` with a max delay of 60 seconds.
```

### 2. Footnotes for Mixed Sources

When steps or bullets in one section cite different sources, place footnote markers (`[^1]`, `[^2]`) in the body and collect links at the section or document footer:

```markdown
### Mutual TLS Migration Steps

1. Generate client certificates using the local script.[^1]
2. Configure Nginx upstream to enforce TLS v1.3.[^2]
3. Point the client at the mounted certificate path.[^3]

---
[^1]: [Local PKI Script (scripts/certs.sh:15)](./scripts/certs.sh#L15)
[^2]: [Nginx SSL Module Guide](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)
[^3]: [HTTPX Docs: SSL Verification](context7://httpx/client-ssl)
```

### 3. Inline Tags for Single Isolated Facts

Use inline links only for standalone notes or multi-source comparison tables:

| Option | Default | Constraint | Source |
| --- | --- | --- | --- |
| `max_connections` | `100` | Kernel `somaxconn` limit | [Cloud Run Resource Limits](https://cloud.google.com/run/docs/configuring/cpu) |
| `idle_timeout` | `30s` | Edge proxy TTL boundary | [FastAPI Settings](https://fastapi.tiangolo.com/tutorial/) |
---

## Red Flags
- Emitting raw machine provenance prefixes like `Source: Repo /` or `Source: WebSearch /`.
- Citing unverified memory without primary documentation backing.
