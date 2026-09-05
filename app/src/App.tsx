import { useRef, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/features/theme/hooks/useTheme";
import { SessionProvider, useSession } from "@/features/auth/hooks/useSession";
import { LandingScreen } from "@/features/marketing/components/LandingScreen";
import { OnboardingScreen } from "@/features/onboarding/components/OnboardingScreen";
import { McpScreen } from "@/features/mcp-manage/components/McpScreen";
import { LogsScreen } from "@/features/mcp-logs/components/LogsScreen";
import { SkillsScreen } from "@/features/skills/components/SkillsScreen";

/** Held until the session resolves, so no screen renders on a guess. */
function Booting() {
  return <div className="min-h-dvh bg-background" />;
}

/**
 * Routes that require a finished onboarding. Anyone without a company is sent
 * to the flow, which resumes at whichever step they stopped on.
 */
function Protected({ children }: { children: ReactNode }) {
  const { status, isOnboarded } = useSession();

  // Hold the shell back until the session resolves, or a signed-in user would
  // see the onboarding screen flash before their dashboard.
  if (status === "loading") return <Booting />;
  if (!isOnboarded) return <Navigate to="/start" replace />;

  return <AppShell>{children}</AppShell>;
}

/**
 * The marketing page, which doubles as the signed-in user's front door: if you
 * already have a workspace, there is nothing to sell you.
 */
function LandingRoute() {
  const { status, isOnboarded } = useSession();

  if (status === "loading") return <Booting />;
  return isOnboarded ? <Navigate to="/mcp" replace /> : <LandingScreen />;
}

/**
 * Sends an already-onboarded user to the dashboard, but only on a fresh visit.
 *
 * The screen itself owns the redirect once the flow is under way: creating a
 * company completes onboarding as far as the session is concerned, while the
 * user still has the endpoint handoff and confirmation left to see.
 */
function OnboardingRoute() {
  const { status, isOnboarded } = useSession();
  // Captured once on mount: a company created *during* the flow must not
  // retroactively count as "already onboarded" and skip the remaining steps.
  const wasOnboardedOnEntry = useRef<boolean | null>(null);

  if (status === "loading") return <Booting />;

  if (wasOnboardedOnEntry.current === null) {
    wasOnboardedOnEntry.current = isOnboarded;
  }

  return wasOnboardedOnEntry.current ? <Navigate to="/mcp" replace /> : <OnboardingScreen />;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <SessionProvider>
          <Routes>
            <Route path="/" element={<LandingRoute />} />
            <Route path="/start" element={<OnboardingRoute />} />
            <Route
              path="/mcp"
              element={
                <Protected>
                  <McpScreen />
                </Protected>
              }
            />
            <Route
              path="/logs"
              element={
                <Protected>
                  <LogsScreen />
                </Protected>
              }
            />
            <Route
              path="/skills"
              element={
                <Protected>
                  <SkillsScreen />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <Toaster position="bottom-right" />
        </SessionProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
