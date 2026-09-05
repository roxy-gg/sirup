import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { AppIcon } from "@/components/AppIcon";
import { toast } from "sonner";
import { useProfiles } from "../hooks/useProfiles";
import { useMcpServers } from "@/features/mcp-manage/hooks/useMcpServers";
import type { Uuid } from "@shared/domain";

/**
 * COMPONENT -- create a profile and pick what it exposes.
 *
 * Choosing connections up front matters: a profile with nothing attached
 * serves an empty tool list, which looks broken rather than empty.
 */
export function CreateProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, isBusy } = useProfiles();
  const servers = useMcpServers();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<Uuid>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    // Pre-select everything: "same as now, minus a few" is the common shape,
    // and unchecking is less work than checking a dozen boxes.
    setSelected(new Set(servers.servers.map((server) => server.id)));
    setError(null);
  }, [open, servers.servers]);

  function toggle(id: Uuid) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const profile = await create(name, [...selected]);
      toast.success(`${profile.name} created`, {
        description: `${profile.tool_count} tool${
          profile.tool_count === 1 ? "" : "s"
        } on its own token.`,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not create profile.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New profile</DialogTitle>
          <DialogDescription>
            A profile gets its own gateway token and exposes only the
            connections you pick.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              placeholder="Frontend"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
            <FieldDescription>
              Something your team will recognise in a client config.
            </FieldDescription>
          </Field>

          <Separator />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-mini font-medium">Connections</span>
              <span className="text-xs text-text-quaternary">
                {selected.size} of {servers.servers.length}
              </span>
            </div>

            {servers.servers.length === 0 ? (
              <p className="py-4 text-center text-xs text-text-tertiary">
                Nothing connected yet. You can attach apps after creating this.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                {servers.servers.map((server) => (
                  <label
                    key={server.id}
                    className="flex items-center gap-2.5 rounded-md py-2 pr-2 transition-colors hover:bg-accent/40"
                  >
                    <Checkbox
                      checked={selected.has(server.id)}
                      onCheckedChange={() => toggle(server.id)}
                    />
                    <AppIcon name={server.name} className="size-6" />
                    <span className="min-w-0 flex-1 truncate text-mini">
                      {server.name}
                    </span>
                    <span className="shrink-0 font-mono text-tiny text-text-quaternary tabular-nums">
                      {server.tool_count}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? "Creating…" : "Create profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
