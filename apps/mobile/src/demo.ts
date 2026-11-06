export type Role = 'patient' | 'staff';
export type Actor = { id: string; name: string; role: Role; companyId?: string; approved?: boolean };
export type Message = { id: string; authorId: string; authorName: string; authorRole: Role; text: string; time: string; important: boolean; attachment?: boolean; audio?: boolean };
export type Conversation = { id: string; companyId: string; patientId: string; patientName: string; messages: Message[] };
export type Preferences = { filter: 'all' | 'important'; privacy: 1 | 2 | 3 | 4 };
export type DemoState = { actor: Actor | null; linkedCompanies: string[]; companyId: string; conversations: Conversation[]; drafts: Record<string, string>; preferences: Preferences; nextId: number };

export const companies = [
  { id: 'horizonte', name: 'Clínica Horizonte', initials: 'CH', category: 'Atendimento administrativo', address: 'Rua Exemplo, 100 · Cidade Fictícia', phone: '(00) 0000-0000' },
  { id: 'vida', name: 'Centro Vida', initials: 'CV', category: 'Atendimento administrativo', address: 'Avenida Modelo, 200 · Cidade Fictícia', phone: '(00) 0000-0000' },
  { id: 'jardim', name: 'Clínica Jardim', initials: 'CJ', category: 'Atendimento administrativo', address: 'Praça Demonstração, 30 · Cidade Fictícia', phone: '(00) 0000-0000' },
];
export const patient: Actor = { id: 'patient-marina', name: 'Marina', role: 'patient' };
export const ana: Actor = { id: 'staff-ana', name: 'Ana', role: 'staff', companyId: 'horizonte', approved: true };
export const bruno: Actor = { id: 'staff-bruno', name: 'Bruno', role: 'staff', companyId: 'horizonte', approved: true };
const message = (id: string, author: Actor, text: string, time: string, important = false): Message => ({ id, authorId: author.id, authorName: author.name, authorRole: author.role, text, time, important });
export function initialState(): DemoState {
  return { actor: null, linkedCompanies: ['horizonte', 'vida'], companyId: 'horizonte', drafts: {}, preferences: { filter: 'all', privacy: 1 }, nextId: 20, conversations: [
    { id: 'horizonte-marina', companyId: 'horizonte', patientId: patient.id, patientName: 'Marina', messages: [
      message('m1', ana, 'Olá, Marina! Como podemos ajudar?', '10:30'),
      message('m2', patient, 'Oi! Posso enviar minha guia por aqui?', '10:31'),
      message('m3', ana, 'Sim, você pode anexar o documento nesta conversa.', '10:32'),
      message('m4', bruno, 'Nossa equipe recebe sua mensagem por aqui.', '10:33', true),
    ] },
    { id: 'horizonte-pedro', companyId: 'horizonte', patientId: 'patient-pedro', patientName: 'Pedro', messages: [message('m5', { id: 'patient-pedro', name: 'Pedro', role: 'patient' }, 'Obrigado pela informação!', '09:48')] },
    { id: 'vida-marina', companyId: 'vida', patientId: patient.id, patientName: 'Marina', messages: [message('m6', { id: 'staff-lia', name: 'Lia', role: 'staff', companyId: 'vida', approved: true }, 'Olá! Este é o seu chat com o Centro Vida.', '09:20')] },
  ] };
}
// Selectors only simulate scoping locally; they are not authentication or server security.
export function visibleConversations(state: DemoState): Conversation[] {
  const actor = state.actor;
  if (!actor) return [];
  if (actor.role === 'staff') return actor.approved ? state.conversations.filter(c => c.companyId === actor.companyId) : [];
  if (!state.linkedCompanies.includes(state.companyId)) return [];
  return state.conversations.filter(c => c.companyId === state.companyId && c.patientId === actor.id);
}
export function conversationById(state: DemoState, id: string) { return visibleConversations(state).find(c => c.id === id); }
export function attendants(conversation: Conversation) {
  const staffMessages = conversation.messages.filter(m => m.authorRole === 'staff');
  const counts = new Map<string, { name: string; count: number }>();
  for (const m of staffMessages) { const entry = counts.get(m.authorId); counts.set(m.authorId, { name: m.authorName, count: (entry?.count ?? 0) + 1 }); }
  const highest = Math.max(0, ...[...counts.values()].map(x => x.count));
  const leaders = [...counts.values()].filter(x => x.count === highest);
  return { principal: !leaders.length ? 'Sem mensagens da equipe' : leaders.length > 1 ? 'Empate · regra a definir' : `${leaders[0].name} · ${highest} mensagens`, last: staffMessages.at(-1)?.authorName ?? 'Sem mensagens da equipe' };
}
export function notificationPreview(preferences: Preferences, event: { company: string; attendant?: string; message: string; important: boolean }) {
  if (preferences.filter === 'important' && !event.important) return null;
  return { app: 'ResiCheck Connect', company: preferences.privacy >= 2 ? event.company : undefined, attendant: preferences.privacy >= 3 ? event.attendant : undefined, message: preferences.privacy >= 4 ? event.message : undefined };
}
export type Action =
  | { type: 'enter'; actor: Actor }
  | { type: 'staff-invite-demo'; name: string }
  | { type: 'staff-request-demo'; name: string; companyId: string }
  | { type: 'logout' }
  | { type: 'company'; id: string }
  | { type: 'link'; id: string }
  | { type: 'draft'; conversationId: string; text: string }
  | { type: 'send'; conversationId: string; time: string; attachment?: boolean; audio?: boolean }
  | { type: 'simulate-reply'; conversationId: string }
  | { type: 'important'; conversationId: string; messageId: string }
  | { type: 'preferences'; preferences: Preferences };
