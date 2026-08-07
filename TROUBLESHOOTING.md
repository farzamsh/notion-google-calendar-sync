# Troubleshooting

## Nothing appears in Google Calendar

Check in this order:

1. Run `validateSetup()`.
2. Run `testCalendarAccess()`.
3. Confirm the Notion row uses a real Date property configured as `PROP_SCHEDULE`.
4. Confirm the Notion connection has Content access to the data source.
5. Confirm the webhook is Verified/Active.
6. Apps Script → Executions → inspect the latest `doPost` failure.
7. Confirm the production `/exec` deployment contains your latest code version.

## `NOTION_TOKEN is missing`

Apps Script → Project Settings → Script Properties.

Add:

```text
NOTION_TOKEN
```

Do not put `Bearer ` in the value.

## 404 retrieving Notion data source

Common causes:

- wrong ID (database page ID instead of data source ID);
- connection does not have Content access;
- token belongs to a different workspace;
- data source was moved/deleted.

## `Required Notion property not found`

`validateSetup()` could not find the configured title or schedule property.

Either rename the Notion property to the default or add the matching Script Property:

```text
PROP_TITLE
PROP_SCHEDULE
```

Property names are exact.

## Optional property not found

This is not necessarily an error. The integration can run with only title + schedule.

However, `Google Calendar Event ID`, sync status, and last sync are recommended for observability and redundant identity tracking.

## Duplicate Calendar events

Stop and diagnose before deleting anything in bulk.

Check:

1. Do you have more than one Notion webhook subscription hitting the same Apps Script endpoint?
2. Did you create more than one Apps Script deployment connected to Notion?
3. Was `MAP_<page-id>` manually deleted from Script Properties?
4. Was the Notion `Google Calendar Event ID` field manually erased?
5. Did someone replace the source code with a create-only script?
6. Is the webhook connected to two separate copies of the Notion row/data source?

Run `reconcileNotionToCalendar()` once and inspect the Execution log.

Do not use title matching as a deduplication strategy.

## Event updates in Notion but Calendar stays old

Usually the deployed Web App is running an older code version.

Apps Script:

**Deploy → Manage deployments → Edit → New version → Deploy**

Then change the Notion item again.

## Webhook created but verification token never arrives

Check:

- deployment URL ends in `/exec`, not `/dev`;
- web app permits access without Google sign-in;
- URL includes `?key=<WEBHOOK_SECRET>`;
- Script Property `WEBHOOK_SECRET` exists;
- Apps Script Executions shows a `doPost` invocation.

If needed, use Notion's **Resend token** action.

## Unauthorized webhook request

The query-string secret does not match `WEBHOOK_SECRET` in Script Properties.

Rebuild the webhook URL exactly:

```text
<YOUR_EXEC_URL>?key=<WEBHOOK_SECRET>
```

If the webhook has already been verified and you need to change its URL, recreate the Notion webhook subscription.

## Dates are off by one day

Compare:

```text
Calendar timezone
Apps Script project timezone
```

Run `validateSetup()`; it prints both.

Set Apps Script's timezone to match the target Calendar, especially for all-day events.

## Timed event is 60 minutes instead of expected duration

The Notion duration property is missing, empty, or mapped to the wrong name.

Default:

```text
PROP_DURATION = Duration (minutes)
DEFAULT_EVENT_MINUTES = 60
```

## Notion status says `Sync error`

Open Apps Script → Executions and inspect the corresponding failed run.

The error status is diagnostic; fixing the underlying issue and causing another Notion update/reconciliation should allow the item to sync again.

## I manually deleted a Calendar event

Run:

```text
reconcileNotionToCalendar
```

If the Notion page is still scheduled, the event should be recreated once.

## I manually edited a Calendar event

That is not the supported edit path. Notion is authoritative.

Run reconciliation or wait for the 15-minute trigger. The Calendar event should return to the Notion title/time/description.

## Page moved out of the Notion data source

The `page.moved` webhook allows a page-specific Notion 404 to be treated as removal. The Calendar mirror should be deleted if it was previously mapped.

If not, run reconciliation and inspect the log.
