/**
 * L10nProcessor
 *
 * Orchestrates the full localization workflow:
 * 1. Validates the ARB folder and detects available languages.
 * 2. Detects the source language from a Flutter file.
 * 3. Uses the LLM to extract ARB keys and update Flutter files.
 * 4. Writes/merges ARB updates atomically.
 * 5. Translates ARB keys into all other detected languages.
 */

import fs from "fs/promises";
import path from "path";
import { LLM } from "./llm.js";
import { atomicWrite, mergeJsonStrings, isValidFlutterString, getAvailableLangs, updateArbFiles} from "./utils.js";

export interface L10nProcessorOptions {
  provider: string;
  model: string;
  arbsFolder: string;
  files: string[];
  apiKey: string;
  packageName: string;
  backup?: boolean;
}

export class L10nProcessor {
  private llm: LLM;
  private opts: L10nProcessorOptions;

  constructor(opts: L10nProcessorOptions) {
    this.opts = opts;
    this.llm = new LLM(opts.provider, opts.model, opts.apiKey);
  }

  /**
   * Executes the localization workflow:
   * - Reads ARB files and Flutter source files.
   * - Extracts new localization keys via the LLM.
   * - Updates ARB and Flutter files safely.
   * - Generates translations for other locales.
   */
  public async processFiles(): Promise<void> {
    const { arbsFolder, files } = this.opts;
    const backup = this.opts.backup ?? false;
    const packageName = this.opts.packageName;

    // Validate ARB folder existence
    const resolvedArbsFolder = path.resolve(arbsFolder);
    try {
      await fs.access(resolvedArbsFolder);
    } catch {
      throw new Error(`The folder ${resolvedArbsFolder} does not exist.`);
    }

    // Detect existing ARB files in the folder (format: app_<lang>.arb)
    const arbFiles = (await fs.readdir(resolvedArbsFolder))
      .filter((f) => f.startsWith("app_") && f.endsWith(".arb"))
      .map((f) => path.join(resolvedArbsFolder, f));

    const langs = arbFiles.map(
      (f) => path.basename(f).split("_")[1].split(".")[0]
    );
    console.debug(`[DEBUG] Detected languages: ${langs}`);

    // Validate that the first Flutter file exists
    const firstFlutterFile = path.resolve(files[0]);
    try {
      await fs.access(firstFlutterFile);
    } catch {
      throw new Error(`Flutter file not found: ${firstFlutterFile}`);
    }

    // Detect the source language by analyzing a Flutter file
    const langProof = await fs.readFile(firstFlutterFile, "utf8");
    console.info("[INFO] Language detection...");
    const langTagRaw = await this.llm.chooseFileLanguage(langProof, langs);
    const langTag = Array.from(langTagRaw)
      .filter((c) => /[a-zA-Z0-9_-]/.test(c))
      .join("");
    console.info(`[INFO] Language detected: ${langTag}`);

    // Prepare target ARB file for the detected language
    const targetArbPath = path.join(resolvedArbsFolder, `app_${langTag}.arb`);

    let fullArbLines: Record<string, any> = {};
    let arbContent = "{}";
    try {
      arbContent = await fs.readFile(targetArbPath, "utf8");
    } catch {
      console.warn(
        `[WARNING] Target ARB file not found, initialized to empty object: ${targetArbPath}`
      );
    }

    // Process each provided Flutter file
    for (const filePathStr of files) {
      const filePath = path.resolve(filePathStr);
      try {
        await fs.access(filePath);
      } catch {
        console.warn(`[WARNING] Flutter file not found: ${filePath}`);
        continue; // Skip missing files
      }

      console.info(`[INFO] File processing: ${filePath}`);
      const flutterContent = await fs.readFile(filePath, "utf8");

      // Query LLM to extract ARB keys and potentially updated Flutter content
      const finalResponse = await this.llm.processFiles(
        flutterContent,
        arbContent,
        langTag,
        packageName,
      );

      // Cleanup model output (strip tags)
      let striped = finalResponse
        .trim()
        .replace(/<JSON>/g, "")
        .replace(/<\/JSON>/g, "")
        .replace(/<\/dart>/g, "");

      // Split response into ARB content and Flutter code
      const parts = striped.split("<dart>");
      const arbLines = parts[0].trim();
      const updatedFlutter = (parts[1] || "").trim();

      console.debug(`[DEBUG] ARB lines created: ${arbLines.slice(0, 200)}`);

      // Merge ARB entries progressively
      const parsed = JSON.parse(arbLines || "{}");
      fullArbLines = { ...fullArbLines, ...parsed };

      // Safely update ARB file (merge with existing keys)
      const fullArbJson = JSON.stringify(fullArbLines, null, 2);
      let existing = "{}";
      try {
        existing = await fs.readFile(targetArbPath, "utf8");
      } catch {
        existing = "{}";
      }
      const newArbContent = mergeJsonStrings(existing, fullArbJson);
      await atomicWrite(targetArbPath, newArbContent, backup);

      // If the LLM returned updated Flutter content, overwrite the file
      if (updatedFlutter) {
        console.info(`[INFO] Flutter file update: ${filePath}`);
        await atomicWrite(filePath, updatedFlutter, backup);
      }
    }

    // Translate into other detected languages (except source)
    const otherArbFiles = arbFiles.filter((f) => f !== targetArbPath);
    console.info(
      `[INFO] Translation into other languages: ${otherArbFiles.map((f) =>
        path.basename(f)
      )}`
    );

    for (const arbFile of otherArbFiles) {
      const lang = path.basename(arbFile).split("_")[1].split(".")[0];
      console.info(`[INFO] Translation in progress for: ${lang}`);

      // Generate translations using the LLM
      const translated = await this.llm.amendArb(
        JSON.stringify(fullArbLines, null, 2),
        lang
      );

      let existing = "{}";
      try {
        existing = await fs.readFile(arbFile, "utf8");
      } catch {
        existing = "{}";
      }

      // Safely merge and write translation
      const newArbContent = mergeJsonStrings(existing, translated);
      await atomicWrite(arbFile, newArbContent, backup);
    }
  }

