export type Screen = 'welcome' | 'register' | 'companies' | 'staff-search' | 'company' | 'chat' | 'team' | 'profile' | 'settings' | 'pending';
export type BackTarget = Screen | 'close-search' | 'confirm-exit';

// Navigation only: never changes the actor, company, messages or drafts.
export function backTarget(screen: Screen, staff: boolean, linking: boolean, profileOrigin: Screen): BackTarget {
  if (screen === 'settings') return 'profile';
  if (screen === 'profile') return profileOrigin;
  if (screen === 'chat') return staff ? 'team' : 'company';
  if (screen === 'company') return 'companies';
  if (screen === 'register') return 'welcome';
  if (screen === 'staff-search') return 'register';
  if (screen === 'companies' && linking) return 'close-search';
  return 'confirm-exit';
}

export function matchesCompany(name: string, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  return normalize(name).includes(normalize(query));
}
