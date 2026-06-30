import type Database from "better-sqlite3";
import * as vscode from "vscode";
import { resolveTimezone } from "../settings/timezone";
import type { MessageToExtension, MessageToWebview } from "../types";
import { localDateInTimeZone } from "../util/time";
import { computeDailyAggregation } from "./aggregation";

/**
 * WebView provider for the Code Watch activity view.
 */
export class ActivityViewProvider implements vscode.WebviewViewProvider {
  /** Registered VS Code view id. */
  static readonly viewType = "codeWatch.activityView";

  /** Currently resolved WebView, if visible. */
  private view: vscode.WebviewView | undefined;

  /** Local date currently displayed by the view. */
  private currentDate: string | undefined;

  /**
   * Creates an activity view provider.
   *
   * @param extensionUri - Root URI of the extension installation.
   * @param database - Initialized SQLite database connection.
   */
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly database: Database.Database,
  ) {}

  /** {@inheritdoc vscode.WebviewViewProvider.resolveWebviewView} */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: MessageToExtension) => {
      this.handleMessage(message);
    });
  }

  /**
   * Recomputes and posts aggregation data for the current date.
   */
  refresh(): void {
    const view = this.view;
    if (view === undefined) {
      return;
    }

    const timeZone = resolveTimezone(vscode.workspace);
    this.currentDate ??= localDateInTimeZone(new Date(), timeZone);
    const result = computeDailyAggregation(
      this.database,
      this.currentDate,
      timeZone,
    );
    const message: MessageToWebview = {
      type: "render",
      result,
      timeZone,
    };

    void view.webview.postMessage(message);
  }

  /**
   * Handles a message received from the WebView.
   *
   * @param message - Message from the browser-side script.
   */
  private handleMessage(message: MessageToExtension): void {
    if (message.type === "changeDate") {
      this.currentDate = message.date;
    }

    this.refresh();
  }

  /**
   * Builds the HTML document served to the WebView.
   *
   * @param webview - Target WebView.
   * @returns HTML document.
   */
  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "webview-ui", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.css"),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri.toString()}">
  <title>Code Watch</title>
</head>
<body>
  <main class="app">
    <header class="toolbar">
      <button id="previous-day" class="icon-button" type="button" title="Previous day" aria-label="Previous day">&lt;</button>
      <div class="date-block">
        <time id="selected-date" class="date-label"></time>
        <span id="timezone" class="timezone-label"></span>
      </div>
      <button id="next-day" class="icon-button" type="button" title="Next day" aria-label="Next day">&gt;</button>
    </header>
    <section class="summary" aria-label="Total work time">
      <span class="summary-label">Total</span>
      <strong id="total-time" class="summary-value">0m</strong>
    </section>
    <section id="workspace-list" class="workspace-list" aria-label="Workspace work time"></section>
  </main>
  <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }
}

/**
 * Creates a random nonce for the WebView script tag.
 *
 * @returns Random nonce string.
 */
function createNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return nonce;
}
