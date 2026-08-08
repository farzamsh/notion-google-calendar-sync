# Setup — beginner step by step

Follow these steps in order. Do not activate the Notion webhook until Notion API access, Google Calendar access, Apps Script deployment, and the Cloudflare Worker are all ready.

## 1. Prepare your Notion data source

Use an existing Notion database/data source or create one.

Minimum required properties:

| Name | Type |
|---|---|
| `Name` | Title |
| `Schedule` | Date |

Recommended properties:

| Name | Type |
|---|---|
| `Duration (minutes)` | Number |
| `Description` | Text |
| `Expected output` | Text |
| `Google Calendar Event ID` | Text |
| `Calendar Sync Status` | Select |
| `Last Calendar Sync` | Date |

For `Calendar Sync Status`, add these options exactly unless you override their names:

```text
Not in calendar
Synced
Sync error
```

`Schedule` must be a real Notion **Date** property, not text.

## 2. Create the Notion connection

Open Notion's developer page and create a workspace-scoped/internal connection.

Suggested name:

```text
Google Calendar Sync
```

Enable:

```text
Read content       ON
Update content     ON
Insert content     OFF (not required)
```

Copy the connection's integration/access token and keep it secret.

## 3. Give the connection content access

In the connection's **Content access** section, grant it access only to the Notion database/data source you want synchronized.

## 4. Find the Notion data source ID

Use [FIND_DATA_SOURCE_ID.md](FIND_DATA_SOURCE_ID.md).

It looks like:

