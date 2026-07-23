FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json ./
RUN npm install --include=dev --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN node -e "const fs=require('fs'); const p='src/server/documents/document-repository-service.ts'; const s=fs.readFileSync(p,'utf8'); console.log('DOCUMENT_REPOSITORY_SOURCE_CHECK'); console.log(s.split('\n').slice(68,86).join('\n')); if (s.includes('blobId = existingBlob.rows[0].blob_id')) { throw new Error('STALE_DOCUMENT_REPOSITORY_SOURCE'); }"
RUN rm -rf .next && npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
