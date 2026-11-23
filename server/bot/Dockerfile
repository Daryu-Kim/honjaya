FROM node:22-alpine

WORKDIR /app

# pg_dump 는 백업(P12B)에 필요합니다. alpine 저장소에 따라 패키지명이 달라서 폴백을 둡니다.
RUN apk add --no-cache postgresql-client \
  || apk add --no-cache postgresql17-client \
  || apk add --no-cache postgresql16-client

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV BOT_PORT=4100
ENV TZ=Asia/Seoul

# 외부에 포트를 열지 않습니다. 같은 compose 네트워크의 api 컨테이너만 접근합니다.
EXPOSE 4100

CMD ["node", "src/index.js"]
