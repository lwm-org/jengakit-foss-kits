FROM node:20-slim
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
