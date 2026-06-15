import 'fastify';
import type { Server as IOServer } from 'socket.io';
import type { TripStore } from '../../agents/src/store';

declare module 'fastify' {
  interface FastifyInstance {
    io: IOServer;
    store: TripStore;
  }
}
