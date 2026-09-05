import { useCallback, useState } from "react";
import { useSession } from "@/features/auth/hooks/useSession";

export const ONBOARDING_STEPS = ["account", "company", "connect", "done"];

/**
 * HOOKS -- drives the four-step onboarding flow.
 *
 * The starting step is derived from session state, so refreshing mid-flow
 * resumes where the user left off instead of restarting.
 */
export function useOnboarding() {
  const { user, company, signIn, signUp, nameCompany } = useSession();

  const [step, setStep] = useState(() => {
    if (company) return "connect";
    if (user) return "company";
    return "account";
  });
  const [direction, setDirection] = useState("forward");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goTo = useCallback((next, nextDirection = "forward") => {
    setDirection(nextDirection);
    setError(null);
    setStep(next);
  }, []);

  /** Shared submit wrapper: one place for pending state and error capture. */
  const run = useCallback(async (action, onSuccess) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await action();
      onSuccess?.(result);
    } catch (submitError) {
      setError(submitError.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const submitAccount = useCallback(
    (mode, email, password) =>
      run(
        () => (mode === "register" ? signUp(email, password) : signIn(email, password)),
        // Signing in as an existing user may already have a company; the
        // session provider has refreshed, so pick the right next step.
        () => goTo("company"),
      ),
    [run, signUp, signIn, goTo],
  );

  const submitCompany = useCallback(
    (name) => run(() => nameCompany(name), () => goTo("connect")),
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
