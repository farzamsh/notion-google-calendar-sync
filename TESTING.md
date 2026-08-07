# Testing and acceptance checklist

Use a disposable Notion item with a unique title such as:

```text
TEST - Notion Calendar Sync
```

Do not test destructive behavior on an important real event first.

## Preflight

- [ ] `validateSetup()` succeeds.
- [ ] `testCalendarAccess()` succeeds.
- [ ] Apps Script timezone matches target Calendar timezone.
- [ ] Production Web App deployment points to the current code version.
- [ ] Notion webhook is Verified/Active.
- [ ] Only one Notion webhook subscription points to this Apps Script deployment.

## Test 1 — create

In Notion:

```text
Name: TEST - Notion Calendar Sync
Schedule: 1 hour from now
Duration (minutes): 30
```

Expected:

- [ ] exactly one Calendar event appears;
- [ ] start time matches;
- [ ] duration is 30 minutes;
- [ ] event description contains the Notion page URL;
- [ ] event ID/status/last-sync metadata updates if those properties exist.

## Test 2 — title update

Change only the Notion title.

Expected:

- [ ] the same Calendar event changes title;
- [ ] total matching Calendar events remains exactly one.

## Test 3 — move time

Change the Notion schedule to a different time/day.

Expected:

- [ ] the same Calendar event moves;
- [ ] no event remains at the old time;
- [ ] no duplicate is created.

## Test 4 — duration

Change `Duration (minutes)`.

Expected:

- [ ] event end time changes;
- [ ] event ID stays the same.

## Test 5 — explicit end time

Set a Notion Date range with both start and end times.

Expected:

- [ ] Google Calendar uses that explicit end instead of duration.

## Test 6 — all-day date

Change Schedule to a date without time.

Expected:

- [ ] existing event becomes an all-day event;
- [ ] correct day is used.

## Test 7 — remove schedule

Clear the Notion `Schedule` property.

Expected:

- [ ] Google event is deleted;
- [ ] private mapping is removed;
- [ ] Notion event ID is cleared if the property exists;
- [ ] status becomes `Not in calendar` if configured.

## Test 8 — restore schedule

Add a schedule again.

Expected:

- [ ] exactly one new/current event appears;
- [ ] no old duplicate returns.

## Test 9 — trash page

Move the Notion page to trash.

Expected:

- [ ] Calendar event is deleted.

## Test 10 — restore page

Restore the Notion page from trash.

Expected:

- [ ] if Schedule still exists, exactly one Calendar event is recreated.

## Test 11 — manual Calendar edit

Manually change the mirrored event title/time in Google Calendar.

Run:

```text
reconcileNotionToCalendar
```

Expected:

- [ ] Calendar title/time returns to Notion values.

## Test 12 — manual Calendar deletion

Delete the mirrored Calendar event manually.

Run:

```text
reconcileNotionToCalendar
```

Expected:

- [ ] exactly one replacement event appears;
- [ ] Notion event-ID metadata updates to the replacement event.

## Test 13 — reconciliation idempotency

Run:

```text
reconcileNotionToCalendar
```

three times.

Expected:

- [ ] still exactly one Calendar event.

## Test 14 — webhook retry/race smoke test

Edit several Notion properties quickly (title, duration, description, time).

Expected:

- [ ] after events settle, Calendar reflects the latest Notion state;
- [ ] exactly one event exists.

## Test 15 — permanent repair trigger

Run once:

```text
installReconciliationTrigger
```

Apps Script → Triggers should contain exactly one trigger for:

```text
reconcileNotionToCalendar
```

Expected:

- [ ] trigger frequency is every 15 minutes;
- [ ] running `installReconciliationTrigger()` again still leaves exactly one trigger.

## Acceptance rule

Do not use this integration for important scheduling until all relevant tests pass.
