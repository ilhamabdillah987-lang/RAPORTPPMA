# Security Specification - Raport Al-Hikmah

## Data Invariants
1. A student document must have a unique ID, a name, and a class.
2. Grades must be within 0-100.
3. System configurations (logo, global settings) are shared across users.

## The "Dirty Dozen" Payloads (Red Team Audit)
1. **Unauthenticated Write**: Attempting to create a student without a token. (Expected: Denied)
2. **Identity Spoofing**: User A trying to update User B's record (Not applicable if shared, but we track editor).
3. **Shadow Update**: Adding `isAdmin: true` to a student record. (Expected: Denied by strict keys)
4. **Value Poisoning**: Setting a grade to 1000 or a 1MB string. (Expected: Denied by size/range checks)
5. **ID Poisoning**: Using a 2KB string as a studentId. (Expected: Denied by isValidId)
6. **Orphaned Writes**: Creating a grade entry for a non-existent student (Embedded in document, so not applicable).
7. **Temporal Attack**: Setting `updatedAt` to a future date. (Expected: Denied by server timestamp check)
8. **PII Leak**: Unauthenticated user reading the student database. (Expected: Denied)
9. **Bulk Deletion**: Malicious user trying to delete all students. (Expected: Allowed if they are "editors", but we should eventually add roles).
10. **Resource Exhaustion**: Sending a mega-payload (1MB+) for a small field. (Expected: Denied by .size() checks)
11. **Type Confusion**: Sending an array where a string is expected for `name`. (Expected: Denied)
12. **Status Shortcutting**: Not applicable (no complex status flow).

## Rules Logic Pattern
- `isSignedIn()` check.
- `isValidId(id)` check.
- `isValidStudent(data)` check.
- `isValidConfig(data)` check.
- Default deny all.
