# Pre-publish review notes

This project was reviewed against the failure modes that matter most for Notion → Google Calendar synchronization.

## Ship-blocker checks performed

### Webhook retries / duplicate creation

Checked that:

- Notion page identity is not based on event title.
- Calendar identity is stored both in Notion and private Apps Script Script Properties.
- Calendar events carry a private Notion page-ID tag.
- creation and live mutation paths run under a script-wide lock.
- mapping is stored before the metadata PATCH back to Notion.

Result: no confirmed duplicate-creation bug found in the normal retry/concurrency paths.

### Update racing with delete

Initial review found that the direct `page.deleted` path should use the same lock as create/update paths.

Fix applied before publication: deletion webhooks now execute under the script lock.

### Out-of-order / stale webhook events

Notion webhook payloads are not treated as authoritative state. Create/update/restore/move handlers fetch the current Notion page before deciding Calendar state.

### Destructive Calendar safety

Every production `deleteEvent()` path was inspected.

The code does not delete events by title or time similarity. It requires ownership evidence from the private Notion page tag and/or redundant stored event identity.

### Notion outage vs. page deletion

Reconciliation first retrieves the configured data source as a health check. A broken token/data-source connection therefore does not immediately translate into "delete all missing mapped events."

### Manual Calendar deletion

A mapped Notion page whose Google event no longer resolves causes reconciliation to create one replacement event and update stored identity.

### Manual Calendar modification

Reconciliation rewrites title, description, and time from Notion, preserving the project's Notion-authoritative contract.

### Schema mismatch

`validateSetup()` checks:

- required title property type;
- required schedule Date property type;
- optional property types;
- required select option names when a sync-status Select is configured;
- Notion connectivity;
- Calendar accessibility;
- Calendar vs. Apps Script timezone mismatch.

## Security review

No real token, webhook secret, deployment URL, private data-source ID, or personal email from the original working installation is intentionally included in this repository.

The main security limitation is documented in `SECURITY.md`: Apps Script's documented web-app event object does not expose arbitrary incoming HTTP headers, so the implementation cannot directly validate Notion's `X-Notion-Signature`. A long random secret embedded in the webhook URL is used as a compensating control.

For hostile/regulatory production environments, use an HMAC-validating proxy before Apps Script.

## Known residual risks / limitations

1. There is an unavoidable tiny partial-failure window between Google Calendar event creation and the first durable identity write. Apps Script/Calendar does not provide a cross-system transaction. The lock + redundant identity design minimizes ordinary retry races but is not a distributed transaction.
2. If an operator manually destroys both redundant identity stores (`Google Calendar Event ID` in Notion and `MAP_<page-id>` in Script Properties), the script may lose the ability to identify a previously created event.
3. Very large databases can eventually run into Apps Script runtime/quota constraints; the current design targets normal personal/small-team scheduling workloads.
4. Recurrence, guests, reminders, and true Calendar → Notion editing are outside this project's scope.

## Review tooling

`AI_REVIEW_COUNCIL.md` contains a reusable five-role adversarial prompt for running future changes through an independent AI/model/session before merging them.
