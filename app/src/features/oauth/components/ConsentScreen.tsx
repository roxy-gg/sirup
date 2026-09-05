import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CheckIcon, ChevronDownIcon, PlugZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/auth/hooks/useSession";
import { approveConsent, denyConsent, fetchConsentRequest } from "../data/oauthApi";
import type { ConsentRequestResponse } from "@shared/api";
import type { Profile, Uuid } from "@shared/domain";

/**
 * COMPONENT -- the OAuth consent screen.
 *
 * Where a client that cannot hold a static token gets access instead. The
 * client redirects here, the user picks a profile and approves, and the
 * browser is sent back with a code.
 *
 * The screen answers three questions in order, because that is the order a
 * person asks them: who is this, what will they see, and do I want that. The
 * profile picker is the middle answer -- approving is not "let this client
 * in", it is "let this client see these tools", and the tool count is what
 * makes that concrete rather than abstract.
 */
export function ConsentScreen() {
  const { requestId = "" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { status: sessionStatus, isOnboarded, profiles, activeProfile } = useSession();

  const [request, setRequest] = useState<ConsentRequestResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<Uuid | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);

  // The id can arrive either as a path segment or as ?request=, since the
  // provider redirects to the query form. Accepting both keeps a hand-typed
  // or bookmarked URL working.
  const id = requestId || search.get("request") || "";

  useEffect(() => {
    if (!id) {
      setStatus("error");
      setError("This link is missing its authorization request.");
      return;
    }

    let cancelled = false;

    fetchConsentRequest(id)
      .then((data) => {
        if (cancelled) return;
        setRequest(data);
        setStatus("ready");
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Could not load this authorization request.",
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [id, sessionStatus]);

  // Default to whichever profile the dashboard is already showing, so the
  // choice matches what the user was last looking at.
  useEffect(() => {
    if (selectedId || profiles.length === 0) return;
    setSelectedId(activeProfile?.id ?? profiles[0]!.id);
  }, [profiles, activeProfile, selectedId]);

  const selected: Profile | undefined =
    profiles.find((profile) => profile.id === selectedId) ?? profiles[0];

  async function handleApprove() {
    if (!selected) return;
    setSubmitting("approve");
    setError(null);

    try {
      const { redirect_to } = await approveConsent(id, selected.id);
      // A full navigation, not a router push: the destination belongs to the
      // client that started this, and is off-origin.
      window.location.href = redirect_to;
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not approve.",
      );
      setSubmitting(null);
    }
  }

  async function handleDeny() {
    setSubmitting("deny");
    try {
      const { redirect_to } = await denyConsent(id);
      window.location.href = redirect_to;
    } catch {
      // Denying is the safe outcome, so a failure here should still leave the
      // user somewhere sensible rather than stuck on a dead screen.
      navigate("/mcp", { replace: true });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="surface flex flex-col gap-6 rounded-2xl bg-card p-6">
          {status === "loading" || sessionStatus === "loading" ? (
            <ConsentSkeleton />
          ) : status === "error" ? (
            <div className="flex flex-col gap-4">
              <Header title="Request unavailable" />
              <p className="text-sm text-text-tertiary">{error}</p>
              <p className="text-sm text-text-tertiary">
                Authorization requests expire after ten minutes. Start again
                from your client.
              </p>
            </div>
          ) : !isOnboarded ? (
            <SignInPrompt clientName={request?.client_name ?? "An MCP client"} />
          ) : (
            <>
              <div className="flex flex-col items-center gap-4 text-center">
                {/* The two parties, with the direction of access between
                    them: the client is asking to reach your endpoint. */}
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl border bg-muted/40">
                    <PlugZapIcon className="size-5 text-text-tertiary" />
                  </span>
                  <span className="text-text-quaternary">→</span>
                  <span className="flex size-11 items-center justify-center rounded-xl border bg-muted/40">
                    <Logo className="size-5" />
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <h1 className="text-lg font-semibold tracking-tight">
                    {request!.client_name} wants access
                  </h1>
                  <p className="text-sm text-text-tertiary">
                    It will be able to list and call the tools in the profile
                    you choose, on your behalf.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-text-tertiary">
                  Profile to expose
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-left",
                        "transition-colors duration-[var(--duration-quick)] hover:bg-accent/40",
                        "focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {selected?.name ?? "No profile"}
                      </span>
                      <span className="shrink-0 text-xs text-text-quaternary">
                        {selected?.tool_count ?? 0} tool
                        {selected?.tool_count === 1 ? "" : "s"}
                      </span>
                      <ChevronDownIcon className="size-3.5 shrink-0 text-text-quaternary" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {profiles.map((profile) => (
                      <DropdownMenuItem
                        key={profile.id}
                        onSelect={() => setSelectedId(profile.id)}
                        className="gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                        <span className="shrink-0 text-xs text-text-quaternary">
                          {profile.tool_count}
                        </span>
                        {profile.id === selected?.id ? (
                          <CheckIcon className="size-3.5 shrink-0" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <p className="text-xs text-text-quaternary">
                  {selected?.server_count ?? 0} connection
                  {selected?.server_count === 1 ? "" : "s"}. Other profiles stay
                  private to you.
                </p>
              </div>

              {/* Where approving actually sends the code. Worth showing: it is
                  the one detail that distinguishes a real client from an
                  attacker reusing a familiar name. */}
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium text-text-tertiary">
                  Redirects to
                </span>
                <code className="truncate font-mono text-xs text-text-secondary">
                  {request!.redirect_uri}
                </code>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => void handleApprove()}
                  disabled={submitting !== null || !selected}
                  className="w-full"
                >
                  {submitting === "approve" ? "Connecting…" : "Allow access"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void handleDeny()}
                  disabled={submitting !== null}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-text-quaternary">
          You can revoke this at any time from your dashboard.
        </p>
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
    </div>
  );
}

/**
 * Sends an unauthenticated visitor to sign in, then back here.
 *
 * The return path carries the request id, so approving after signing in
 * resumes the same flow rather than dropping the user on the dashboard with
 * their client still waiting.
 */
function SignInPrompt({ clientName }: { clientName: string }) {
  const navigate = useNavigate();
  const { requestId = "" } = useParams();
  const [search] = useSearchParams();
  const id = requestId || search.get("request") || "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo className="size-8" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">
            Sign in to continue
          </h1>
          <p className="text-sm text-text-tertiary">
            {clientName} is asking for access to your tools. Sign in to choose
            what it can see.
          </p>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() =>
          navigate(`/start?next=${encodeURIComponent(`/oauth/consent?request=${id}`)}`)
        }
      >
        Sign in
      </Button>
    </div>
  );
}

function ConsentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  );
}
