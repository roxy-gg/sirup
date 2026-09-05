import { Button } from "@/components/ui/button";
import { StaggerReveal } from "./StaggerReveal";
import { CopyField } from "./CopyField";
import type { Company } from "@shared/domain";

/**
 * COMPONENT -- step 3: the payoff.
 *
 * This is the one endpoint the company's AI clients point at. Everything they
 * connect later shows up here automatically, without touching client config
 * again -- which is the entire pitch, so the screen states it plainly.
 */
interface ConnectStepProps {
  company: Company | null;
  onContinue: () => void;
}

export function ConnectStep({ company, onContinue }: ConnectStepProps) {
  const endpoint = `${window.location.origin}/mcp`;
  const token = company?.gateway_token ?? "";

  return (
    <StaggerReveal className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Your MCP endpoint</h1>
        <p className="text-sm text-muted-foreground">
          Add this to Claude, Cursor, VS Code, or any MCP client. Connect servers
          in sirup and they appear here — no client changes needed.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <CopyField label="Endpoint URL" value={endpoint} />
        <CopyField label="Gateway token" value={token} />
      </div>

      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Example client config
        </p>
        <pre className="overflow-x-auto text-xs leading-relaxed">
          <code>
            {JSON.stringify(
              {
                mcpServers: {
                  sirup: {
                    type: "http",
                    url: endpoint,
                    headers: { Authorization: `Bearer ${token}` },
                  },
                },
              },
              null,
              2,
            )}
          </code>
        </pre>
      </div>

      <Button onClick={onContinue} className="w-full">
        Continue
      </Button>
    </StaggerReveal>
  );
}
