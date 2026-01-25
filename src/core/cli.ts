#!/usr/bin/env node
import { Command } from "commander";
import { L10nProcessor, L10nProcessorOptions } from "./l10nProcessor.js";

const program = new Command();
program
  .name("auto-l10n")
  .description("AI-powered localization tool for Flutter")
  .requiredOption("--provider <provider>", "LLM provider (mistral, openai, google)")
  .requiredOption("--model <model>", "Model name to use")
  .requiredOption("--arbs-folder <path>", "Directory of .arb localization files")
  .requiredOption("--files <files...>", "Flutter files to process")
  .requiredOption("--package-name <name>", "Flutter project package name")
  .option("--api-key <key>", "API key for the LLM provider")
  .option("--backup", "Create backup files before modifying (.bak)", false);

program.parse(process.argv);

/**
 * Main entry point for the Auto L10n CLI application.
 * Initializes the L10nProcessor with command line options and processes the localization files.
 * 
 * @remarks
 * This function uses command line arguments parsed by Commander.js program object.
 * If no API key is provided via command line, it will attempt to use an environment variable
 * based on the provider name (e.g., OPENAI_API_KEY for OpenAI provider).
 * 
 * @async
 * @throws Will throw an error if the processor encounters issues during execution
 */
async function main() {
  const opts = program.opts();

  /**
   * Resolve API Key: Priority to CLI flag, then environment variables.
   */
  const apiKey = opts.apiKey ?? process.env[`${opts.provider.toUpperCase()}_API_KEY`] ?? "";

  if (!apiKey) {
    console.error(`[ERROR] No API key found. Please provide --api-key or set ${opts.provider.toUpperCase()}_API_KEY environment variable.`);
    process.exit(1);
  }

  /**
   * Construct the processor options matching the ExtensionConfiguration interface.
   * Note: 'files' is specific to the L10nProcessorOptions.
   */
  const processorOptions: L10nProcessorOptions = {
    provider: opts.provider,
    model: opts.model,
    arbsFolder: opts.arbsFolder,
    apiKey: apiKey,
    packageName: opts.packageName,
    backup: !!opts.backup,
    files: opts.files,
  };

  console.info(`[INFO] Starting localization with ${opts.provider} (${opts.model})...`);

  const processor = new L10nProcessor(processorOptions);

  try {
    await processor.localizeFiles();
    console.info("[SUCCESS] Localization completed successfully.");
  } catch (err: any) {
    throw err;
  }
}

main().catch((err) => {
  console.error("[ERROR]", err.message ||err);
  process.exit(1);
});
