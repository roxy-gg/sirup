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
import type { SessionResponse } from "@shared/api";
import type { Company, Profile, User, Uuid } from "@shared/domain";

/**
 * HOOKS -- the app's session state machine.
 *
 * Everything that depends on "who am I" reads from here, so there is one
 * source of truth and one place that knows how onboarding progresses.
 *
 * Profiles live here too, because the active profile determines what almost
 * every screen shows: which token to display, which connections are exposed,
 * which logs to filter to.
 */

interface SessionState {
  user: User | null;
  company: Company | null;
  profiles: Profile[];
}

interface SessionContextValue extends SessionState {
  status: "loading" | "ready";
  isAuthenticated: boolean;
  isOnboarded: boolean;
  /** The profile the UI is currently acting as. Never null once onboarded. */
  activeProfile: Profile | undefined;
  setActiveProfileId: (id: Uuid) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  nameCompany: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the session, after a profile is created, renamed, or deleted. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Survives a reload, so the switcher does not reset on every navigation. */
const ACTIVE_PROFILE_KEY = "sirup-active-profile";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({
    user: null,
    company: null,
    profiles: [],
  });
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [activeId, setActiveId] = useState<Uuid | null>(
    () => localStorage.getItem(ACTIVE_PROFILE_KEY) as Uuid | null,
  );

  /**
   * Normalises a session payload before it reaches state.
   *
   * Every consumer treats `profiles` as an array, so one endpoint omitting it
   * would crash the whole app on the next render. Coercing here means a
   * partial or malformed response degrades instead.
   */
  const applySession = useCallback((next: SessionResponse) => {
    setSession({
      user: next.user ?? null,
      company: next.company ?? null,
      profiles: next.profiles ?? [],
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    authApi
      .fetchSession()
      .then((data) => {
        if (!cancelled) applySession(data);
      })
      // A 401 here is the normal signed-out case, not an error worth showing.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const refresh = useCallback(async () => {
    applySession(await authApi.fetchSession());
  }, [applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      applySession(await authApi.login(email, password));
    },
    [applySession],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      applySession(await authApi.register(email, password));
    },
    [applySession],
  );

  const nameCompany = useCallback(
    async (name: string) => {
      applySession(await authApi.createCompany(name));
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    await authApi.logout();
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    setActiveId(null);
    setSession({ user: null, company: null, profiles: [] });
  }, []);

  const setActiveProfileId = useCallback((id: Uuid) => {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    setActiveId(id);
  }, []);

  /**
   * Falls back to the default profile when the stored id is stale -- the
   * profile was deleted, or this is a different account on the same browser.
   *
   * Defensive about `profiles` being absent: an endpoint that returns a
   * partial session should degrade to "no active profile", not crash the app
   * into a blank page.
   */
  const activeProfile = useMemo(() => {
    const profiles = session.profiles ?? [];
    const stored = profiles.find((profile) => profile.id === activeId);
    return stored ?? profiles.find((p) => p.is_default) ?? profiles[0];
  }, [session.profiles, activeId]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...session,
      status,
      isAuthenticated: Boolean(session.user),
      // Onboarding is only finished once a company exists -- that's what mints
      // the profile and token the whole product depends on.
      isOnboarded: Boolean(session.user && session.company),
      activeProfile,
      setActiveProfileId,
      signIn,
      signUp,
      nameCompany,
      signOut,
      refresh,
    }),
    [
      session,
      status,
      activeProfile,
      setActiveProfileId,
      signIn,
      signUp,
      nameCompany,
      signOut,
      refresh,
    ],
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
