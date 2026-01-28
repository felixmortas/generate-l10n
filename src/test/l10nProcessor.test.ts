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
  let llmService: LLMService;

  beforeEach(async () => {
    // 1. Création de l'arborescence temporaire
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "l10n-integration-"));
    
    const l10nDir = path.join(tempDir, "lib", "l10n");
    await fs.mkdir(l10nDir, { recursive: true });

    // 2. Création des fichiers ARB initiaux
    // Note: On ajoute @@locale car ton code semble s'appuyer sur la structure standard
    await fs.writeFile(path.join(l10nDir, "app_fr.arb"), JSON.stringify({ "@@locale": "fr" }));
    await fs.writeFile(path.join(l10nDir, "app_en.arb"), JSON.stringify({ "@@locale": "en" }));

    // 3. Création d'un fichier Dart de test
    const dartPath = path.join(tempDir, "lib", "email_page.dart");
    const dartContent = `const Text('Abonnement activé.');`;
    await fs.writeFile(dartPath, dartContent);

    // 4. Initialisation du processeur avec injection de dépendances
    const processorOptions: L10nProcessorOptions = {
      provider: "mistral",
      model: "mistral-small-latest",
      arbsFolder: l10nDir,
      files: [dartPath],
      apiKey: "fake-key",
      packageName: "my_app",
      backup: false
    };

    const llmClient = new LLMClient(
      processorOptions.provider as any,
      processorOptions.model,
      processorOptions.apiKey
    );
    
    llmService = new LLMService(llmClient);
    processor = new L10nProcessor(processorOptions, llmService);

    // 5. MOCKING des appels LLM pour éviter les appels API réels
    // On mocke les méthodes du llmService directement
    vi.spyOn(llmService, 'detectTextLanguage').mockResolvedValue({ lang_tag: "fr" });
    vi.spyOn(llmService, 'findOrTranslateKey').mockResolvedValue({
      found: false,
      key: "subscriptionActivated",
      fr: "Abonnement activé.",
      en: "Subscription activated."
    });

    vi.spyOn(llmService, 'chooseFileLanguage').mockResolvedValue("fr");
    vi.spyOn(llmService, 'localizeFiles').mockResolvedValue({
      new_arb_keys: { "welcome": "Bienvenue" },
      modified_dart_code: "const Text(AppLocalizations.of(context)!.welcome);"
    });

    // Attention : amendArb doit renvoyer un objet Record, pas un string JSON
    // car ton code fait JSON.stringify(translated)
    vi.spyOn(llmService, 'amendArb').mockResolvedValue({ 
      "welcome": "Welcome" 
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should process a selected text (localizeSelectedText)", async () => {
    // On simule la sélection de 'Abonnement activé.'
    const result = await processor.localizeSelectedText("'Abonnement activé.'");

    // Vérifie le remplacement côté Flutter
    expect(result).toBe("AppLocalizations.of(context)!.subscriptionActivated");

    // Vérifie la mise à jour physique du fichier ARB source (FR)
    const frPath = path.join(tempDir, "lib", "l10n", "app_fr.arb");
    const frContent = JSON.parse(await fs.readFile(frPath, "utf-8"));
    expect(frContent.subscriptionActivated).toBe("Abonnement activé.");

    // Vérifie la traduction automatique dans le fichier cible (EN)
    const enPath = path.join(tempDir, "lib", "l10n", "app_en.arb");
    const enContent = JSON.parse(await fs.readFile(enPath, "utf-8"));
    expect(enContent.subscriptionActivated).toBe("Subscription activated.");
  });

  it("should process an entire file (localizeFiles)", async () => {
    await processor.localizeFiles();

    // 1. Vérifie que le fichier Dart a été modifié physiquement (atomicWrite)
    const dartPath = path.join(tempDir, "lib", "email_page.dart");
    const dartContent = await fs.readFile(dartPath, "utf-8");
    expect(dartContent).toContain("AppLocalizations.of(context)!.welcome");

    // 2. Vérifie que les fichiers ARB ont intégré les nouvelles clés
    const frPath = path.join(tempDir, "lib", "l10n", "app_fr.arb");
    const frContent = JSON.parse(await fs.readFile(frPath, "utf-8"));
    expect(frContent.welcome).toBe("Bienvenue");

    const enPath = path.join(tempDir, "lib", "l10n", "app_en.arb");
    const enContent = JSON.parse(await fs.readFile(enPath, "utf-8"));
    expect(enContent.welcome).toBe("Welcome");
  });
});