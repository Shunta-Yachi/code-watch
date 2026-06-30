/**
 * VS Code WebView bridge exposed to browser-side scripts.
 */
interface VsCodeApi<TMessage> {
  /**
   * Sends a message to the extension host.
   *
   * @param message - Message payload.
   */
  postMessage(message: TMessage): void;
}

/**
 * Acquires the VS Code WebView API.
 *
 * @returns VS Code WebView bridge.
 */
declare function acquireVsCodeApi<TMessage>(): VsCodeApi<TMessage>;