```text
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 5. Create the Google Apps Script project

Open:

```text
https://script.google.com
```

Create a new project and copy the complete contents of `src/Code.gs` into Apps Script's `Code.gs`.

Save.

## 6. Store Apps Script secrets

Apps Script → **Project Settings → Script Properties**

Add:

```text
NOTION_TOKEN = your Notion integration token
NOTION_DATA_SOURCE_ID = your data source UUID
```

Do not add `Bearer ` before the token.

Run once:

```text
createWebhookSecret
```

This creates:

```text
WEBHOOK_SECRET
```

The value will later be copied into Cloudflare as `APPS_SCRIPT_KEY`. Do not send it to anyone and do not put it in the Notion webhook URL.

## 7. Select the Google Calendar

By default the script uses the primary/default calendar.

For another calendar, add:

```text
GOOGLE_CALENDAR_ID = your calendar ID
```

## 8. Configure custom Notion property names

You do **not** need to edit JavaScript.

Optional Script Properties:

```text
PROP_TITLE
PROP_SCHEDULE
PROP_DURATION
PROP_DESCRIPTION
PROP_OUTPUT
PROP_EVENT_ID
PROP_SYNC_STATUS
PROP_LAST_SYNC
STATUS_NOT_IN_CALENDAR
STATUS_SYNCED
STATUS_ERROR
DEFAULT_EVENT_MINUTES
```

Persian example:

```text
PROP_TITLE = عنوان
PROP_SCHEDULE = زمان‌بندی
PROP_DURATION = مدت تخمینی (دقیقه)
PROP_DESCRIPTION = توضیحات اجرایی
PROP_OUTPUT = خروجی مورد انتظار
PROP_EVENT_ID = شناسه رویداد تقویم
PROP_SYNC_STATUS = وضعیت تقویم
PROP_LAST_SYNC = آخرین همگام‌سازی
```

## 9. Validate Notion and Calendar access

Run:

```text
validateSetup
```

Then run:

```text
testCalendarAccess
```

Do not continue until both pass.

## 10. Deploy Apps Script as a Web App

Apps Script:

**Deploy → New deployment → Web app**

Use:

```text
Execute as: Me / User deploying the web app
Who has access: the option that permits anonymous public access
```

Copy the production URL ending in:

```text
/exec
```

Do not use `/dev`.

### Why Notion does NOT call this URL directly

Google Apps Script `ContentService` responses are delivered through a redirect to `script.googleusercontent.com`. Notion expects a direct HTTP `200` response to acknowledge webhook delivery. A direct Notion → Apps Script webhook can therefore execute successfully while Notion still considers delivery failed and eventually pauses the subscription.

The next step adds a tiny Cloudflare Worker that returns a real `200`, validates Notion's signature, and forwards the payload to Apps Script.

## 11. Create the free Cloudflare Worker

Create a Cloudflare account if you do not have one.

In Cloudflare:

**Workers & Pages → Create application → Create Worker**

Open the Worker editor and replace its starter code with the complete contents of:

```text
worker/notion-webhook-proxy.js
```

Deploy it.

You will receive a URL similar to:

```text
https://notion-google-calendar-sync.YOUR-SUBDOMAIN.workers.dev
```

This is the URL Notion will call.

## 12. Add Cloudflare Worker secrets

Cloudflare Worker → **Settings → Variables and Secrets → Add**

Add these as **Secret** values:

```text
APPS_SCRIPT_URL
APPS_SCRIPT_KEY
```

Values:

```text
APPS_SCRIPT_URL = https://script.google.com/macros/s/XXXXXXXX/exec
APPS_SCRIPT_KEY = the Apps Script WEBHOOK_SECRET value
```

Do not add `?key=` to `APPS_SCRIPT_URL`. The Worker adds it internally.

Do **not** add `NOTION_VERIFICATION_TOKEN` yet. You do not know it yet.

Deploy the Worker configuration changes.

## 13. Create the Notion webhook subscription

Open your Notion connection → **Webhooks** → create a subscription.

Use API version:

```text
2026-03-11
```

Webhook URL:

```text
https://YOUR-WORKER.workers.dev
```

Subscribe to:

```text
page.created
page.properties_updated
page.deleted
page.undeleted
page.moved
```

Create the subscription, but **do not click Verify yet**.

## 14. Retrieve the verification token

The Cloudflare Worker forwards Notion's initial verification request to Apps Script.

In Apps Script run:

```text
showVerificationToken
```

Copy the token from the execution log.

Do not publish it.

## 15. Add Notion signature verification to Cloudflare

Before activating the webhook, add one more Cloudflare Worker secret:

```text
NOTION_VERIFICATION_TOKEN = the token you just retrieved
```

Deploy the Worker configuration change.

This enables validation of Notion's `X-Notion-Signature` HMAC-SHA256 signature for all live webhook events.

## 16. Verify the Notion webhook

Return to Notion's webhook verification dialog.

Paste the same verification token and click **Verify**.

The subscription should become active.

## 17. Test a real sync

Create one test Notion row:

```text
Name: TEST - Notion Calendar Sync
Schedule: a time 1 hour from now
Duration (minutes): 30
```

Expected:

- exactly one Google Calendar event appears;
- title/time match;
- event ID metadata fills if configured;
- sync status becomes `Synced` if configured;
- last sync timestamp fills if configured.

Then change the title/time and confirm the **same** event updates.

## 18. Install the reconciliation trigger

Only after live tests pass, run once:

```text
installReconciliationTrigger
```

This creates a 15-minute self-healing job.

## 19. Complete the full test matrix

Follow [TESTING.md](TESTING.md).

## 20. Deploy future Apps Script code changes correctly

Saving code does not necessarily update a versioned production deployment.

Use:

**Deploy → Manage deployments → Edit existing Web App deployment → New version → Deploy**

Keep the same Apps Script `/exec` URL so the Cloudflare `APPS_SCRIPT_URL` secret does not need to change.

## 21. Secret rotation

If `WEBHOOK_SECRET` / `APPS_SCRIPT_KEY` is ever exposed:

1. Run `createWebhookSecret` again in Apps Script.
2. Copy the new Apps Script `WEBHOOK_SECRET`.
3. Replace the Cloudflare `APPS_SCRIPT_KEY` secret with the new value.
4. Deploy the Worker settings.

If the Notion verification token is exposed, recreate the Notion webhook subscription and update the Worker `NOTION_VERIFICATION_TOKEN`.

## 22. Maintenance

Normally there is nothing to do.

If syncing stops:

1. Check Notion webhook status.
2. Check Cloudflare Worker logs.
3. Check Apps Script **Executions**.
4. Run `reconcileNotionToCalendar()` manually if needed.
