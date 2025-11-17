#!/usr/bin/env node
import { Command } from "commander";
import { L10nProcessor } from "./l10nProcessor.js";

const program = new Command();
program
  .requiredOption("--provider <provider>", "LLM provider (mistral, openai, google)")
  .requiredOption("--model <model>", "Model name to use")
  .requiredOption("--arbs-folder <path>", "Directory of .arb localization files")
  .requiredOption("--files <files...>", "Flutter files to process")
  .requiredOption("--package-name <name>", "Flutter project package name")
  .option("--api-key <key>", "API key for the LLM provider");

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
  const processor = new L10nProcessor({
    provider: opts.provider,
    model: opts.model,
    arbsFolder: opts.arbsFolder,
    files: opts.files,
    apiKey: opts.apiKey ?? process.env[`${opts.provider.toUpperCase()}_API_KEY`] ?? "",
    packageName: opts.packageName ?? "",
  });

  await processor.process();
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
