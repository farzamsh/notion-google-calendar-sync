# Contributing

Contributions are welcome.

## Design constraints

Please preserve these invariants unless a change explicitly proposes a new architecture:

1. Notion remains the source of truth.
2. Webhooks are signals; latest page state is fetched from Notion before syncing.
3. Event creation must remain idempotent under retries/concurrency.
4. Destructive Calendar actions must prove event ownership.
5. Secrets must never be hardcoded.
6. Reconciliation must health-check Notion before interpreting missing pages destructively.
7. Existing users must be able to use localized/custom property names.

## Before opening a PR

Run through the relevant cases in `TESTING.md`, especially:

- create;
- repeated property updates;
- date/time move;
- schedule removal;
- page trash/restore;
- manual Calendar deletion + reconciliation;
- multiple reconciliation runs without duplicates.

## Security changes

If you change webhook authentication, Calendar deletion logic, mapping/identity storage, or secret handling, explain the threat model and failure modes in the PR description.
