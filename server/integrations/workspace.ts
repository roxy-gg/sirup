import { googleWorkspaceIntegration } from "./googleWorkspace.js";

/**
 * Drive.
 *
 * `drive` is full read/write across the user's files. The MCP server also
 * advertises `drive.file`, which is limited to files the app itself created —
 * useless for `search_files` and `read_file_content` over an existing Drive,
 * which is the entire point of connecting it.
 *
 * Covers all 8 tools, including copy_file and create_file.
 */
export const driveIntegration = googleWorkspaceIntegration({
  key: "drive",
  name: "Google Drive",
  host: "drivemcp",
  scopes: ["https://www.googleapis.com/auth/drive"],
});

/**
 * Sheets.
 *
 * `spreadsheets` covers get/update values, formulas, and insert_dimension.
 * `drive` is needed alongside it so the agent can find a spreadsheet by name
 * rather than requiring the user to paste an ID.
 */
export const sheetsIntegration = googleWorkspaceIntegration({
  key: "sheets",
  name: "Google Sheets",
  host: "sheetsmcp",
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

/** Docs. `documents` for read_doc/update_doc, `drive` to locate files. */
export const docsIntegration = googleWorkspaceIntegration({
  key: "docs",
  name: "Google Docs",
  host: "docsmcp",
  scopes: [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
  ],
});

/**
 * Slides. `presentations` for read/update, `drive` to locate files.
 */
export const slidesIntegration = googleWorkspaceIntegration({
  key: "slides",
  name: "Google Slides",
  host: "slidesmcp",
  scopes: [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
  ],
});
