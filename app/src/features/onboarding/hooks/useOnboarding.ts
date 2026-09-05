import { useCallback, useState } from "react";
import { useSession } from "@/features/auth/hooks/useSession";

export const ONBOARDING_STEPS = ["account", "company", "connect", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type StepDirection = "forward" | "back";
export type AuthMode = "register" | "login";

/**
 * HOOKS -- drives the four-step onboarding flow.
 *
 * The starting step is derived from session state, so refreshing mid-flow
 * resumes where the user left off instead of restarting.
 */
export function useOnboarding() {
  const { user, company, signIn, signUp, nameCompany } = useSession();

  const [step, setStep] = useState<OnboardingStep>(() => {
    if (company) return "connect";
    if (user) return "company";
    return "account";
  });
  const [direction, setDirection] = useState<StepDirection>("forward");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goTo = useCallback(
    (next: OnboardingStep, nextDirection: StepDirection = "forward") => {
      setDirection(nextDirection);
      setError(null);
      setStep(next);
    },
    [],
  );

  /** Shared submit wrapper: one place for pending state and error capture. */
  const run = useCallback(
    async (action: () => Promise<unknown>, onSuccess?: () => void) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await action();
        onSuccess?.();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "Something went wrong.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const submitAccount = useCallback(
    (mode: AuthMode, email: string, password: string) =>
      run(
        () => (mode === "register" ? signUp(email, password) : signIn(email, password)),
        // Signing in as an existing user may already have a company; the
        // session provider has refreshed, so pick the right next step.
        () => goTo("company"),
      ),
    [run, signUp, signIn, goTo],
  );

  const submitCompany = useCallback(
    (name: string) => run(() => nameCompany(name), () => goTo("connect")),
    [run, nameCompany, goTo],
  );

  return {
    step,
    direction,
    error,
    isSubmitting,
    goTo,
    submitAccount,
    submitCompany,
  };
}
