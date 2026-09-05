import { useEffect, useState, type FormEvent } from "react";
import { ExternalLinkIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AppIcon } from "@/components/AppIcon";
import { startOAuthIntegration } from "../data/oauthIntegrationsApi";
import type { CatalogEntry, Uuid } from "@shared/domain";

interface OAuthConnectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: CatalogEntry | null;
  profileId: Uuid | undefined;
  existingNames: string[];
}

function suggestLabel(appName: string, existing: string[]): string {
  if (!existing.includes(appName)) return appName;
  for (let i = 2; i < 50; i += 1) {
    const candidate = `${appName} ${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${appName} account`;
}

export function OAuthConnectSheet({
  open,
  onOpenChange,
  app,
  profileId,
  existingNames,
}: OAuthConnectSheetProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSessionKey(null);
      return;
    }
    if (!app) return;
    if (sessionKey === app.key) return;
    setSessionKey(app.key);
    setName(suggestLabel(app.name, existingNames));
    setError(null);
    setSubmitting(false);
  }, [open, app, sessionKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!app?.integration_key || !profileId) return;
    const duplicate = existingNames.some(
      (existing) => existing.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (duplicate) {
      setError("Use a different label for each connected account.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const authorizationUrl = await startOAuthIntegration(app.integration_key, {
        name,
        profile_id: profileId,
      });
      window.location.assign(authorizationUrl);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : `Could not start ${app?.name ?? "provider"} sign-in.`,
      );
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="gap-3 border-b p-6">
          <div className="flex items-center gap-3">
            <AppIcon icon={app?.icon} name={app?.name ?? "?"} className="size-10" />
            <div className="flex min-w-0 flex-col">
              <SheetTitle className="truncate">
                {existingNames.length > 0
                  ? `Add another ${app?.name ?? "account"}`
                  : `Connect ${app?.name ?? "an account"}`}
              </SheetTitle>
              <SheetDescription>
                Sign in with Google. Tools appear on your endpoint right away.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            <Field>
              <FieldLabel htmlFor="oauth-account-name">Account label</FieldLabel>
              <Input
                id="oauth-account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={app?.name ?? "Work Gmail"}
                required
              />
              <FieldDescription>
                This label creates a separate tool namespace, so you can connect
                personal, work, and additional Gmail accounts independently.
              </FieldDescription>
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}

            <Alert role="note">
              <ShieldCheckIcon />
              <AlertTitle>What sirup asks for</AlertTitle>
              <AlertDescription>
                <p>
                  Google asks you to approve reading mail and creating drafts.
                  Every tool the Gmail MCP server exposes is then available on
                  your endpoint, and you can disable any of them afterwards.
                </p>
                <p>
                  Email is untrusted input. Use a trusted MCP client and review
                  agent actions before approving them.
                </p>
              </AlertDescription>
            </Alert>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Gmail MCP is a Google Developer Preview. Your Google Cloud project
              needs both the Gmail API and the Gmail MCP API enabled.
            </p>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t p-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !profileId}>
              {submitting ? (
                <>
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                  Opening {app?.name ?? "provider"}
                </>
              ) : (
                <>
                  Continue with {app?.name ?? "provider"}
                  <ExternalLinkIcon data-icon="inline-end" />
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
