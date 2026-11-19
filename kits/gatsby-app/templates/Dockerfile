FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx gatsby build --verbose 2>&1 || (echo "BUILD FAILED" && exit 1)
EXPOSE 3000
CMD ["npx", "gatsby", "serve", "-H", "0.0.0.0", "-p", "3000"]
