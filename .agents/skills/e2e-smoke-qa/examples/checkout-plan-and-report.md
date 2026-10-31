# Example: checkout plan and report

Illustrative data for a hypothetical run.

## Before execution: plan only

- **ID:** E2E-01
- **Source and goal.** user-approved checkout acceptance criterion.
- **Browser.** Add one synthetic item and submit.
- **API.** `POST /api/orders` Returns the documented success response and order ID.
- **Database.** An order exists with the expected item, amount, and status.
- **Evidence.** Save a confirmation screenshot and redacted API response. Include the database observation and test log.
- **Status:** PLANNED

The companion shows the plan without outcome badges or evidence links until the run occurs.

## After execution: illustrative result

- **Browser.** PASS. Confirmation displayed. Screenshot: `artifacts/E2E-01-confirmation.png`
- **API.** PASS. Expected success response and order ID. `artifacts/E2E-01-api.json`
- **Database.** FAIL. No matching order row. `artifacts/E2E-01-db.txt`
- **Case status.** FAIL. Persistence did not match the expected state.

The final report gives the first mismatch and links the artifacts and complete companion URL. It cannot mark this case PASS because the database check failed.
