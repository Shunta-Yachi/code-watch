import type {
  AggregationResult,
  MessageToExtension,
  MessageToWebview,
  WorkspaceAggregation,
} from "../types";

/**
 * Browser-side VS Code API bridge.
 */
const vscode = acquireVsCodeApi<MessageToExtension>();

/**
 * Date label element.
 */
const selectedDateElement = requireElement("selected-date");

/**
 * Timezone label element.
 */
const timezoneElement = requireElement("timezone");

/**
 * Total work time element.
 */
const totalTimeElement = requireElement("total-time");

/**
 * Workspace list container.
 */
const workspaceListElement = requireElement("workspace-list");

/**
 * Previous-day button.
 */
const previousDayButton = requireElement("previous-day");

/**
 * Next-day button.
 */
const nextDayButton = requireElement("next-day");

/**
 * Date currently rendered by the WebView.
 */
let currentDate = "";

previousDayButton.addEventListener("click", () => {
  changeDateBy(-1);
});

nextDayButton.addEventListener("click", () => {
  changeDateBy(1);
});

window.addEventListener("message", (event: MessageEvent<MessageToWebview>) => {
  if (event.data.type === "render") {
    render(event.data.result, event.data.timeZone);
  }
});

vscode.postMessage({ type: "ready" });

/**
 * Renders aggregation data into the WebView.
 *
 * @param result - Aggregation result for the selected day.
 * @param timeZone - IANA timezone used for date boundaries.
 */
function render(result: AggregationResult, timeZone: string): void {
  currentDate = result.date;
  selectedDateElement.textContent = result.date;
  timezoneElement.textContent = timeZone;
  totalTimeElement.textContent = formatDuration(result.totalMs);
  workspaceListElement.replaceChildren(
    ...result.workspaces.map((workspace) => renderWorkspace(workspace)),
  );

  if (result.workspaces.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No work time recorded.";
    workspaceListElement.replaceChildren(empty);
  }
}

/**
 * Renders one workspace section.
 *
 * @param workspace - Workspace aggregation.
 * @returns Rendered section element.
 */
function renderWorkspace(workspace: WorkspaceAggregation): HTMLElement {
  const section = document.createElement("section");
  section.className = "workspace";

  const header = document.createElement("header");
  header.className = "workspace-header";

  const name = document.createElement("h2");
  name.className = "workspace-name";
  name.textContent = workspace.workspace;

  const total = document.createElement("span");
  total.className = "workspace-total";
  total.textContent = formatDuration(workspace.totalMs);

  const fileList = document.createElement("ul");
  fileList.className = "file-list";
  fileList.replaceChildren(
    ...workspace.files.map((file) => {
      const item = document.createElement("li");
      item.className = "file-row";

      const path = document.createElement("span");
      path.className = "file-path";
      path.textContent = file.filePath;

      const duration = document.createElement("span");
      duration.className = "file-duration";
      duration.textContent = formatDuration(file.workMs);

      item.replaceChildren(path, duration);
      return item;
    }),
  );

  header.replaceChildren(name, total);
  section.replaceChildren(header, fileList);
  return section;
}

/**
 * Sends a date change request to the extension host.
 *
 * @param deltaDays - Number of calendar days to add to the current date.
 */
function changeDateBy(deltaDays: number): void {
  if (currentDate === "") {
    return;
  }

  vscode.postMessage({
    type: "changeDate",
    date: addDays(currentDate, deltaDays),
  });
}

/**
 * Adds calendar days to a `YYYY-MM-DD` date string.
 *
 * @param dateLocal - Local date string.
 * @param deltaDays - Number of days to add.
 * @returns Adjusted local date string.
 */
function addDays(dateLocal: string, deltaDays: number): string {
  const date = new Date(`${dateLocal}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a duration for compact display.
 *
 * @param milliseconds - Duration in milliseconds.
 * @returns Human-readable duration.
 */
function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

/**
 * Reads an element by id.
 *
 * @param id - Element id.
 * @returns Matching element.
 * @throws Error when the element is missing.
 */
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing element: ${id}`);
  }

  return element;
}
