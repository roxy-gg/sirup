import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SiteNav } from "@/components/SiteNav";
import { GithubIcon } from "@/components/icons";
import { GatewayDiagram } from "./GatewayDiagram";
import { useLandingApps } from "../hooks/useLandingApps";
import { REPO_URL } from "../hooks/useRepoStats";

/**
 * COMPONENT -- the marketing page.
 *
 * Deliberately one screen of copy and one call to action. Every number on it
 * is read from the live catalog, so the claims cannot drift from what the
 * product actually does -- including which OAuth integrations are configured.
 */
export function LandingScreen() {
  const { visible, total, connectable, status } = useLandingApps();
  const endpoint = `${window.location.origin}/mcp`;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteNav />

      {/*
        max-w-5xl and px-5, matching the nav's column exactly. It was 6xl/px-6
        before, which meant the logo in the header sat a few pixels outside the
        content it was heading -- the kind of misalignment nobody consciously
        notices and everybody feels.
      */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-5 pb-24">
        {/* ── Hero: copy left, diagram right ───────────────────────────── */}
        <section className="grid items-center gap-10 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14 lg:pt-16">
          <div className="flex flex-col items-start gap-6">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              A single endpoint for all your MCP servers
            </h1>

            <p className="max-w-lg text-base text-pretty text-text-tertiary">
              Connect your tools once. Every AI client you use — Claude Code,
              Cursor, Codex — points at one URL and sees all of them. Add a
              server later and they pick it up without a config change.
            </p>

            <div className="flex flex-col items-start gap-3">
              <Button size="lg" asChild>
                <Link to="/start">Get started — it&rsquo;s free</Link>
              </Button>
              <span className="text-mini text-text-quaternary">
                No credit card. Open source.
              </span>
            </div>
          </div>

          {/* Below lg the bracket layout has nowhere to go, so the mobile
              version states the same thing in words. */}
          <div className="hidden justify-self-center lg:block">
            <GatewayDiagram apps={visible} endpoint={endpoint} />
          </div>
          <p className="max-w-sm text-sm text-text-tertiary lg:hidden">
            Your editors connect to <code className="font-mono">sirup.gg/mcp</code>.
            sirup connects to everything else.
          </p>
        </section>

        {/* ── What it actually does ────────────────────────────────────── */}
        <section className="grid gap-8 sm:grid-cols-3">
          <Point title="One connection to manage">
            Configure a server once, here. You never paste an API key into an
            editor again, and revoking access is one click rather than hunting
            through every client config you set up.
          </Point>
          <Point title="Pick what agents can do">
            Connecting reads the server&rsquo;s real tool list, then you choose
            which of them your agents may call. Turn one off and it disappears
            from the endpoint immediately.
          </Point>
          <Point title="See every call">
            Each tool call is logged with which server answered, how long it
            took, and whether it failed. It is the audit trail you do not get
            when each client talks to each server directly.
          </Point>
        </section>

        {/* ── Honest status ────────────────────────────────────────────── */}
        <section className="surface flex flex-col gap-3 rounded-xl bg-card p-6">
          <h2 className="text-sm font-semibold">Where this is today</h2>
          <p className="text-sm leading-relaxed text-text-tertiary">
            {status === "ready" ? (
              <>
                The catalog has <strong className="text-foreground">{total} apps</strong>.{" "}
                <strong className="text-foreground">{connectable}</strong> connect
                right now with configured sign-in flows or API keys. Integrations
                that still need setup or a reviewed OAuth flow are marked
                unavailable.
              </>
            ) : (
              <>Loading the catalog…</>
            )}
          </p>
          <p className="text-sm leading-relaxed text-text-tertiary">
            Anything with a public MCP endpoint works today, listed or not —
            paste the URL and sirup discovers its tools.
          </p>
        </section>

        {/* ── Close ────────────────────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            Set it up in about a minute
          </h2>
          <p className="max-w-md text-sm text-text-tertiary">
            Create an account, name your company, copy your endpoint into your
            editor. That&rsquo;s the whole thing.
          </p>
          <Button size="lg" asChild>
            <Link to="/start">Get started</Link>
          </Button>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 border-t px-5 py-6">
        <span className="text-mini text-text-quaternary">
          sirup.gg — MIT licensed
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-mini text-text-tertiary underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <GithubIcon className="size-3.5" />
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-text-tertiary">{children}</p>
    </div>
  );
}
