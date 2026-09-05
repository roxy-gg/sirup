import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../data/authApi";
import type { Company, User } from "@shared/domain";

/**
 * HOOKS -- the app's session state machine.
 *
 * Everything that depends on "who am I" reads from here, so there is one
 * source of truth and one place that knows how onboarding progresses.
 */

interface SessionState {
  user: User | null;
  company: Company | null;
}

interface SessionContextValue extends SessionState {
  status: "loading" | "ready";
  isAuthenticated: boolean;
  isOnboarded: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  nameCompany: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ user: null, company: null });
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;

    authApi
      .fetchSession()
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      // A 401 here is the normal signed-out case, not an error worth showing.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setSession(await authApi.login(email, password));
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setSession(await authApi.register(email, password));
  }, []);

  const nameCompany = useCallback(async (name: string) => {
    setSession(await authApi.createCompany(name));
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout();
    setSession({ user: null, company: null });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...session,
      status,
      isAuthenticated: Boolean(session.user),
      // Onboarding is only finished once a company exists -- that's what mints
      // the gateway token the whole product depends on.
      isOnboarded: Boolean(session.user && session.company),
      signIn,
      signUp,
      nameCompany,
      signOut,
    }),
    [session, status, signIn, signUp, nameCompany, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}
