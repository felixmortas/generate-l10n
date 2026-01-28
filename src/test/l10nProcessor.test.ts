import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LLMClient } from "../core/llmClient.js";
import { LLMService } from "../core/llmService.js";
import { L10nProcessor, L10nProcessorOptions } from "../core/l10nProcessor.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("L10nProcessor - Intégration", () => {
  let tempDir: string;
  let processor: L10nProcessor;

  // We prepare a realistic file structure.
  beforeEach(async () => {
    // 1. Creating the temporary folder
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "l10n-integration-"));
    
    const l10nDir = path.join(tempDir, "lib/l10n");
    await fs.mkdir(l10nDir, { recursive: true });

    // 2. Creation of initial ARB files
    await fs.writeFile(path.join(l10nDir, "app_fr.arb"), JSON.stringify({ "@@locale": "fr" }));
    await fs.writeFile(path.join(l10nDir, "app_en.arb"), JSON.stringify({ "@@locale": "en" }));

    // 3. Creation of a test Dart file
    const dartPath = path.join(tempDir, "lib/email_page.dart");
    const dartContent = `
      const Text('Abonnement activé.');
    `;
    await fs.writeFile(dartPath, dartContent);

    // 4. Processor initialization
    const processorOptions: L10nProcessorOptions = {
      provider: "openai",
      model: "gpt-4",
      arbsFolder: l10nDir,
      files: [dartPath],
      apiKey: "fake-key",
      packageName: "my_app",
      backup: false
    };

    const llmClient = new LLMClient(
      processorOptions.provider,
      processorOptions.model,
      processorOptions.apiKey
    );
    
    const llmService = new LLMService(llmClient);
    processor = new L10nProcessor(processorOptions, llmService);

    // 5. LLM Mocking
    // Access the instance to define returns
    const llm = (processor as any).llm;
    
    // For localizeSelectedText
    vi.spyOn(llm, 'detectTextLanguage').mockResolvedValue({ lang_tag: "fr" });
    vi.spyOn(llm, 'findOrTranslateKey').mockResolvedValue({
      found: false,
      key: "subscriptionActivated",
      fr: "Abonnement activé.",
      en: "Subscription activated."
    });

    // For localizeFiles (the batch mode)
    vi.spyOn(llm, 'chooseFileLanguage').mockResolvedValue("fr");
    vi.spyOn(llm, 'localizeFiles').mockResolvedValue({
      new_arb_keys: { "welcome": "Bienvenue" },
      modified_dart_code: "const Text(AppLocalizations.of(context)!.welcome);"
    });
    vi.spyOn(llm, 'amendArb').mockResolvedValue(JSON.stringify({ 
      "@@locale": "en",
      "welcome": "Welcome" 
    }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should process a selected text (localizeSelectedText)", async () => {
    const result = await processor.localizeSelectedText("'Abonnement activé.'");

    // 1. Check the return
    expect(result).toBe("AppLocalizations.of(context)!.subscriptionActivated");

    // 2. Verify that the FR ARB file was updated
    const frContent = JSON.parse(await fs.readFile(path.join(tempDir, "lib/l10n/app_fr.arb"), "utf-8"));
    expect(frContent.subscriptionActivated).toBe("Abonnement activé.");

    // 3. Verify that the EN ARB file was translated
    const enContent = JSON.parse(await fs.readFile(path.join(tempDir, "lib/l10n/app_en.arb"), "utf-8"));
    expect(enContent.subscriptionActivated).toBe("Subscription activated.");
  });

  it("should process an entire file (localizeFiles)", async () => {
    await processor.localizeFiles();

    // 1. Check that the Dart file has been modified
    const dartContent = await fs.readFile(path.join(tempDir, "lib/email_page.dart"), "utf-8");
    expect(dartContent).toContain("AppLocalizations.of(context)!.welcome");

    // 2. Verify that the ARB files have the new keys
    const frContent = JSON.parse(await fs.readFile(path.join(tempDir, "lib/l10n/app_fr.arb"), "utf-8"));
    expect(frContent.welcome).toBe("Bienvenue");
  });
});