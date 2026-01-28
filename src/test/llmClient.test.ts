import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../core/llmClient';

describe('LLMClient Unit Tests', () => {
  const mockApiKey = 'sk-12345';
  
  beforeEach(() => {
    // Reset les mocks avant chaque test
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('Provider: Mistral', () => {
    it('should format the request correctly for Mistral', async () => {
      const client = new LLMClient('mistral', 'mistral-large-latest', mockApiKey);
      
      // Simulation d'une réponse valide de Mistral
      const mockResponse = {
        choices: [{ message: { content: '{"status": "ok"}' } }]
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.execute('sys prompt', 'user prompt');

      // Vérification de l'URL et des headers
      expect(fetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('JSON Sanitization & Error Handling', () => {
    it('should strip markdown code blocks if the LLM includes them', async () => {
      const client = new LLMClient('openai', 'gpt-4o', mockApiKey);
      
      // Simulation d'un LLM "bavard" qui met des balises ```json
      const mockResponse = {
        choices: [{ message: { content: '```json\n{"detected": "fr"}\n```' } }]
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.execute('sys', 'hum');
      expect(result).toEqual({ detected: 'fr' });
    });

    it('should throw an error if the API returns a 500', async () => {
      const client = new LLMClient('mistral', 'model', 'key');

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        text: async () => 'Quota exceeded',
      } as Response);

      await expect(client.execute('sys', 'hum')).rejects.toThrow(/LLM API Error/);
    });

    it('should throw an error if the LLM returns invalid JSON', async () => {
      const client = new LLMClient('mistral', 'model', 'key');
      
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Ceci n\'est pas du JSON' } }]
        }),
      } as Response);

      await expect(client.execute('sys', 'hum')).rejects.toThrow("Invalid JSON returned by LLM");
    });
  });

  describe('Provider: Google', () => {
    it('should use the API key in the URL for Google', async () => {
      const client = new LLMClient('google', 'gemini-pro', 'google-key');
      
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"res": "ok"}' }] } }]
        }),
      } as Response);

      await client.execute('sys', 'hum');

      // Vérifie que la clé est dans l'URL
      const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain('key=google-key');
    });
  });
});