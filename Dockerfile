# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY proto ./proto

ENV PORT=50051
EXPOSE 50051

CMD ["node", "server.js"]
