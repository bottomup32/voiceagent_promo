# TODOs

## Index customers by email for portal login

- **What:** an `email:{lower}` → customer id index, so `POST /api/portal/login` finds the customer without reading every record.
- **Why:** login currently walks `listCustomers()`; fine at tens of customers, slow at hundreds.
- **Pros:** constant-time login regardless of customer count.
- **Cons:** the index must be updated whenever `contactEmail` changes.
- **Context:** follow the `code:{code}` index pattern in `lib/store.ts` (written with `setIfAbsent`, repaired by a maintenance route).
- **Depends on:** M2 (portal login) of `docs/superpowers/specs/2026-09-25-customer-lifecycle-design.md`.

## Run `npm run check` in CI

- **What:** a GitHub Actions workflow that runs lint, typecheck and the unit tests (including the offline eval-baseline gate) on push and pull request.
- **Why:** every gate is manual today, so the strict prompt eval gate only holds if someone remembers to run it.
- **Pros:** the harness is enforced, not optional.
- **Cons:** one workflow file plus branch protection to maintain.
- **Context:** the paid model evals (`npm run eval`) stay out of CI; `tests/eval-baseline.test.ts` is offline and free.
- **Depends on:** M4 (npm scripts, committed baseline).
