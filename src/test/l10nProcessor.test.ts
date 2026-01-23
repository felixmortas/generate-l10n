import { describe, it, expect, vi, beforeEach } from "vitest";
import { L10nProcessor, L10nProcessorOptions } from "../core/l10nProcessor.js"; // Ajustez le chemin
import fs from "fs/promises";
import * as utils from "../core//utils.js";

// 1. Mocks des modules externes
vi.mock("fs/promises");
vi.mock("../core/utils.js", () => ({
  isValidFlutterString: vi.fn(),
  getAvailableLangs: vi.fn(),
  updateArbFiles: vi.fn(),
  atomicWrite: vi.fn(),
  mergeJsonStrings: vi.fn(),
}));

// 2. Mock de la classe LLM
// On mocke l'implémentation pour pouvoir contrôler les retours des méthodes
vi.mock("../core/llm.js", () => {
  return {
    LLM: vi.fn().mockImplementation(() => ({
      detectTextLanguage: vi.fn(),
      findOrTranslateKey: vi.fn(),
      chooseFileLanguage: vi.fn(),
      processFiles: vi.fn(),
      amendArb: vi.fn(),
    })),
  };
});

describe("L10nProcessor - processSelectedText", () => {
  let processor: L10nProcessor;
  const mockOpts: L10nProcessorOptions = {
    provider: "openai",
    model: "gpt-4",
    arbsFolder: "./arbs",
    files: ["lib/main.dart"],
    apiKey: "fake-key",
    packageName: "my_app",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new L10nProcessor(mockOpts);
  });

  it("devrait retourner le code Flutter correct et mettre à jour les fichiers ARB", async () => {
    // GIVEN
    const selectedText = "'Bonjour tout le monde'";
    const cleanText = "Bonjour tout le monde";
    const availableLangs = ["fr", "en"];
    
    // Mock des utilitaires
    vi.mocked(utils.isValidFlutterString).mockReturnValue(true);
    vi.mocked(utils.getAvailableLangs).mockResolvedValue(availableLangs);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ "@@locale": "fr" }));

    // Mock des appels LLM (via l'instance privée accessible car mockée globalement)
    const llmInstance = (processor as any).llm;
    llmInstance.detectTextLanguage.mockResolvedValue({ lang_tag: "fr" });
    llmInstance.findOrTranslateKey.mockResolvedValue({
      found: false,
      key: "helloWorld",
      fr: "Bonjour tout le monde",
      en: "Hello world",
    });

    // WHEN
    const result = await processor.processSelectedText(selectedText);

    // THEN
    // Vérifie le résultat final
    expect(result).toBe("AppLocalizations.of(context)!.helloWorld");

    // Vérifie que la validation a été appelée
    expect(utils.isValidFlutterString).toHaveBeenCalledWith(selectedText);

    // Vérifie que le LLM a été sollicité avec le texte nettoyé
    expect(llmInstance.detectTextLanguage).toHaveBeenCalledWith(cleanText, availableLangs);

    // Vérifie la mise à jour des fichiers ARB pour chaque langue
    expect(utils.updateArbFiles).toHaveBeenCalledTimes(2);
    expect(utils.updateArbFiles).toHaveBeenCalledWith(
      expect.stringContaining("app_fr.arb"),
      "helloWorld",
      "Bonjour tout le monde"
    );
    expect(utils.updateArbFiles).toHaveBeenCalledWith(
      expect.stringContaining("app_en.arb"),
      "helloWorld",
      "Hello world"
    );
  });

  it("devrait lever une erreur si la string Flutter est invalide", async () => {
    // GIVEN
    vi.mocked(utils.isValidFlutterString).mockReturnValue(false);

    // WHEN & THEN
    await expect(processor.processSelectedText("invalid-string")).rejects.toThrow(
      "Invalid selection"
    );
  });

  it("ne devrait pas appeler updateArbFiles si la clé existe déjà", async () => {
    // GIVEN
    vi.mocked(utils.isValidFlutterString).mockReturnValue(true);
    vi.mocked(utils.getAvailableLangs).mockResolvedValue(["fr"]);
    
    const llmInstance = (processor as any).llm;
    llmInstance.detectTextLanguage.mockResolvedValue({ lang_tag: "fr" });
    llmInstance.findOrTranslateKey.mockResolvedValue({
      found: true,
      key: "alreadyExistingKey",
    });

    // WHEN
    const result = await processor.processSelectedText("'Déjà là'");

    // THEN
    expect(result).toBe("AppLocalizations.of(context)!.alreadyExistingKey");
    expect(utils.updateArbFiles).not.toHaveBeenCalled();
  });
});