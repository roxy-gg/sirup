import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { StaggerReveal } from "./StaggerReveal";
import type { AuthMode } from "../hooks/useOnboarding";

/**
 * COMPONENT (stateless w.r.t. the flow) -- step 1: create an account or sign in.
 * Local input state only; submission is owned by the onboarding hook.
 */
interface AccountStepProps {
  onSubmit: (mode: AuthMode, email: string, password: string) => void;
  isSubmitting: boolean;
  error: string | null;
  /**
   * Which form to open on. Register is the default because most arrivals are
   * new, but a visitor who clicked a link labelled "Sign in" has stated their
   * intent -- landing them on "Create your account" makes them undo a step
   * before they can do the thing they asked for.
   */
  initialMode?: AuthMode;
}

export function AccountStep({
  onSubmit,
  isSubmitting,
  error,
  initialMode = "register",
}: AccountStepProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isRegister = mode === "register";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(mode, email, password);
  }

  return (
    <form onSubmit={handleSubmit}>
      <StaggerReveal className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRegister
              ? "Free forever. One endpoint for every MCP server your company uses."
              : "Sign in to manage your connected MCP servers."}
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder={isRegister ? "At least 8 characters" : "••••••••"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
        </FieldGroup>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-3">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Just a moment…" : isRegister ? "Create account" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={() => setMode(isRegister ? "login" : "register")}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
          </button>
        </div>
      </StaggerReveal>
    </form>
  );
}
