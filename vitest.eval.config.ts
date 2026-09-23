import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * The prompt evals, which call real models and cost money. Kept out of the
 * default run so `npx vitest run` stays offline and under a second.
 *
 *   npx vitest run -c vitest.eval.config.ts
 */
export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    // .env.local is where OPENAI_API_KEY lives for `npm run dev`.
    env: loadEnv("", process.cwd(), ""),
    testTimeout: 180_000,
    maxConcurrency: 4,
  },
});
