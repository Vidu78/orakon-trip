import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';
import { attachSyncChannel, createStore, SessionManager } from '../../agents/src/index';
import { registerRoutes } from './routes';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  await app.register(cors, { origin: true });

  const store = await createStore();
  app.decorate('store', store);

  // Socket.io shares the underlying HTTP server. `app.server` exists as soon as
  // Fastify is instantiated, so we can attach before listen() (and before
  // routes, which broadcast through `io`).
  const io = new IOServer(app.server, { cors: { origin: '*' } });
  app.decorate('io', io);
  attachSyncChannel(io, store, new SessionManager());

  await app.register(registerRoutes);

  app.get('/health', async () => {
    const provider = process.env.GROQ_API_KEY
      ? 'groq'
      : process.env.ANTHROPIC_API_KEY
        ? 'anthropic'
        : 'fallback';
    const model =
      provider === 'groq'
        ? (process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile')
        : provider === 'anthropic'
          ? (process.env.INTENT_MODEL ?? 'claude-haiku-4-5-20251001')
          : null;
    return { ok: true, store: store.kind, intent: { provider, model } };
  });

  app.addHook('onClose', async () => {
    io.close();
    await store.close();
  });

  return app;
}
