/**
 * LLM Wrapper
 *
 * Provides a unified abstraction for interacting with different LLM providers
 * using direct REST API calls via fetch():
 * - Mistral (https://api.mistral.ai)
 * - OpenAI (https://api.openai.com)
 * - Google Generative AI (https://generativelanguage.googleapis.com)
 *
 * Responsibilities:
 * - Direct HTTP communication with LLM providers.
 * - Forcing JSON output format via provider-specific API parameters.
 * - Loading prompt templates from disk.
 * - Parsing structured JSON responses without fragile string delimiters.
 */

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export class LLM {
  provider: string;
  model: string;
  apiKey: string;

  constructor(provider: string, model: string, apiKey: string) {
    this.provider = provider;
    this.model = model;
    this.apiKey = apiKey;
  }

  /**
   * Internal helper to make POST requests to different providers.
   * Centralizes headers and JSON configuration.
   */
  private async _post(messages: { role: string; content: string }[]): Promise<any> {
    let url = '';
    let body: any = {};
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (this.provider) {
      case 'openai':
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        body = {
          model: this.model,
          messages,
          response_format: { type: "json_object" }, // Forces JSON mode
          temperature: 0,
        };
        break;

      case 'mistral':
        url = 'https://api.mistral.ai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        body = {
          model: this.model,
          messages,
          response_format: { type: "json_object" }, // Forces JSON mode
          temperature: 0,
        };
        break;

      case 'google':
        // Google uses API key in the URL
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        body = {
          contents: messages.map(m => ({
            role: m.role === 'system' ? 'user' : m.role, // Gemini handles system prompts differently or as user roles in simple API
            parts: [{ text: m.content }]
          })),
          generationConfig: {
            response_mime_type: "application/json", // Forces JSON mode
            temperature: 0,
          }
        };
        break;

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`LLM API Error (${this.provider}): ${response.statusText} - ${errorData}`);
    }

    return response.json();
  }

  /**
   * Generic invocation that forces JSON parsing.
   * Note: The system prompt should explicitly ask for a JSON schema.
   */
  private async _invoke(sysPrompt: string, humPrompt: string): Promise<any> {
    const messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: humPrompt },
    ];

    const rawData = await this._post(messages);
    const content = this._extractContent(rawData);

    const cleaned = this._sanitizeJsonString(content);

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("[ERROR] Failed to parse LLM response as JSON. Raw content:", content);
      throw new Error("Invalid JSON returned by LLM");
    }
  }

  /**
   * Extracts the string content from the various API response structures.
   */
  private _extractContent(data: any): string {
    if (this.provider === 'google') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    // OpenAI and Mistral share the same format
    return data.choices?.[0]?.message?.content || '';
  }

  private _sanitizeJsonString(raw: string): string {
    return raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
  }

  private async _loadPrompt(name: string): Promise<[string, string]> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const promptsDir = path.join(__dirname, 'prompts');

    try {
      const [sysPrompt, humPrompt] = await Promise.all([
        readFile(path.join(promptsDir, `${name}.sys`), 'utf8'),
        readFile(path.join(promptsDir, `${name}.hum`), 'utf8'),
      ]);
      return [sysPrompt, humPrompt];
    } catch {
      throw new Error(`Missing prompt files for ${name}`);
    }
  }

  
  /** PUBLIC METHODS */

  /**
   * Produces a translated ARB file for a target language.
   */
  async amendArb(inputJson: string, langTag: string): Promise<Record<string, string>> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('amendArb');
    const humPrompt = humTemplate
      .replace('{lang_tag}', langTag)
      .replace('{input}', inputJson);

    return await this._invoke(sysPrompt, humPrompt);
  }

  /**
   * Determines the language tag of a Flutter file.
   */
  async chooseFileLanguage(doc: string, langs: string[]): Promise<string> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('chooseFileLanguage');
    const humPrompt = humTemplate
      .replace('{doc}', doc)
      .replace('{langs}', langs.join(', '));

    // Expecting JSON: { "language": "en" }
    const result = await this._invoke(sysPrompt, humPrompt);
    console.info(`[DEBUG] chooseFileLanguage result: ${JSON.stringify(result)}`);
    console.info(`[DEBUG] results type: ${typeof result}, keys: ${Object.keys(result).join(', ')}`);
    console.info(`[DEBUG] detected language: ${result.lang_tag}`);
    return result.lang_tag;
  }

  /**
   * Detects the language of a selected text.
   */
  public async detectTextLanguage(text: string, langs: string[]): Promise<{ lang_tag: string }> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('detectTextLanguage');
    const humPrompt = humTemplate
      .replace('{text}', text)
      .replace('{langs}', langs.join(', '));

    return await this._invoke(sysPrompt, humPrompt);
  }

  /**
   * Check if text exists or needs translation.
   */
  public async findOrTranslateKey(
    text: string, 
    sourceArbContent: string, 
    langs: string[]
  ): Promise<{ found: boolean; key: string; [lang: string]: any }> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('findOrTranslateKey');
    const humPrompt = humTemplate
      .replace('{text}', text)
      .replace('{source_arb}', sourceArbContent)
      .replace('{langs}', langs.join(', '));

    return await this._invoke(sysPrompt, humPrompt);
  }

  /**
   * Processes a Flutter file and ARB file together.
   */
  async localizeFiles(flutterFile: string, arbFile: string, lang: string, packageName: string): Promise<any> {
    const [sysPrompt, humTemplate] = await this._loadPrompt('localizeFiles');
    const humPrompt = humTemplate
      .replace('{arb_file}', arbFile)
      .replace('{flutter_file}', flutterFile)
      .replace('{lang}', lang)
      .replace('{package_name}', packageName);

    // This returns the full JSON object directly
    return await this._invoke(sysPrompt, humPrompt);
  }
}