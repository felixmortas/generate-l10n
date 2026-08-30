# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1] - 2026-08-30

### Added
- **Project Root Setting**: Added `generateL10n.projectRoot` setting to support nested Flutter projects and multi-root workspaces.
- **Dynamic Configuration**: Added support for reading `arb-dir` and `template-arb-file` custom configurations directly from `l10n.yaml`.
- **Locale Stem Support**: Added support for ARB files using script subtags (e.g., `zh_Hant_TW`) and UN M.49 numeric regions (e.g., `es_419`).

### Fixed
- **ARB Preservation**: Stopped full reformatting of ARB files on update; existing entry order, line endings (LF/CRLF), custom key indentation, and trailing newlines are now preserved.
- **Execution Race Condition**: Fixed `flutter gen-l10n` process execution handling by awaiting completion explicitly and registering task completion listeners prior to task execution.
- **Nested Tree Views**: Updated Tree View file discovery to properly scope to the detected project root instead of defaulting to workspace root.

### Chore
- Added `.DS_Store` to `.gitignore` and removed tracked `.DS_Store` files from the repository index.

## [1.2.0] - 2026-01-28

### Added
- **Selected Text Localization**: New feature allowing users to localize a specific string without processing the entire file.
  - Accessible via **Right-click context menu** or the **Lightbulb (Quick Fix)** icon.
  - Automatically detects the source language of the selected text using AI.
  - Automatically checks existing `.arb` files to prevent duplicate keys.
  - Updates all language files in `lib/l10n/` with the new key/value pair if it doesn't exist.
- **"Auto-l10n & Execute" Command**: A new combined action that processes the selection and immediately runs `flutter gen-l10n` to update generated localizations.
- **Enhanced UI**: Improved button naming and UX labels for a more intuitive workflow.
- **Automated CI/CD**: Added automated build and publish scripts to the repository.

### Changed
- **Major Refactoring (Maintainability)**:
  - **L10nProcessor**: Refactored to use modular utility functions for better scalability.
  - **LLM Service**: Decoupled API communication from business logic.
  - **Code Action Provider**: Optimized the logic for the VS Code "Quick Fix" lightbulb integration.
  - **Configuration Management**: Improved how the extension handles and updates user settings.
  - **Migration to Fetch API**: Switched to native REST requests with JSON output for more reliable LLM responses.
- **Localization & Documentation**:
  - Translated all internal error messages to English.
  - Improved file-level documentation and comments throughout the codebase.
- **Parsing Logic**: Updated the LLM response parser to better handle markdown-formatted code blocks (e.g., ```json) returned by models.

### Fixed
- **Naming Consistency**: Fixed typos in file and function names across the project.
- **Prompt Reliability**: Updated and renamed prompt templates to ensure higher accuracy with new LLM models.
- **Stability**: Fixed a bug in the TreeView refresh logic.

### Internal
- Added integration tests for the `L10nProcessor` and `ProcessTextSelected` logic.
- Cleaned up debug logs for production builds.
- Adjusted test suites to exclude LLM API calls during full execution tests to save on token usage.