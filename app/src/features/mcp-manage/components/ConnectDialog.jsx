import { useEffect, useState } from "react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * COMPONENT (stateless w.r.t. the server list) -- the connect form.
 *
 * Prefills from a catalog entry when one was clicked, and stays fully editable
 * so a self-hosted instance of the same product still works.
 */
export function ConnectDialog({ open, onOpenChange, preset, onConnect }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [headerName, setHeaderName] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Re-seed whenever the dialog opens, so a second connect isn't polluted by
  // whatever was typed the first time.
  useEffect(() => {
    if (!open) return;
    setName(preset?.name && preset.key !== "custom" ? preset.name : "");
    setUrl(preset?.url || "");
    setAuthType(preset?.auth_type || "none");
    setHeaderName("");
    setAuthValue("");
    setError(null);
  }, [open, preset]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onConnect({
        name,
        url,
        auth_type: authType,
        auth_header_name: authType === "header" ? headerName : null,
        auth_value: authType === "none" ? null : authValue,
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an MCP server</DialogTitle>
          <DialogDescription>
            Its tools join your gateway immediately — clients stay pointed at the
            same endpoint.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="server-name">Name</FieldLabel>
              <Input
                id="server-name"
                placeholder="Gmail"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <FieldDescription>
                Used to namespace its tools, e.g. <code>gmail__send_email</code>.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="server-url">Endpoint URL</FieldLabel>
              <Input
                id="server-url"
                type="url"
                placeholder="https://mcp.example.com/mcp"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
              <FieldDescription>
                Streamable HTTP or SSE. sirup detects which one automatically.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="auth-type">Authentication</FieldLabel>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger id="auth-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer token</SelectItem>
                    <SelectItem value="header">Custom header</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {preset?.auth_hint ? (
                <FieldDescription>{preset.auth_hint}</FieldDescription>
              ) : null}
            </Field>

            {authType === "header" ? (
              <Field>
                <FieldLabel htmlFor="header-name">Header name</FieldLabel>
                <Input
                  id="header-name"
                  placeholder="X-API-Key"
                  value={headerName}
                  onChange={(event) => setHeaderName(event.target.value)}
                  required
                />
              </Field>
            ) : null}

            {authType !== "none" ? (
              <Field>
                <FieldLabel htmlFor="auth-value">Credential</FieldLabel>
                <Input
                  id="auth-value"
                  type="password"
                  placeholder="Paste the token"
                  value={authValue}
                  onChange={(event) => setAuthValue(event.target.value)}
                  required
                />
                <FieldDescription>
                  Stored server-side and never returned to the browser.
                </FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
