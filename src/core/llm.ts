/**
 * LLM Wrapper
 *
 * Provides a unified abstraction for interacting with different LLM providers:
 * - Mistral (@langchain/mistralai)
 * - OpenAI (@langchain/openai)
 * - Google Generative AI (@langchain/google-genai)
 *
 * Responsibilities:
 * - Initializes the chosen provider/model.
 * - Loads prompt templates from disk (`prompts/` folder).
 * - Invokes the LLM with system + human messages.
 * - Extracts and returns structured outputs (marked by `REPONSE FINALE :`).
 */

import 'dotenv/config'; // Load environment variables from .env into process.env
import { readFile } from 'fs/promises'; // Async file reads
import path from 'path';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { fileURLToPath } from 'url';

export class LLM {
  /** Which provider to use: "mistral", "openai", "google". */
  provider: string;

  /** Model name to use (depends on provider). */
  model: string;

  /** Underlying LangChain chat model instance. */
  llm: any;

  /** API key to use (depends on provider). */
  apiKey: string;


  /**
   * Constructs a new LLM instance.
   * @param provider - LLM backend (mistral, openai, google).
   * @param model - Model name or ID.
   */
  constructor(provider: string, model: string, apiKey: string) {
    this.provider = provider;
    this.model = model;
    this.apiKey = apiKey;
    this.llm = this._initLLM();
  }

  /**
   * Internal: Initializes the correct LangChain wrapper
   * depending on the provider.
   */
  private _initLLM() {
    console.debug(`[DEBUG] ${this.provider} LLM initialization with model ${this.model}`);

    if (this.provider === 'mistral') {
      // Requires MISTRAL_API_KEY in environment
      return new ChatMistralAI({ apiKey: this.apiKey, model: this.model, temperature: 0, maxRetries: 5 });
    } else if (this.provider === 'openai') {
      // Requires OPENAI_API_KEY in environment
      return new ChatOpenAI({ apiKey: this.apiKey, model: this.model, temperature: 0 });
    } else if (this.provider === 'google') {
      // Requires GOOGLE_API_KEY in environment
      return new ChatGoogleGenerativeAI({ apiKey: this.apiKey, model: this.model, temperature: 0 });
    } else {
      throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  /**
   * Loads a system + human prompt pair from the `prompts/` folder.
   * @param name - Base name of the prompt files.
   *   - Loads `{name}.sys` (system message).
   *   - Loads `{name}.hum` (human message).
   */
  private async _loadPrompt(name: string): Promise<[string, string]> {
    // Résolution du chemin absolu vers prompts dans dist
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const promptsDir = path.join(__dirname, 'prompts');

    const sysPath = path.join(promptsDir, `${name}.sys`);
    const humPath = path.join(promptsDir, `${name}.hum`);

    try {
      const [sysPrompt, humPrompt] = await Promise.all([
        readFile(sysPath, { encoding: 'utf8' }),
        readFile(humPath, { encoding: 'utf8' }),
      ]);
      return [sysPrompt, humPrompt];
    } catch {
      throw new Error(`Missing prompt ${name}: ${sysPath} or ${humPath}`);
    }
  }


  /**
   * Sends system + human prompts to the LLM and returns the response.
   */
  private async _invoke(sysPrompt: string, humPrompt: string): Promise<string> {
    console.debug('[DEBUG] Calling LLM...');
    const messages = [
      new SystemMessage({ content: sysPrompt }),
      new HumanMessage({ content: humPrompt }),
    ];

    const response = await this.llm.invoke(messages);
    return (response?.content ?? '').trim();
  }

  /**
   * Determines the language tag of a Flutter file.
   * @param doc - Flutter source code.
   * @param langs - Candidate languages detected from ARB files.
   * @returns Chosen language tag.
   */
  async chooseLanguage(doc: string, langs: string[]): Promise<string> {
    const [sysPromptTemplate, humPromptTemplate] = await this._loadPrompt('chooseLanguage');
    const sysPrompt = sysPromptTemplate.replace('{langs}', langs.join(', '));
    const humPrompt = humPromptTemplate.replace('{doc}', doc);

    const response = await this._invoke(sysPrompt, humPrompt);

    const parts = response.split('REPONSE FINALE :');
    if (parts.length < 2) throw new Error(`LLM response not valid: ${response}`);

    return parts[1].trim();
  }

  /**
   * Processes a Flutter file and ARB file together.
   * Extracts localization keys and potentially updates the Flutter code.
   * @param flutterFile - Flutter source code as string.
   * @param arbFile - Current ARB JSON content.
   * @param lang - Source language tag.
   * @returns String containing JSON (keys) + updated Flutter code.
   */
  async process(flutterFile: string, arbFile: string, lang: string, packageName: string): Promise<string> {
    const [sysPromptTemplate, humPromptTemplate] = await this._loadPrompt('process');
    const humPrompt = humPromptTemplate
      .replace('{arb_file}', arbFile)
      .replace('{flutter_file}', flutterFile)
      .replace('{lang}', lang)
      .replace('{package_name}', packageName);

    const response = await this._invoke(sysPromptTemplate, humPrompt);

    const parts = response.split('REPONSE FINALE :');
    if (parts.length < 2) throw new Error(`Response shape not valid: ${response}`);
    return parts[1].trim();
  }

  /**
   * Produces a translated ARB file for a target language.
   * @param inputJson - JSON string with source keys.
   * @param langTag - Target language code.
   * @returns Translated JSON string.
   */
  async amendArb(inputJson: string, langTag: string): Promise<string> {
    const [sysPromptTemplate, humPromptTemplate] = await this._loadPrompt('amendArb');
    const humPrompt = humPromptTemplate
      .replace('{lang_tag}', langTag)
      .replace('{input}', inputJson);

    const response = await this._invoke(sysPromptTemplate, humPrompt);

    const parts = response.split('REPONSE FINALE :');
    if (parts.length < 2) throw new Error(`LLM response not valid: ${response}`);
    return parts.slice(-1)[0].trim();
  }
}
