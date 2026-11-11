# Builds the game page and the multiplayer server, then runs the server.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/server.mjs /app/dist/index.html ./dist/
EXPOSE 8080
CMD ["node", "dist/server.mjs"]
