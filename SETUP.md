# Setup — beginner step by step

Follow these steps in order. Do not enable the webhook until the Notion API and Calendar tests both pass.

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

For `Calendar Sync Status`, add these options exactly unless you plan to override their names:

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

Enable these content capabilities:

```text
Read content       ON
Update content     ON
Insert content     OFF (not required)
```

Comments and user information are not required.

Copy the connection's integration/access token and keep it secret.

## 3. Give the connection content access

In the connection's **Content access** section, grant it access to only the Notion database/data source you want synchronized.

Do not grant your entire workspace unless you actually need that.

## 4. Find the Notion data source ID

With modern Notion APIs, synchronization queries the **data source ID**, not just the database page ID.

You can get it using the Notion API, developer tools, or an AI assistant following [AI_SETUP_GUIDE.md](AI_SETUP_GUIDE.md).

It looks like a UUID:

```text
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 5. Create the Google Apps Script project

Open:

```text
https://script.google.com
```

Create a new project, for example:

```text
Notion to Google Calendar
```

Open `src/Code.gs` from this repository, copy the entire file, and paste it into Apps Script's `Code.gs`.

Save.

## 6. Store secrets in Script Properties

In Apps Script:

**Project Settings → Script Properties**

Add:

```text
NOTION_TOKEN = your Notion integration token
NOTION_DATA_SOURCE_ID = your data source UUID
```

Do not add `Bearer ` before the token.

### Create the webhook secret

Run this function once from the Apps Script editor:

```text
createWebhookSecret
```

It stores a random `WEBHOOK_SECRET` directly in Script Properties.

Open Script Properties and confirm that these now exist:

```text
NOTION_TOKEN
NOTION_DATA_SOURCE_ID
WEBHOOK_SECRET
```

## 7. Select the Google Calendar

By default, the script uses the Google account's primary/default calendar.

If you want a different calendar, add:

```text
GOOGLE_CALENDAR_ID = the calendar ID
```

You must have edit access to that calendar.

## 8. Configure property names if your database uses different names

You do **not** need to edit the JavaScript.

Add Script Properties for any names that differ from the defaults:

```text
PROP_TITLE
PROP_SCHEDULE
PROP_DURATION
PROP_DESCRIPTION
PROP_OUTPUT
PROP_EVENT_ID
PROP_SYNC_STATUS
PROP_LAST_SYNC
```

Example:

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

If your select option names differ, override:

```text
STATUS_NOT_IN_CALENDAR
STATUS_SYNCED
STATUS_ERROR
```

You can also override the default duration used when a timed Notion Date has no end time and no duration value:

```text
DEFAULT_EVENT_MINUTES = 60
```

## 9. Validate Notion and Calendar access

Run:

```text
validateSetup
```

The Execution log should show:

```text
Notion API: OK
Data source: ...
Calendar: ...
Setup validation completed
```

If the Calendar and Apps Script timezones differ, change the Apps Script project timezone to match your Calendar timezone before relying on all-day events.

Then run:

```text
testCalendarAccess
```

It creates and immediately deletes a 15-minute test event. Approve Google Calendar permissions when prompted.

Do not continue until both tests pass.

## 10. Deploy Apps Script as a Web App

Apps Script:

**Deploy → New deployment → Web app**

Use:

```text
Execute as: Me / User deploying the web app
Who has access: the option that permits anonymous public access
```

The exact UI wording can vary. Notion's servers must be able to POST without signing into Google.

After deployment, copy the URL ending in:

```text
/exec
```

Do not use the `/dev` test URL.

Treat the final webhook URL as secret.

## 11. Build the private webhook URL

Read `WEBHOOK_SECRET` from Script Properties.

If your Apps Script URL is:

```text
https://script.google.com/macros/s/XXXXXXXX/exec
```

then the URL you give Notion is:

```text
https://script.google.com/macros/s/XXXXXXXX/exec?key=YOUR_WEBHOOK_SECRET
```

Never publish this complete URL.

## 12. Create the Notion webhook subscription

Open your Notion connection → **Webhooks** → create a subscription.

Use API version:

```text
2026-03-11
```

Webhook URL: the private URL from Step 11.

Subscribe to:

```text
page.created
page.properties_updated
page.deleted
page.undeleted
page.moved
```

You do not need `page.content_updated` unless you modify this project to synchronize page body blocks.

Create the subscription.

## 13. Verify the Notion webhook

When the subscription is created, Notion sends a one-time `verification_token` POST to Apps Script.

In Apps Script run:

```text
showVerificationToken
```

Copy the token from the Execution log and paste it into Notion's verification dialog.

Do not publish this verification token.

Once verified, the webhook is live.

## 14. Deploy code changes correctly

Saving Apps Script code does not necessarily update a versioned production deployment.

Whenever you change production code:

**Deploy → Manage deployments → Edit existing Web App deployment → New version → Deploy**

Update the existing deployment rather than creating a new URL unless you intentionally want to recreate the Notion webhook subscription.

## 15. Run the first live test

Create one test Notion row:

```text
Name: TEST - Notion Calendar Sync
Schedule: a time 1 hour from now
Duration (minutes): 30
```

Expected result:

- exactly one Google Calendar event appears;
- title and time match;
- `Google Calendar Event ID` fills automatically if that property exists;
- `Calendar Sync Status` becomes `Synced` if that property exists;
- `Last Calendar Sync` fills if that property exists.

Do not continue if two events are created. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 16. Install the reconciliation trigger

After the live create/update/delete tests pass, run once:

```text
installReconciliationTrigger
```

This creates a 15-minute repair job.

It is intentionally installed **after** the initial test so a bad configuration cannot mass-create events before you notice it.

## 17. Complete the full test matrix

Follow [TESTING.md](TESTING.md) before depending on the integration.

## 18. Maintenance

Usually there is nothing to do.

Check the Apps Script **Executions** page if something stops syncing.

If you rotate the Notion token, update `NOTION_TOKEN` in Script Properties.

If you recreate the Notion webhook subscription, update/verify its new verification token. If the webhook URL changes, recreate the subscription in Notion.
