type Listener = (event: string, session: { user: { id: string } } | null) => void;
const listeners = new Set<Listener>();
export function createClient() {
    return { auth: { onAuthStateChange(callback: Listener) {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    } } };
}
export function changeTestSession(userId: string | null) {
    for (const listener of listeners) listener(userId ? 'SIGNED_IN' : 'SIGNED_OUT', userId ? { user: { id: userId } } : null);
}
