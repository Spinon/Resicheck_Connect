// Client presentation guard only. Never use this state as server authorization.
// No token, password, role, company content or persistent cache is stored here.
export type SessionView = Readonly<{ userId: string | null; companyId: string | null }>;
declare const scopeBrand: unique symbol;
export type ScopeTicket = Readonly<{ [scopeBrand]: true }>;

export function createSessionScope(clearPrivateView: () => undefined) {
  let view: SessionView = Object.freeze({ userId: null, companyId: null });
  // Object identity makes tickets instance-specific and non-serializable authority.
  let current: ScopeTicket = Object.freeze({}) as ScopeTicket;
  function invalidate(next: SessionView): ScopeTicket {
    current = Object.freeze({}) as ScopeTicket;
    view = Object.freeze(next);
    // Invalidated before cleanup: a cleanup failure cannot reactivate old results.
    try { clearPrivateView(); } catch (error) {
      view = Object.freeze({ userId: null, companyId: null });
      throw error;
    }
    return current;
  }
  function beginAuthentication(): ScopeTicket {
    return invalidate({ userId: null, companyId: null });
  }
  function acceptIdentity(ticket: ScopeTicket, userId: string): boolean {
    if (ticket !== current || view.userId !== null || !userId.trim()) return false;
    // Consume the authentication ticket; a duplicate callback cannot reset context.
    invalidate({ userId, companyId: null });
    return true;
  }
  function selectCompany(companyId: string | null): void {
    if (!view.userId) throw new Error('No active presentation session');
    if (companyId !== null && !companyId.trim()) throw new Error('Invalid company context');
    if (view.companyId !== companyId) invalidate({ userId: view.userId, companyId });
  }
  function commit(ticket: ScopeTicket, apply: () => undefined): boolean {
    if (ticket !== current || view.userId === null) return false;
    // apply must be synchronous; asynchronous work obtains a ticket before await
    // and calls commit only after completion. Backend must authorize every request.
    apply();
    return true;
  }
  return Object.freeze({
    beginAuthentication, acceptIdentity, selectCompany, commit,
    capture: (): ScopeTicket => current,
    snapshot: (): SessionView => view,
    signOut: (): void => { invalidate({ userId: null, companyId: null }); },
  });
}
