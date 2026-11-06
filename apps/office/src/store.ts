import { create } from 'zustand';
import { api as backendApi, type Api, type User } from '@gokul/data';

interface Session { user: User | null; signIn: (u: User) => void; signOut: () => void }
export const useSession = create<Session>((set) => ({
  user: null,
  signIn: (user) => set({ user }),
  // The signed-in user also lives in the Rust backend; sign it out there too.
  signOut: () => { set({ user: null }); void backendApi.logout().catch(() => undefined); },
}));

/**
 * The one place screens get data from. If the backend says "sign in first" (locked out after too many wrong PINs,
 * user deactivated) the screens go back to the login page.
 */
function guarded(a: Api): Api {
  return new Proxy(a, {
    get(target, key) {
      const f = (target as unknown as Record<string | symbol, unknown>)[key];
      if (typeof f !== 'function') return f;
      return async (...args: unknown[]) => {
        try { return await (f as (...a: unknown[]) => Promise<unknown>).apply(target, args); } catch (e) {
          if (e instanceof Error && /sign in first|no longer active/i.test(e.message)) useSession.getState().signOut();
          throw e;
        }
      };
    },
  });
}
export const api: Api = guarded(backendApi);
