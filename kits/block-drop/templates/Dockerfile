FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev && npm cache clean --force
COPY . .
ENV GAME_NAME="Block Drop"
EXPOSE 5000
CMD ["node", "server.js"]
