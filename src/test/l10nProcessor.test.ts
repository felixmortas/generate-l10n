import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { L10nProcessor } from "../core/l10nProcessor.js"; // Ajuste le chemin
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("L10nProcessor - Intégration", () => {
  let tempDir: string;
  let processor: L10nProcessor;

  // On prépare une structure de fichiers réaliste
  beforeEach(async () => {
    // 1. Création du dossier temporaire
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "l10n-integration-"));
    
    const l10nDir = path.join(tempDir, "lib/l10n");
    await fs.mkdir(l10nDir, { recursive: true });

    // 2. Création de fichiers ARB initiaux
    await fs.writeFile(path.join(l10nDir, "app_fr.arb"), JSON.stringify({ "@@locale": "fr" }));
    await fs.writeFile(path.join(l10nDir, "app_en.arb"), JSON.stringify({ "@@locale": "en" }));

    // 3. Création d'un fichier Dart de test
    const dartPath = path.join(tempDir, "lib/email_page.dart");
    const dartContent = `
      const Text('Abonnement activé.');
    `;
    await fs.writeFile(dartPath, dartContent);

    // 4. Initialisation du processeur
    processor = new L10nProcessor({
      provider: "openai",
      model: "gpt-4",
      arbsFolder: l10nDir,
      files: [dartPath],
      apiKey: "fake-key",
      packageName: "my_app",
      backup: false
    });

    // 5. Mock du LLM
    // On accède à l'instance pour définir les retours
    const llm = (processor as any).llm;
    
    // Pour processSelectedText
    vi.spyOn(llm, 'detectTextLanguage').mockResolvedValue({ lang_tag: "fr" });
    vi.spyOn(llm, 'findOrTranslateKey').mockResolvedValue({
      found: false,
      key: "subscriptionActivated",
      fr: "Abonnement activé.",
      en: "Subscription activated."
    });

    // Pour processFiles (le mode batch)
    vi.spyOn(llm, 'chooseFileLanguage').mockResolvedValue("fr");
    vi.spyOn(llm, 'processFiles').mockResolvedValue(
      `<JSON>{"welcome": "Bienvenue"}</JSON><dart>Text(AppLocalizations.of(context)!.welcome)</dart>`
    );
    vi.spyOn(llm, 'amendArb').mockResolvedValue(JSON.stringify({ "welcome": "Welcome" }));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("devrait traiter un texte sélectionné (processSelectedText)", async () => {
    const result = await processor.processSelectedText("'Abonnement activé.'");

    // 1. Vérifie le retour
    expect(result).toBe("AppLocalizations.of(context)!.subscriptionActivated");

    // 2. Vérifie que le fichier ARB FR a été mis à jour
    const frContent = JSON.parse(await fs.readFile(path.join(tempDir, "lib/l10n/app_fr.arb"), "utf-8"));
    expect(frContent.subscriptionActivated).toBe("Abonnement activé.");

    // 3. Vérifie que le fichier ARB EN a été traduit
    const enContent = JSON.parse(await fs.readFile(path.join(tempDir, "lib/l10n/app_en.arb"), "utf-8"));
    expect(enContent.subscriptionActivated).toBe("Subscription activated.");
  });

  it("devrait traiter un fichier entier (processFiles)", async () => {
    await processor.processFiles();

    // 1. Vérifie que le fichier Dart a été modifié
    const dartContent = await fs.readFile(path.join(tempDir, "lib/email_page.dart"), "utf-8");
    expect(dartContent).toContain("AppLocalizations.of(context)!.welcome");

    // 2. Vérifie que les ARB ont les nouvelles clés
    const frContent = JSON.parse(await fs.readFile(path.join(tempDir, "lib/l10n/app_fr.arb"), "utf-8"));
    expect(frContent.welcome).toBe("Bienvenue");
  });
});