export function reducer(state: DemoState, action: Action): DemoState {
  if (action.type === 'logout') return initialState();
  // Fixed synthetic scenarios, not validation of a real invitation token.
  if (action.type === 'staff-invite-demo') {
    if (state.actor?.role === 'staff' && state.actor.approved && state.actor.companyId !== 'horizonte') return state;
    return { ...state, actor: { id: 'staff-invited', name: action.name.trim() || 'Alex', role: 'staff', companyId: 'horizonte', approved: true }, companyId: 'horizonte', drafts: {} };
  }
  if (action.type === 'staff-request-demo') {
    if (state.actor?.role === 'staff' && state.actor.approved || !companies.some(c => c.id === action.companyId)) return state;
    return { ...state, actor: { id: 'staff-pending', name: action.name.trim() || 'Alex', role: 'staff', companyId: action.companyId, approved: false }, companyId: action.companyId, drafts: {} };
  }
  if (action.type === 'enter') return { ...state, actor: action.actor, companyId: action.actor.companyId ?? state.linkedCompanies[0] ?? 'horizonte', drafts: {} };
  if (!state.actor) return state;
  if (action.type === 'preferences') return { ...state, preferences: action.preferences };
  if (action.type === 'company') return state.actor.role === 'patient' && state.linkedCompanies.includes(action.id) ? { ...state, companyId: action.id } : state;
  if (action.type === 'link') {
    if (state.actor.role !== 'patient' || !companies.some(c => c.id === action.id)) return state;
    const linked = state.linkedCompanies.includes(action.id);
    const id = `${action.id}-${state.actor.id}`;
    return { ...state, companyId: action.id, linkedCompanies: linked ? state.linkedCompanies : [...state.linkedCompanies, action.id], conversations: state.conversations.some(c => c.companyId === action.id && c.patientId === state.actor!.id) ? state.conversations : [...state.conversations, { id, companyId: action.id, patientId: state.actor.id, patientName: state.actor.name, messages: [] }] };
  }
  const conversation = conversationById(state, action.conversationId);
  if (!conversation) return state;
  if (action.type === 'draft') return { ...state, drafts: { ...state.drafts, [conversation.id]: action.text.slice(0, 2000) } };
  if (action.type === 'important') {
    if (state.actor.role !== 'staff' || !state.actor.approved) return state;
    return { ...state, conversations: state.conversations.map(c => c.id !== conversation.id ? c : { ...c, messages: c.messages.map(m => m.id !== action.messageId ? m : { ...m, important: !m.important }) }) };
  }
  const text = state.drafts[conversation.id]?.trim();
  if (action.type === 'send' && !text && !action.attachment && !action.audio) return state;
  const replyAuthor = conversation.companyId === 'horizonte' ? ana : { id: `staff-${conversation.companyId}`, name: 'Equipe demo', role: 'staff' as const, companyId: conversation.companyId, approved: true };
  if (action.type === 'simulate-reply' && state.actor.role !== 'patient') return state;
  const newMessage = action.type === 'simulate-reply'
    ? message(`local-${state.nextId}`, replyAuthor, 'Resposta simulada: recebemos sua mensagem. Este exemplo não envia dados para uma empresa real.', 'Agora')
    : { ...message(`local-${state.nextId}`, state.actor, action.audio ? 'Áudio fictício · 00:08 · sem gravação real' : action.attachment ? 'Guia de exemplo · documento fictício' : text!, action.time), attachment: action.attachment, audio: action.audio };
  return { ...state, nextId: state.nextId + 1, drafts: { ...state.drafts, [conversation.id]: action.type === 'simulate-reply' || action.attachment || action.audio ? state.drafts[conversation.id] ?? '' : '' }, conversations: state.conversations.map(c => c.id === conversation.id ? { ...c, messages: [...c.messages, newMessage] } : c) };
}
