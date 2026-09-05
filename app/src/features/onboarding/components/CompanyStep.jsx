import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { StaggerReveal } from "./StaggerReveal";

/**
 * COMPONENT -- step 2: name the company. This is what mints the gateway token,
 * so it is a required step rather than a profile detail to fill in later.
 */
export function CompanyStep({ onSubmit, isSubmitting, error }) {
  const [name, setName] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(name);
  }

  return (
    <form onSubmit={handleSubmit}>
      <StaggerReveal className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            What&rsquo;s your company called?
          </h1>
          <p className="text-sm text-muted-foreground">
            Your MCP servers and audit logs live under this workspace.
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="company">Company name</FieldLabel>
            <Input
              id="company"
              placeholder="Acme Inc."
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
            <FieldDescription>You can rename this later in Settings.</FieldDescription>
          </Field>
        </FieldGroup>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating workspace…" : "Continue"}
        </Button>
      </StaggerReveal>
    </form>
  );
}
