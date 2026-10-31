# Scenario and Evidence Template

Use one record per user-approved case. Keep expected outcomes separate from observed results.

## Planned case

|Field|Value|
|---|---|
|ID / user goal|`E2E-01` / …|
|Source|Spec path and acceptance criterion, or user-approved case|
|Preconditions / synthetic data|…|
|Browser action|…|
|Expected visible outcome|…|
|API operation / expected contract|…|
|Expected database state|…|
|Evidence to capture|Screenshot; redacted API observation; DB observation; test log|
|Cleanup|Only data created by this test|
|Approval|Accepted / rejected / unresolved|
|Status|`PLANNED` until execution|

## Observed result

|Field|Value|
|---|---|
|Browser|PASS / FAIL / BLOCKED / NOT RUN. Observed result|
|API|PASS / FAIL / BLOCKED / NOT RUN. Status and contract result|
|Database|PASS / FAIL / BLOCKED / NOT RUN. Independent state observation|
|Case status|PASS / FAIL / BLOCKED / NOT RUN|
|Evidence links|Screenshot and artifact paths/URLs|
|First mismatch / blocker|…|
|Cleanup result|…|

Mark a case PASS only when all required checks ran and matched. If a layer is not applicable, record why in the plan and get that scope accepted before execution. Never claim an artifact exists without capturing it. Redact credentials and personal data from evidence.
