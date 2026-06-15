# Orakon Trip API image. Runs the Fastify + Socket.io server via tsx.
FROM node:22-alpine

WORKDIR /app

# Install only the workspaces the API needs (skip the SvelteKit dashboard).
COPY package.json package-lock.json* ./
COPY agents/package.json ./agents/
COPY api/package.json ./api/
RUN npm install --include-workspace-root --workspace @orakon/agents --workspace @orakon/api

# Copy source for the API + shared agent core.
COPY tsconfig.base.json ./
COPY agents ./agents
COPY api ./api

ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000

CMD ["npm", "run", "start", "--workspace", "@orakon/api"]
