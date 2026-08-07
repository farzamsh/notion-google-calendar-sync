# Architecture

## Design decision: one authoritative system

This project is not generic two-way synchronization.

**Notion owns state. Google Calendar mirrors it.**

That means conflict resolution is deterministic:

- Notion changed → Calendar is updated.
- Calendar changed manually → reconciliation restores Notion state.
- Notion schedule removed → Calendar event is deleted.
- Notion page deleted → Calendar event is deleted.

This is intentionally simpler and safer than allowing both systems to independently edit the same fields.

## Why webhooks are signals, not state

Notion webhooks can be aggregated, retried, and delivered out of order. The webhook event is therefore used only to obtain the page ID and change type. The sync engine then retrieves the **latest page** from the Notion API before deciding what Calendar should contain.

## Idempotency / duplicate prevention

The sync stores identity redundantly:

### 1. Notion property

Recommended:

```text
Google Calendar Event ID
```

The event's iCalUID is written into the Notion row.

### 2. Apps Script Script Properties

A private mapping is stored as:

```text
MAP_<normalized-notion-page-id> = <google-event-id>
```

This is written immediately after Calendar event creation and **before** the Notion metadata PATCH. If the Notion PATCH fails and the webhook is retried, the retry can find the event instead of creating another one.

### 3. Google Calendar event tag

The event receives:

```text
notion_page_id = <normalized-page-id>
notion_calendar_sync = 1
```

An old event is only deleted as a duplicate when ownership can be proven by the private tag or mutually agreeing stored IDs.

## Concurrency control

Every live page synchronization uses:

```text
LockService.getScriptLock()
```

Deletion webhooks use the same script lock. This prevents create/update/delete races from mutating Calendar state concurrently.

## Reconciliation

Webhooks are fast-path synchronization. Reconciliation is the safety net.

Every 15 minutes it:

1. verifies the Notion data source is reachable;
2. revisits every known page → event mapping;
3. deletes mirrors for pages no longer in the data source;
4. repairs the existing event to match current Notion state;
5. queries all currently scheduled Notion pages;
6. creates any event that was missed by webhooks.

The data-source health check occurs before destructive reconciliation so a broken Notion token/connection does not look like "all pages disappeared."

## Event lifecycle

### Create

```text
Notion page gets Schedule
→ webhook
→ retrieve latest Notion page
→ acquire lock
→ no existing owned event
→ create Calendar event
→ save private mapping
→ tag Calendar event
→ write event ID/status/last sync to Notion
```

### Update

```text
Notion property changes
→ webhook
→ retrieve latest page
→ find owned Calendar event
→ update title / description / date / time
→ no new event
```

### Schedule removed

```text
Schedule becomes empty
→ webhook
→ locate owned event
→ delete Calendar event
→ clear mapping
→ clear event ID / set status Not in calendar
```

### Notion page trashed

```text
page.deleted
→ acquire lock
→ delete owned Calendar event
→ remove private mapping
```

### Notion page restored

```text
page.undeleted
→ retrieve page
→ if Schedule exists, synchronize
→ deleted Calendar event is recreated once
```

### Page moved

A moved page can become inaccessible to the connection after leaving the synchronized data source. `page.moved` therefore allows a page-specific 404 to be treated as removal, while ordinary page update 404s are not blindly destructive.

## Time handling

- Notion timestamps containing UTC offsets are parsed as absolute instants.
- A timed schedule with no explicit end uses `Duration (minutes)`.
- If duration is absent, `DEFAULT_EVENT_MINUTES` is used (60 by default).
- All-day Notion date ranges are converted to Google Calendar's exclusive end-date convention.
- Apps Script project timezone should match the target Calendar timezone, especially for all-day events.

## Intentional limitations

- Notion → Google only; no Calendar → Notion authoring.
- No recurring-event model.
- No attendee/guest synchronization.
- No native HMAC webhook signature verification because Apps Script's documented web-app request event does not expose arbitrary incoming HTTP headers. See `SECURITY.md`.
- If an operator manually deletes **both** the Notion event-ID field and Apps Script's private `MAP_...` entry, the script can lose the identity of an old Calendar event. Do not manually delete internal sync metadata.
