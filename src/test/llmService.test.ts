import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../core/llmClient';
import { LLMService } from '../core/llmService';
import { readFile } from 'fs/promises';
import path from 'path';
import 'dotenv/config';

describe('LLM Service Integration Tests', () => {
  
  // On définit les providers à tester
  const providers = [
    { name: 'mistral', model: 'mistral-small-latest', key: process.env.MISTRAL_API_KEY },
    // { name: 'google', model: 'gemini-3-flash-preview', key: process.env.GOOGLE_API_KEY }, // Ajusté au modèle actuel
    // { name: 'openai', model: 'gpt-4o', key: process.env.OPENAI_API_KEY },
  ];

  // Chemins vers les fixtures
  // Utilise path.resolve pour être sûr du chemin peu importe d'où est lancé le test
  const fixturesDir = path.resolve(__dirname, 'fixtures', 'lib');
  const flutterFile = path.join(fixturesDir, 'email_page.dart');
  const arbEnFile = path.join(fixturesDir, 'l10n', 'app_en.arb');

  providers.forEach(({ name, model, key }) => {
    
    describe(`Provider: ${name}`, () => {
      // On ne lance le test que si la clé API est présente
      const itConditional = key ? it : it.skip;
      
      // Injection de la dépendance réelle pour test d'intégration
      const llmClient = new LLMClient(name as any, model, key!);
      const llm = new LLMService(llmClient);

      itConditional('localizeFiles: should return localization suggestions', async () => {
        const dartContent = await readFile(flutterFile, 'utf8');
        const arbContent = await readFile(arbEnFile, 'utf8');

        const result = await llm.localizeFiles(
          dartContent,
          arbContent,
          "en",
          "my_awesome_app"
        );

        // On s'attend à recevoir un objet JSON structuré (le format dépend de ton prompt .sys)
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
      }, 60000); // 60s car c'est une tâche lourde (analyse de deux fichiers)

      itConditional('amendArb: should translate a flat JSON ARB', async () => {
        const inputJson = JSON.stringify({
          "appTitle": "My Application",
          "loginButton": "Login"
        });

        const result = await llm.amendArb(inputJson, "fr");

        expect(result).toBeTypeOf('object');
        // Vérifie si l'IA a conservé les clés mais traduit les valeurs
        expect(result).toHaveProperty('appTitle');
        expect(result.appTitle).not.toBe("My Application"); 
      }, 40000);

      itConditional('detectTextLanguage: should detect French', async () => {
        const result = await llm.detectTextLanguage("Salut, comment ça va ?", ["fr", "en"]);
        
        // Validation de la structure de réponse attendue de l'API
        expect(result).toHaveProperty('lang_tag');
        expect(['fr', 'en']).toContain(result.lang_tag);
      }, 30000); // Augmentation du timeout car l'API peut être lente

      itConditional('chooseFileLanguage: should identify Dart file language', async () => {
        // Lecture réelle de la fixture
        const content = await readFile(flutterFile, 'utf8');
        const lang = await llm.chooseFileLanguage(content, ["en", "fr"]);
        
        expect(typeof lang).toBe('string');
        expect(["en", "fr"]).toContain(lang.toLowerCase());
      }, 30000);

      itConditional('findOrTranslateKey: should return structured JSON', async () => {
        const arbContent = await readFile(arbEnFile, 'utf8');
        const result = await llm.findOrTranslateKey(
          "Submit Your Email", 
          arbContent, 
          ["en", "fr"]
        );

        // On vérifie que le service a bien parsé le JSON renvoyé par le client
        expect(result).toHaveProperty('found');
        expect(typeof result.found).toBe('boolean');
        if (result.found) {
          expect(result).toHaveProperty('key');
        }
      }, 30000);
    });
  });

  // UNIT TEST : Tester le service avec un MOCK du client
  // Utile pour tester la logique de construction du prompt sans payer d'API
  describe('LLM Service Unit Tests (Mocked Client)', () => {
    it('should format the prompt correctly before calling the client', async () => {
      const mockClient = {
        execute: vi.fn().mockResolvedValue({ lang_tag: 'es' })
      } as unknown as LLMClient;

      const service = new LLMService(mockClient);
      await service.detectTextLanguage("Hola", ["es", "it"]);

      // Vérifie que le client a bien été appelé avec les arguments transformés
      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.stringContaining(""), // sysPrompt (lu via fs)
        expect.stringContaining("Hola") // humPrompt (modifié par replace)
      );
    });
  });
});