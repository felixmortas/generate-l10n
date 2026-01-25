import { vi } from "vitest";

/**
 * Global mock for the 'vscode' module.
 * Since vitest runs in Node.js, it cannot resolve the real VS Code API.
 */
vi.mock("vscode", () => {
  return {
    // Mocking the workspace namespace
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: "/fake/path" },
          name: "fake-workspace",
          index: 0,
        },
      ],
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((key: string) => {
          // You can add default return values here for your tests
          if (key === 'provider') return 'mistral';
          if (key === 'model') return 'mistral-large-latest';
          return undefined;
        }),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      findFiles: vi.fn().mockResolvedValue([]),
    },

    // Mocking the window namespace
    window: {
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      createTerminal: vi.fn().mockReturnValue({
        show: vi.fn(),
        sendText: vi.fn(),
      }),
      // Progress bars are common in your extension
      withProgress: vi.fn().mockImplementation((options, task) => {
        return task({ report: vi.fn() });
      }),
      activeTextEditor: undefined,
    },

    // Mocking Enums and Constants
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
    
    // Mocking Classes used for ranges/locations
    Range: vi.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    })),
    Position: vi.fn().mockImplementation((line, character) => ({ line, character })),
    Uri: {
      file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
      parse: vi.fn((path: string) => ({ fsPath: path })),
    },
  };
});