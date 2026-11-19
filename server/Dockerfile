FROM node:22-alpine

WORKDIR /app

# 의존성만 먼저 복사해 레이어 캐시를 활용합니다.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY sql ./sql

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "src/index.js"]
