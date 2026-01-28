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

import path from "path";
import { LLMService } from "./llmService.js";
import { atomicWrite, mergeJsonStrings, isValidFlutterString, getAvailableLangs, updateArbFiles, updateAllArbFiles, readFileContent } from "./utils.js";
import { ExtensionConfiguration } from "./configurationManager.js";

export interface L10nProcessorOptions extends ExtensionConfiguration {
  files: string[];
}

export class L10nProcessor {
  private llm: LLMService;
  private opts: L10nProcessorOptions;

  constructor(opts: L10nProcessorOptions, llm: LLMService) {
    this.opts = opts;
    this.llm = llm;
  }

  /**
   * Executes the localization workflow:
   * - Reads ARB files and Flutter source files.
   * - Extracts new localization keys via the LLM.
   * - Updates ARB and Flutter files safely.
   * - Generates translations for other locales.
   */
  public async localizeFiles(): Promise<void> {
    // Destructuring clean configuration values
    const { arbsFolder, files, backup, packageName } = this.opts;

    // Get all ARB languages available
    const langs = await getAvailableLangs(arbsFolder);
    console.debug(`[DEBUG] Detected languages in ${arbsFolder}: ${langs}`);

    // Detect the source language by analyzing a Flutter file
    const firstFileContent = await readFileContent(files[0]);
    console.info("[INFO] First Flutter file language detection...");
    const detectedLangTag = await this.llm.chooseFileLanguage(firstFileContent, langs);
    console.info(`[INFO] Language detected: ${detectedLangTag}`);

    // Prepare target ARB file for the detected language
    const targetArbPath = path.join(arbsFolder, `app_${detectedLangTag}.arb`);

    let fullArbLines: Record<string, any> = {};

    // Process each provided Flutter file
    for (const filePath of files) {
      console.info(`[INFO] File processing: ${filePath}`);
      const flutterContent = await readFileContent(filePath);

      let arbContent = "{}";
      arbContent = await readFileContent(targetArbPath);

      // Query LLM to extract ARB keys and potentially updated Flutter content
      const finalResponse = await this.llm.localizeFiles(
        flutterContent,
        arbContent,
        detectedLangTag,
        packageName,
      );

      // Merge ARB entries progressively
      const parsedArb = finalResponse.new_arb_keys || {};
      console.debug(`[DEBUG] ARB lines created: ${JSON.stringify(parsedArb).slice(0, 200)}`);

      fullArbLines = { ...fullArbLines, ...parsedArb };

      // Safely update ARB file (merge with existing keys)
      const fullArbJson = JSON.stringify(fullArbLines, null, 2);

      const newArbContent = mergeJsonStrings(arbContent, fullArbJson);
      await atomicWrite(targetArbPath, newArbContent, backup);

      // If the LLM returned updated Flutter content, overwrite the file
      const updatedFlutter = finalResponse.modified_dart_code;

      if (updatedFlutter) {
        console.info(`[INFO] Flutter file update: ${filePath}`);
        await atomicWrite(filePath, updatedFlutter, backup);
      }
    }

    // Translate into other detected languages (except source)
    const otherLangs = langs
      .filter((lang) => lang !== detectedLangTag);
    console.info(
      `[INFO] Translation into other languages: ${otherLangs}`,
    );

    for (const lang of otherLangs) {
      console.info(`[INFO] Translation in progress for: ${lang}`);

      // Generate translations using the LLM
      const translated = await this.llm.amendArb(
        JSON.stringify(fullArbLines, null, 2),
        lang
      );

      const arbFile = path.join(arbsFolder, `app_${lang}.arb`);
      const arbContent = await readFileContent(arbFile);
      
      // Safely merge and write translation
      const newArbContent = mergeJsonStrings(arbContent, JSON.stringify(translated));
      await atomicWrite(arbFile, newArbContent, backup);
    }
  }

  /**
   * Processes a specific selected text snippet for localization.
   * This method replaces a single string with its L10n key and updates ARB files.
   * * @param selectedText The raw text selected in the editor (e.g., "Hello")
   * @returns The replacement string (e.g., AppLocalizations.of(context)!.hello)
   */
  public async localizeSelectedText(selectedText: string): Promise<string> {
    const { arbsFolder } = this.opts;

    // 0. Validation : The text must be enclosed in quotation marks (business rule).
    if (!isValidFlutterString(selectedText)) {
      throw new Error("Invalid selection: Please select a quoted string (e.g., 'text' or \"text\").");
    }

    // Clean quotes for sending to LLM
    const cleanText = selectedText.replace(/^["']|["']$/g, "");

    // 1. Retrieve available languages from .arb files
    const langs = await getAvailableLangs(arbsFolder);

    // 2. DDetect the language of the selected text
    const langResponse = await this.llm.detectTextLanguage(cleanText, langs);
    const sourceLang = langResponse.lang_tag;

    // 3. Read the content of the source language ARB file
    const sourceArbPath = path.join(arbsFolder, `app_${sourceLang}.arb`);
    const sourceArbContent = await readFileContent(sourceArbPath);

    // 4. Search for existing key or generate translations via LLM
    const l10nData = await this.llm.findOrTranslateKey(cleanText, sourceArbContent, langs);

    // 5. If the key does not already exist, update all ARB files.
    if (!l10nData.found) {
      for (const lang of langs) {
        const translation = l10nData[lang];
        if (translation) {
          const arbPath = path.join(arbsFolder, `app_${lang}.arb`);
          await updateArbFiles(arbPath, l10nData.key, translation);
        }
      }
    }

    // 6. Return the Flutter replacement string
    return `AppLocalizations.of(context)!.${l10nData.key}`;
  }
}
