import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { LLMClient } from './llmClient.js';

export class LLMService {
  private client: LLMClient;

  constructor(client: LLMClient) {
    this.client = client;
  }

  /**
   * Charge les fichiers .sys et .hum depuis le dossier prompts
   */
  private async _loadPrompt(name: string): Promise<[string, string]> {
    // Note: Ajuste le chemin selon l'emplacement final du build de ton extension
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const promptsDir = path.join(__dirname, 'prompts');

    try {
      const [sysPrompt, humPrompt] = await Promise.all([
        readFile(path.join(promptsDir, `${name}.sys`), 'utf8'),
        readFile(path.join(promptsDir, `${name}.hum`), 'utf8'),
      ]);
      return [sysPrompt, humPrompt];
    } catch (error) {
      throw new Error(`[LLMService] Missing prompt files for ${name}`);
    }
  }

  /**
   * LOGIQUE MÉTIER
   */

  async amendArb(inputJson: string, langTag: string): Promise<Record<string, string>> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('amendArb');
    const humPrompt = humTemplate
      .replace('{lang_tag}', langTag)
      .replace('{input}', inputJson);

    return await this.client.execute(sysPrompt, humPrompt);
  }

  async chooseFileLanguage(doc: string, langs: string[]): Promise<string> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('chooseFileLanguage');
    const humPrompt = humTemplate
      .replace('{doc}', doc)
      .replace('{langs}', langs.join(', '));

    const result = await this.client.execute(sysPrompt, humPrompt);
    return result.lang_tag;
  }

  async detectTextLanguage(text: string, langs: string[]): Promise<{ lang_tag: string }> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('detectTextLanguage');
    const humPrompt = humTemplate
      .replace('{text}', text)
      .replace('{langs}', langs.join(', '));

    return await this.client.execute(sysPrompt, humPrompt);
  }

  async findOrTranslateKey(
    text: string, 
    sourceArbContent: string, 
    langs: string[]
  ): Promise<{ found: boolean; key: string; [lang: string]: any }> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('findOrTranslateKey');
    const humPrompt = humTemplate
      .replace('{text}', text)
      .replace('{source_arb}', sourceArbContent)
      .replace('{langs}', langs.join(', '));

    return await this.client.execute(sysPrompt, humPrompt);
  }

  async localizeFiles(flutterFile: string, arbFile: string, lang: string, packageName: string): Promise<any> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('localizeFiles');
    const humPrompt = humTemplate
      .replace('{arb_file}', arbFile)
      .replace('{flutter_file}', flutterFile)
      .replace('{lang}', lang)
      .replace('{package_name}', packageName);

    return await this.client.execute(sysPrompt, humPrompt);
  }
}