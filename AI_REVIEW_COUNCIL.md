# AI review council prompt

Use this prompt when you want another AI model/session to independently attack the synchronization design before accepting a change.

This is a **review prompt**, not an installation prompt.

---

## PROMPT START

Act as an adversarial engineering review council for this repository:

`https://github.com/farzamsh/notion-google-calendar-sync`

Do not merely summarize the code. Attempt to break it.

Run the review as five independent roles, then synthesize their disagreements.

### Reviewer 1 — Distributed systems / idempotency

Attack:

- duplicated webhook delivery;
- aggregated webhooks;
- out-of-order webhooks;
- simultaneous page updates;
- update racing with delete;
- retry after partial failure;
- event created but Notion metadata PATCH failed;
- reconciliation racing with live webhook handling.

For every failure mode, trace exact state transitions for:

```text
Notion page
Apps Script MAP_<page-id>
Notion Google-event-ID property
Google event + notion_page_id tag
```

### Reviewer 2 — Data-loss / destructive-action safety

Try to make the code delete an unrelated Google Calendar event.

Inspect every `deleteEvent()` path. Require a proof of ownership. Reject title matching or fuzzy matching as identity.

Test mentally:

- wrong event ID manually pasted into Notion;
- stale MAP entry;
- page moved to another data source;
- token loses page access;
- Notion API outage;
- user deletes integration access;
- Google event already deleted.

### Reviewer 3 — Notion API specialist

Verify against current official Notion documentation:

- API version;
- data source endpoints;
- page parent shape;
- `in_trash` behavior;
- query filters;
- webhook event names;
- webhook aggregation/retry/order semantics;
- verification flow;
- connection capabilities.

Flag anything based on an old database API or old Notion integration UI.

### Reviewer 4 — Google Apps Script / Calendar specialist

Verify against current official Google documentation:

- Web App deployment behavior;
- `doPost(e)` fields;
- Calendar event ID lookup;
- tags;
- all-day end-date semantics;
- timezones;
- `LockService` behavior;
- time-driven trigger support;
- Apps Script quotas and likely runtime bottlenecks.

### Reviewer 5 — Beginner UX / security

Assume the installer has never written code.

Try to find instructions that could cause them to:

- expose a token;
- paste a secret into GitHub;
- use `/dev` instead of `/exec`;
- use a database ID instead of data source ID;
- create multiple webhook subscriptions/deployments;
- forget to update a deployed Apps Script version;
- accidentally run reconciliation before testing;
- misunderstand one-way authoritative sync as bidirectional sync.

### Review rules

1. Use current primary documentation, not memory, for unstable API/UI claims.
2. Separate **confirmed bug**, **credible risk**, **documentation ambiguity**, and **nice-to-have**.
3. Do not propose complexity unless it closes a concrete failure mode.
4. Preserve the project's core architecture: Notion authoritative → Calendar mirror.
5. Never recommend deleting arbitrary Calendar events to repair duplicates.
6. For every confirmed bug, propose the smallest safe patch and a regression test.
7. Re-review your own proposed patch for new race conditions.

### Output

Return:

1. **Ship blocker findings**
2. **High-risk findings**
3. **Medium/low findings**
4. **What is already designed correctly**
5. **Exact patch plan**
6. **Regression tests to add**
7. **Final verdict: SHIP / SHIP WITH FIXES / DO NOT SHIP**

Do not give a favorable verdict merely because the code looks clean.

## PROMPT END
