import { googleWorkspaceIntegration } from "./googleWorkspace.js";

/**
 * Gmail.
 *
 * `https://mail.google.com/` is Gmail's maximal scope: read, compose, send,
 * modify labels, trash, and permanent delete. All 23 advertised tools are
 * authorized by it.
 *
 * The narrower pair in Google's setup guide (readonly + compose) only covers
 * 8 of them — labelling, trashing, and spam all need gmail.modify.
 *
 * `gmail.settings.basic` and `gmail.settings.sharing` are deliberately not
 * requested: no current tool touches settings, filters, or delegation.
 */
export const gmailIntegration = googleWorkspaceIntegration({
  key: "gmail",
  name: "Gmail",
  host: "gmailmcp",
  scopes: ["https://mail.google.com/"],
});

export const GMAIL_MCP_URL = gmailIntegration.serverUrl;
