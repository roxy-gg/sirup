import { Button } from "@/components/ui/button";
import { StaggerReveal } from "./StaggerReveal";
import { CopyField } from "./CopyField";
import { ClientConfig } from "@/features/mcp-manage/components/ClientConfig";
import type { Profile } from "@shared/domain";

/**
 * COMPONENT -- step 3: the payoff.
 *
 * This is the one endpoint your AI clients point at. Everything you connect
 * later shows up here automatically, without touching client config again --
 * which is the entire pitch, so the screen states it plainly.
 */
interface ConnectStepProps {
  /** The default profile, which carries the token a client will use. */
  profile: Profile | undefined;
  onContinue: () => void;
}

export function ConnectStep({ profile, onContinue }: ConnectStepProps) {
  const endpoint = `${window.location.origin}/mcp`;
  const token = profile?.gateway_token ?? "";

  return (
    <StaggerReveal className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Your MCP endpoint</h1>
        <p className="text-sm text-text-tertiary">
          Add this to Claude, Cursor, VS Code, or any MCP client. Connect servers
          in sirup and they appear here — no client changes needed.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <CopyField label="Endpoint URL" value={endpoint} />
        <CopyField label="Gateway token" value={token} />

        {/* Open here: pasting this config is the whole point of the step, so
            hiding it behind a click would be one obstacle too many. */}
        <ClientConfig
          endpoint={endpoint}
          token={token}
          profileName={profile?.name}
          defaultOpen
        />
      </div>

      <Button onClick={onContinue} className="w-full">
        Continue
      </Button>
    </StaggerReveal>
  );
}
