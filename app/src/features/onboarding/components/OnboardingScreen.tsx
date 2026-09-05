import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/Logo";
import { useSession } from "@/features/auth/hooks/useSession";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { useOnboarding, ONBOARDING_STEPS } from "../hooks/useOnboarding";
import { StepTransition } from "./StepTransition";
import { AccountStep } from "./AccountStep";
import { CompanyStep } from "./CompanyStep";
import { ConnectStep } from "./ConnectStep";
import { DoneStep } from "./DoneStep";

/**
 * COMPONENT -- the onboarding full screen. Composes the four steps and the
 * transition between them; all logic lives in useOnboarding.
 */
export function OnboardingScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { company, profiles } = useSession();
  const { step, direction, error, isSubmitting, goTo, submitAccount, submitCompany } =
    useOnboarding();

  // `/start?mode=login` opens on the sign-in form. The navbar's "Sign in" link
  // uses it so that clicking it does not land on "Create your account" and make
  // the visitor undo a step before doing what they asked for. Anything else,
  // including no param at all, falls back to register.
  const initialMode = searchParams.get("mode") === "login" ? "login" : "register";

  /**
   * Where to go when the flow ends.
   *
   * Normally the dashboard. But a user who arrived mid-OAuth was sent here by
   * the consent screen, and belongs back there with their client still
   * waiting. Only same-origin paths are honoured, so this cannot be used to
   * bounce someone off-site.
   */
  const next = searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/mcp";

  // An existing user signing in already has a company: skip ahead.
  const effectiveStep = step === "company" && company ? "connect" : step;
  const stepIndex = ONBOARDING_STEPS.indexOf(effectiveStep);

  /**
   * Return immediately once there is a session, when one was asked for.
   *
   * A user sent here mid-OAuth wants to approve a client, not to be walked
   * through the endpoint handoff they may have seen already. As soon as
   * onboarding is actually complete, hand them straight back.
   */
  useEffect(() => {
    if (next && company) void navigate(destination, { replace: true });
  }, [next, company, destination, navigate]);

  function finish() {
    void navigate(destination, { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="flex w-full max-w-md flex-col gap-6">
          <Card className="theme-surface">
            <CardContent className="p-6 sm:p-8">
              <StepTransition stepKey={effectiveStep} direction={direction}>
                {effectiveStep === "account" ? (
                  <AccountStep
                    onSubmit={submitAccount}
                    isSubmitting={isSubmitting}
                    error={error}
                    initialMode={initialMode}
                  />
                ) : null}

                {effectiveStep === "company" ? (
                  <CompanyStep
                    onSubmit={submitCompany}
                    isSubmitting={isSubmitting}
                    error={error}
                  />
                ) : null}

                {effectiveStep === "connect" ? (
                  <ConnectStep
                    profile={profiles.find((p) => p.is_default)}
                    onContinue={() => goTo("done")}
                  />
                ) : null}

                {effectiveStep === "done" ? (
                  <DoneStep
                    companyName={company?.name ?? "Your workspace"}
                    onFinish={finish}
                  />
                ) : null}
              </StepTransition>
            </CardContent>
          </Card>

          {/* Progress dots: orientation without a heavy stepper component. */}
          <div className="flex items-center justify-center gap-2">
            {ONBOARDING_STEPS.map((name, index) => (
              <span
                key={name}
                className="h-1 rounded-full transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]"
                style={{
                  width: index === stepIndex ? 20 : 6,
                  backgroundColor:
                    index <= stepIndex ? "var(--foreground)" : "var(--border)",
                }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
