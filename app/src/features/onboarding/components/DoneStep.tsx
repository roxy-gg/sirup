import { Button } from "@/components/ui/button";
import { SuccessCheck } from "./SuccessCheck";
import { StaggerReveal } from "./StaggerReveal";

/**
 * COMPONENT -- step 4: confirmation. The check animates in on mount, which is
 * what makes the moment feel earned rather than instantaneous.
 */
interface DoneStepProps {
  companyName: string;
  onFinish: () => void;
}

export function DoneStep({ companyName, onFinish }: DoneStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <SuccessCheck />

      <StaggerReveal className="flex flex-col items-center gap-6" delay={220}>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">You&rsquo;re connected</h1>
          <p className="text-sm text-muted-foreground">
            {companyName} is live. Add your first MCP server and every client
            pointed at your endpoint picks it up instantly.
          </p>
        </div>

        <Button onClick={onFinish} className="w-full">
          Go to dashboard
        </Button>
      </StaggerReveal>
    </div>
  );
}
