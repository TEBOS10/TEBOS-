# TEBOS worker (acquisition + intelligence). Built from the tebos/ directory.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
USER node
CMD ["npx", "tsx", "src/main.ts"]
