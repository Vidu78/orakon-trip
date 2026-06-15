import { buildServer } from './server';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = await buildServer();

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Orakon Trip API on http://${HOST}:${PORT} (store: ${app.store.kind})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