  /**
   * Processes a specific selected text snippet for localization.
   * This method replaces a single string with its L10n key and updates ARB files.
   * * @param selectedText The raw text selected in the editor (e.g., "Hello")
   * @returns The replacement string (e.g., AppLocalizations.of(context)!.hello)
   */
  public async processSelectedText(selectedText: string): Promise<string> {
    const { arbsFolder } = this.opts;

    // 0. Validation : Le texte doit être entouré de quotes (règle métier)
    // Fonction utilitaire à créer : vérifie si le texte est une String Dart valide
    if (!isValidFlutterString(selectedText)) {
      throw new Error("Invalid selection: Please select a quoted string (e.g., 'text' or \"text\").");
    }

    // Nettoyage des quotes pour l'envoi au LLM
    const cleanText = selectedText.replace(/^["']|["']$/g, "");

    // 1. Récupérer les langues disponibles depuis les fichiers .arb
    // Fonction utilitaire à créer : scanne le dossier et retourne ["fr", "en", "es"]
    const langs = await getAvailableLangs(arbsFolder);

    // 2. Détecter la langue du texte sélectionné
    const langResponse = await this.llm.detectTextLanguage(cleanText, langs);
    const sourceLang = langResponse.lang_tag;

    // 3. Lire le contenu du fichier ARB de la langue source
    const sourceArbPath = path.join(arbsFolder, `app_${sourceLang}.arb`);
    let sourceArbContent = "{}";
    try {
      sourceArbContent = await fs.readFile(sourceArbPath, "utf8");
    } catch (e) {
      console.warn(`Source ARB file ${sourceLang} not found, using empty object.`);
    }

    // 4. Rechercher la clé existante ou générer les traductions via LLM
    const l10nData = await this.llm.findOrTranslateKey(cleanText, sourceArbContent, langs);

    // 5. Si la clé n'existe pas déjà, mettre à jour tous les fichiers ARB
    if (!l10nData.found) {
      for (const lang of langs) {
        const translation = l10nData[lang];
        if (translation) {
          const arbPath = path.join(arbsFolder, `app_${lang}.arb`);
          // Fonction utilitaire à créer : fusionne et écrit de façon atomique
          await updateArbFiles(arbPath, l10nData.key, translation);
        }
      }
    }

    // 6. Retourner la chaîne de remplacement Flutter
    return `AppLocalizations.of(context)!.${l10nData.key}`;
  }
}
