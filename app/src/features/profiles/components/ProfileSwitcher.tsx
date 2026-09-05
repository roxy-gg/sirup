import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useProfiles } from "../hooks/useProfiles";
import { CreateProfileDialog } from "./CreateProfileDialog";

/**
 * COMPONENT -- the profile switcher, top-left in the sidebar.
 *
 * Switching changes which token the dashboard shows and which connections read
 * as attached, so it belongs above the nav rather than buried in settings.
 */
export function ProfileSwitcher({ companyName }: { companyName: string }) {
  const { profiles, activeProfile, setActiveProfileId } = useProfiles();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
            "transition-colors duration-[var(--duration-quick)] hover:bg-sidebar-accent/60",
            "focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ring",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-mini font-medium">
              {activeProfile?.name ?? "Main"}
            </span>
            <span className="truncate text-xs text-text-quaternary">
              {companyName}
            </span>
          </div>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-text-quaternary" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-tiny text-text-quaternary">
            Profiles
          </DropdownMenuLabel>

          <DropdownMenuGroup>
            {profiles.map((profile) => (
              <DropdownMenuItem
                key={profile.id}
                onSelect={() => setActiveProfileId(profile.id)}
                className="gap-2"
              >
                <CheckIcon
                  className={cn(
                    "size-3.5 shrink-0",
                    profile.id === activeProfile?.id ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                {/* The tool count is the useful signal here: it is what this
                    profile's token actually exposes. */}
                <span className="shrink-0 font-mono text-tiny text-text-quaternary tabular-nums">
                  {profile.tool_count}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setDialogOpen(true)} className="gap-2">
            <PlusIcon className="size-3.5" />
            New profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProfileDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
