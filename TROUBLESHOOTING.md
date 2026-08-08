# Troubleshooting

## Notion says webhook delivery is paused / failed for hours

If Notion was configured to call a Google Apps Script `/exec` URL directly, this is the most likely cause.

Google Apps Script `ContentService` serves its response through a redirect to `script.googleusercontent.com`. Your Apps Script code can execute successfully, create/update the Calendar event, and still fail Notion's webhook acknowledgement requirement because Notion expects HTTP `200` from the webhook endpoint.

Symptoms:

- Calendar sync appears to work at first;
- Notion retries webhook deliveries;
- duplicate-safe code prevents visible duplicate damage;
- several hours later Notion pauses delivery.

Fix:

1. Do **not** resume the old direct webhook.
2. Follow current [SETUP.md](SETUP.md).
3. Put `worker/notion-webhook-proxy.js` in front of Apps Script.
4. Recreate the Notion webhook using the Cloudflare Worker URL.
5. Configure `NOTION_VERIFICATION_TOKEN` in Cloudflare before activating the subscription.
6. Delete the obsolete direct Notion → Apps Script webhook subscription.

## Nothing appears in Google Calendar

Check in this order:

1. Run `validateSetup()`.
2. Run `testCalendarAccess()`.
3. Confirm the Notion row uses a real Date property configured as `PROP_SCHEDULE`.
4. Confirm the Notion connection has Content access to the data source.
5. Confirm the Notion webhook is Verified/Active and points to the Cloudflare Worker, **not** Apps Script directly.
6. Check Cloudflare Worker logs.
7. Apps Script → Executions → inspect the latest `doPost` failure.
8. Confirm the production `/exec` deployment contains your latest code version.

## `NOTION_TOKEN is missing`

Apps Script → Project Settings → Script Properties.

Add `NOTION_TOKEN`. Do not put `Bearer ` in the value.

## 404 retrieving Notion data source

Common causes:

- wrong ID (database page ID instead of data source ID);
- connection does not have Content access;
- token belongs to a different workspace;
- data source was moved/deleted.

## `Required Notion property not found`

`validateSetup()` could not find the configured title or schedule property.

Either rename the Notion property to the default or add matching Script Properties such as `PROP_TITLE` and `PROP_SCHEDULE`. Property names are exact.

## Duplicate Calendar events

Stop and diagnose before deleting anything in bulk.

Check:

1. Is there more than one active Notion webhook subscription for this sync?
2. Is an obsolete direct Notion → Apps Script webhook still active alongside the Worker webhook?
3. Did you create more than one Apps Script deployment being forwarded to?
4. Was `MAP_<page-id>` manually deleted from Script Properties?
5. Was the Notion Google event ID manually erased?
6. Did someone replace the code with a create-only script?

Run `reconcileNotionToCalendar()` once and inspect the log. Do not use title matching for deduplication.

## Event updates in Notion but Calendar stays old

Check both layers:

1. Cloudflare Worker logs — did it accept and forward the event?
2. Apps Script Executions — did `doPost` run?
3. Confirm the deployed Web App is the latest code version.

For Apps Script changes:

**Deploy → Manage deployments → Edit → New version → Deploy**

## Verification token never arrives

Check:

- Cloudflare Worker has `APPS_SCRIPT_URL` and `APPS_SCRIPT_KEY` secrets;
- `APPS_SCRIPT_URL` ends in `/exec` and has no `?key=` appended manually;
- `APPS_SCRIPT_KEY` exactly matches Apps Script `WEBHOOK_SECRET`;
- Worker logs show the verification POST;
- Apps Script Executions shows `doPost`.

Use Notion's **Resend token** if necessary.

## Worker returns `Signature verification not configured`

Add this Cloudflare secret before clicking Verify in Notion:

```text
NOTION_VERIFICATION_TOKEN
```

Its value is the one-time token shown by Apps Script `showVerificationToken()`.

## Worker returns `Invalid signature`

Likely causes:

- wrong verification token stored in Cloudflare;
- webhook subscription was deleted/recreated but Worker still has the old token;
- the request did not originate from Notion.

If the subscription was recreated, replace `NOTION_VERIFICATION_TOKEN` with the new token.

## Apps Script says `Unauthorized webhook request`

Cloudflare `APPS_SCRIPT_KEY` does not match Apps Script `WEBHOOK_SECRET`.

Generate/rotate the key if needed and update both sides.

## Dates are off by one day

Compare Calendar timezone and Apps Script project timezone. Run `validateSetup()`; it prints both. Set Apps Script's timezone to match the target Calendar, especially for all-day events.

## Timed event is 60 minutes instead of expected duration

The Notion duration property is missing, empty, or mapped to the wrong name.

Defaults:

```text
PROP_DURATION = Duration (minutes)
DEFAULT_EVENT_MINUTES = 60
```

## Notion status says `Sync error`

Open Apps Script → Executions and inspect the corresponding failed run. Fix the underlying issue, then trigger another Notion update or run reconciliation.

## I manually deleted a Calendar event

Run `reconcileNotionToCalendar`. If the Notion page is still scheduled, the event should be recreated once.

## I manually edited a Calendar event

Notion is authoritative. Run reconciliation or wait for the 15-minute trigger; Calendar should return to the Notion title/time/description.

## Page moved out of the Notion data source

The `page.moved` webhook allows a page-specific Notion 404 to be treated as removal. If the mirror does not disappear, run reconciliation and inspect the log.
