import { registerAs } from '@nestjs/config';

/**
 * AI service (jobfits-ai-service) client config.
 *
 * The backend never talks to Ollama directly — it only calls the FastAPI AI
 * service over HTTP. `serviceUrl` is the versioned base (includes `/api/v1`);
 * the client appends `/health`, `/resume/parse`, etc. to it.
 *
 * Timeouts split by workload: generation/parsing is slow (LLM), embedding and
 * health are fast. See JobFits_AI_Integration_Plan.md §3.6 / §6.
 */
export default registerAs('ai', () => ({
  serviceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000/api/v1',
  serviceKey: process.env.AI_SERVICE_KEY ?? '',
  timeoutMsGenerate: parseInt(process.env.AI_TIMEOUT_MS_GENERATE ?? '60000', 10),
  timeoutMsEmbed: parseInt(process.env.AI_TIMEOUT_MS_EMBED ?? '10000', 10),
}));
