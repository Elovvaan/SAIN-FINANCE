# SAIN Finance Live Verification Checklist

This checklist is for the deployed Filing Office and Borrower-in-Custody operational prototype.

## Public routes

- `/health`
- `/platform/filing-office`
- `/platform/institution`
- `/platform/relationship`
- `/api/filing-office/snapshot`
- `/api/filing-office/snapshot?view=member`

## Required checks

1. Confirm every route loads directly after a cold deployment.
2. Confirm `/health` returns HTTP 200 and the sandbox disclosure.
3. Confirm the institutional snapshot contains no document body content.
4. Confirm the member snapshot contains no institution ID, Master Account ID, authority ID, audit ID, storage path, or institution-only records.
5. Confirm missing `operation` and missing `actorId` requests return structured 400 responses.
6. Confirm malformed or oversized operation requests are rejected.
7. Confirm an actor without authority cannot mutate Filing Office state.
8. Confirm document creator and verifier separation.
9. Confirm verified and submitted document versions cannot be silently regenerated.
10. Confirm BIC package creation fails while any prerequisite remains incomplete.
11. Confirm collateral schedule totals are calculated from active pledged collateral only.
12. Confirm returned packages preserve prior submission manifests before correction and resubmission.
13. Confirm deployment restarts do not silently erase operational records. File-backed persistence must use a durable mounted volume in the hosting environment.

## Boundary

The deployed software is an operational preparation sandbox. It does not establish or claim a Federal Reserve relationship, Master Account, Discount Window access, Borrower-in-Custody enrollment, custody, external submission, or money movement.
