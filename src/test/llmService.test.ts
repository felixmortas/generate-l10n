import { describe, it, expect } from 'vitest';
import { LLMClient } from '../core/llmClient';
import { LLMService } from '../core/llmService';
import { readFile } from 'fs/promises';
import path from 'path';
import 'dotenv/config';

describe('LLM Service Integration Tests', () => {
  
  const providers = [
    { name: 'mistral', model: 'mistral-small-latest', key: process.env.MISTRAL_API_KEY },
    // { name: 'google', model: 'gemini-3-flash-preview', key: process.env.GOOGLE_API_KEY }, // Ajusté au modèle actuel
    // { name: 'openai', model: 'gpt-4o', key: process.env.OPENAI_API_KEY },
  ];

  // Chemins vers les fixtures (basé sur ton arborescence)
  const fixturesDir = path.join(__dirname, 'fixtures', 'lib');
  const flutterFile = path.join(fixturesDir, 'email_page.dart');
  const arbEnFile = path.join(fixturesDir, 'l10n', 'app_en.arb');

  providers.forEach(({ name, model, key }) => {
    
    describe(`Provider: ${name}`, () => {
      const itConditional = key ? it : it.skip;
      const llmClient = new LLMClient(name, model, key!);
      const llm = new LLMService(llmClient);

      // 1. Test detectTextLanguage
      itConditional('detectTextLanguage: should detect French', async () => {
        const result = await llm.detectTextLanguage("Salut, comment ça va ?", ["fr", "en"]);
        expect(result).toHaveProperty('lang_tag', 'fr');
      }, 15000);

      // 2. Test chooseFileLanguage (Lecture de fichier réel)
      itConditional('chooseFileLanguage: should identify email_page.dart language', async () => {
        const content = await readFile(flutterFile, 'utf8');
        const lang = await llm.chooseFileLanguage(content, ["en", "fr"]);
        expect(typeof lang).toBe('string');
        expect(["en", "fr"]).toContain(lang.toLowerCase());
      }, 15000);

      // 3. Test localizeFiles (Intégration Flutter + ARB)
      itConditional('localizeFiles: should process dart and arb files', async () => {
        const dartContent = await readFile(flutterFile, 'utf8');
        const arbContent = await readFile(arbEnFile, 'utf8');

        const result = await llm.localizeFiles(
          dartContent,
          arbContent,
          "en",
          "test_package"
        );

        expect(result).toBeTypeOf('object');
      }, 45000);

      // 4. Test amendArb (Traduction d'un fichier ARB complet)
      itConditional('amendArb: should translate ARB content to French', async () => {
        const arbContent = JSON.stringify({ "hello": "Hello" });
        const result = await llm.amendArb(arbContent, "fr");

        expect(result).toBeTypeOf('object');
        const keys = Object.keys(result);
        expect(keys.length).toBeGreaterThan(0);
      }, 20000);

      // 5. Test findOrTranslateKey
      itConditional('findOrTranslateKey: should find existing key or propose translation', async () => {
        const arbContent = await readFile(arbEnFile, 'utf8');
        const result = await llm.findOrTranslateKey(
          "Submit Your Email", 
          arbContent, 
          ["en", "fr"]
        );

        expect(result).toHaveProperty('found');
        expect(result).toHaveProperty('key');
        expect(result).toBeTypeOf('object');
      }, 20000);

    });
  });
});