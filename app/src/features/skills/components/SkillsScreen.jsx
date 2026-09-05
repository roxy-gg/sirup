import { SparklesIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * COMPONENT -- the Skills full screen.
 *
 * Deliberately a placeholder. Skills-over-MCP is still an open working group at
 * the MCP project, so shipping a guess at the shape now would mean rewriting it
 * when the spec lands. The nav entry exists so the surface is claimed.
 */
export function SkillsScreen() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Shared instructions and playbooks for your whole company.
        </p>
      </header>

      <Empty className="rounded-xl border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>Coming after MCP</EmptyTitle>
          <EmptyDescription>
            Skills will ride the same gateway as your MCP servers. We&rsquo;re
            waiting on the Skills-over-MCP spec so this works with every client
            on day one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
