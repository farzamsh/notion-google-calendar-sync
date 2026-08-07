# Notion → Google Calendar Sync

A free, serverless Notion → Google Calendar synchronization layer built with **Notion Webhooks + Google Apps Script**.

Notion is the **source of truth**. Google Calendar is a **mirror**.

No Zapier, Make, paid automation plan, VPS, or always-on computer is required.

## What it does

- Creates a Google Calendar event when a Notion item receives a schedule.
- Updates the same event when the Notion title, date, time, duration, or description changes.
- Deletes the Google event when the Notion schedule is removed.
- Deletes the Google event when the Notion page is trashed.
- Recreates the event when a Notion page is restored.
- Handles pages moved out of the synchronized data source.
- Prevents duplicate creation with redundant event identity storage.
- Uses `LockService` to avoid concurrent webhook races.
- Fetches the latest Notion page state instead of trusting possibly stale webhook payloads.
- Includes a 15-minute reconciliation job to repair missed webhooks and manually modified/deleted Calendar events.
- Supports all-day dates, all-day date ranges, explicit start/end times, and duration-based end times.
- Works with the default Google Calendar or a chosen calendar ID.
- Supports custom Notion property names without editing source code.

## Important scope

This project is intentionally **one-way authoritative sync**:

```text
Notion  ───────────────►  Google Calendar
source of truth             mirror
```

If you manually change an event in Google Calendar, the next sync/reconciliation pass will restore the Notion value. This avoids ambiguous two-way conflict resolution.

## Architecture

```text
Notion database/data source
        │
        │ page.created / page.properties_updated /
        │ page.deleted / page.undeleted / page.moved
        ▼
Notion Webhook
        │
        │ HTTPS POST + private URL secret
        ▼
Google Apps Script Web App
        │
        ├── Fetch latest page from Notion API
        ├── Compare against Google event
        ├── Create / update / delete event
        ├── Save event identity redundantly
        └── Write sync metadata back to Notion
        │
        ▼
Google Calendar

Every 15 minutes:
Apps Script reconciliation ─► repairs missed or manually changed events
```

## Quick start

If you want the exact beginner-friendly installation path, open **[SETUP.md](SETUP.md)** and follow it in order.

If you want an AI assistant to walk you through installation one step at a time, give it **[AI_SETUP_GUIDE.md](AI_SETUP_GUIDE.md)**.

## Recommended Notion properties

The code only *requires* the first two. The others make synchronization safer and easier to inspect.

| Property | Type | Default name | Required? |
|---|---|---|---|
| Task title | Title | `Name` | Yes |
| Calendar schedule | Date | `Schedule` | Yes |
| Duration | Number | `Duration (minutes)` | No |
| Description | Text | `Description` | No |
| Expected output | Text | `Expected output` | No |
| Google event identity | Text | `Google Calendar Event ID` | Strongly recommended |
| Sync status | Select | `Calendar Sync Status` | Recommended |
| Last sync timestamp | Date | `Last Calendar Sync` | Recommended |

Recommended `Calendar Sync Status` options:

- `Not in calendar`
- `Synced`
- `Sync error`

Existing databases with different names are supported through Script Properties. See [Configuration](SETUP.md#8-configure-property-names-if-your-database-uses-different-names).

## Required secrets / IDs

These are stored in **Apps Script → Project Settings → Script Properties**, never in this repository:

```text
NOTION_TOKEN
NOTION_DATA_SOURCE_ID
WEBHOOK_SECRET
```

Optional:

```text
GOOGLE_CALENDAR_ID
```

Never commit real tokens, webhook URLs containing your secret, or other credentials.

## Duplicate prevention strategy

A Notion page and its Calendar event are linked in three ways:

1. The Calendar event ID can be written back into the Notion page.
2. A second page → event mapping is stored privately in Apps Script Script Properties.
3. The Calendar event receives a private `notion_page_id` tag.

Creation also runs under a script-wide lock. This makes webhook retries and simultaneous updates idempotent under normal operation.

## Self-healing

Run `installReconciliationTrigger()` once after setup. It installs a 15-minute Apps Script trigger that:

- finds scheduled Notion pages missed by webhooks;
- recreates Calendar events manually deleted from Google Calendar;
- restores Calendar title/time/description if edited manually;
- removes mapped events when their Notion page no longer belongs to the synchronized data source.

## Security model

Notion recommends validating `X-Notion-Signature` with HMAC-SHA256. Google Apps Script's documented web-app event object exposes query parameters and POST content but not arbitrary incoming request headers, so this implementation cannot directly read that signature.

Instead, the webhook URL contains a long random `WEBHOOK_SECRET` query parameter and rejects requests without it. Treat the full webhook URL as a credential.

Read **[SECURITY.md](SECURITY.md)** before using this for sensitive or high-stakes workflows.

## Tested behavior checklist

See **[TESTING.md](TESTING.md)**. Before relying on the system, test at minimum:

1. Create a scheduled Notion item.
2. Change its title.
3. Move its date/time.
4. Change its duration.
5. Remove the schedule.
6. Add the schedule again.
7. Trash the Notion page.
8. Restore it.
9. Manually delete the Google event and run reconciliation.
10. Confirm no step creates duplicates.

## Documentation

- [SETUP.md](SETUP.md) — complete beginner setup
- [AI_SETUP_GUIDE.md](AI_SETUP_GUIDE.md) — hand this file to an AI assistant
- [AI_REVIEW_COUNCIL.md](AI_REVIEW_COUNCIL.md) — adversarial review prompt for another AI/session
- [ARCHITECTURE.md](ARCHITECTURE.md) — how synchronization and idempotency work
- [SECURITY.md](SECURITY.md) — threat model and secret handling
- [TESTING.md](TESTING.md) — end-to-end validation matrix
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common failures and fixes
- [docs/PERSIAN_DATABASE_EXAMPLE.md](docs/PERSIAN_DATABASE_EXAMPLE.md) — example mapping for a Persian Notion database

## Official references

- Notion Webhooks: https://developers.notion.com/reference/webhooks
- Notion webhook delivery behavior: https://developers.notion.com/reference/webhooks-events-delivery
- Query a Notion data source: https://developers.notion.com/reference/query-a-data-source
- Google Apps Script Web Apps: https://developers.google.com/apps-script/guides/web
- Apps Script Calendar service: https://developers.google.com/apps-script/reference/calendar
- Apps Script Lock service: https://developers.google.com/apps-script/reference/lock
- Apps Script Properties service: https://developers.google.com/apps-script/guides/properties

## Cost

The software itself is free and runs on Google Apps Script. Google and Notion impose platform quotas and may change their products or limits in the future, so no third-party integration can promise literal eternal availability.

For normal personal task/calendar use, this avoids subscription automation services entirely.

## License

MIT — see [LICENSE](LICENSE).
