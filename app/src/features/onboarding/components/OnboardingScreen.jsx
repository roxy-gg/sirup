import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/features/auth/hooks/useSession";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";
import { useOnboarding } from "../hooks/useOnboarding";
import { StepTransition } from "./StepTransition";
import { AccountStep } from "./AccountStep";
import { CompanyStep } from "./CompanyStep";
import { ConnectStep } from "./ConnectStep";
import { DoneStep } from "./DoneStep";

const STEP_ORDER = ["account", "company", "connect", "done"];

/**
 * COMPONENT -- the onboarding full screen. Composes the four steps and the
 * transition between them; all logic lives in useOnboarding.
 */
export function OnboardingScreen() {
  const navigate = useNavigate();
  const { company } = useSession();
  const { step, direction, error, isSubmitting, goTo, submitAccount, submitCompany } =
    useOnboarding();

  // An existing user signing in already has a company: skip ahead.
  const effectiveStep = step === "company" && company ? "connect" : step;
  const stepIndex = STEP_ORDER.indexOf(effectiveStep);

  function finish() {
    navigate("/mcp", { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="text-sm font-semibold tracking-tight">sirup.gg</span>
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
                  <ConnectStep company={company} onContinue={() => goTo("done")} />
                ) : null}

                {effectiveStep === "done" ? (
                  <DoneStep
                    companyName={company?.name || "Your workspace"}
                    onFinish={finish}
                  />
                ) : null}
              </StepTransition>
            </CardContent>
          </Card>

          {/* Progress dots: orientation without a heavy stepper component. */}
          <div className="flex items-center justify-center gap-2">
            {STEP_ORDER.map((name, index) => (
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
