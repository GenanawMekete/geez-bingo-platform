FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set permissions
RUN chown -R node:node /app

USER node

CMD ["node", "src/bot.js"]
