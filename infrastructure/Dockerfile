# Single-service image: the Node app serves the API and the static
# frontend together — no separate nginx container needed on Northflank
# (it terminates TLS and routes traffic for you).

FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY frontend ./frontend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { if (r.statusCode !== 200) process.exit(1) })"

WORKDIR /app/backend
CMD ["node", "src/server.js"]
