/**
 * Who the next request comes from.
 *
 * The Auth.js module is mocked in tests, but `currentActor` is re-implemented
 * against the real database rather than stubbed out, so the property that
 * matters — authority is read fresh from Postgres on every request, never
 * trusted from a token — stays under test.
 */
let currentPersonId: string | null = null;

export function signInAs(personId: string | null): void {
  currentPersonId = personId;
}

export function signedInPersonId(): string | null {
  return currentPersonId;
}
