#!/bin/bash

# Geez Bingo Platform Deployment Script
set -e

echo "🚀 Starting Geez Bingo Platform Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}✅ Environment variables loaded${NC}"
else
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Creating .env file from template..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️ Please edit .env file with your credentials${NC}"
    exit 1
fi

# Check required variables
required_vars=(
    "DOMAIN"
    "ADMIN_EMAIL"
    "TELEGRAM_BOT_TOKEN"
    "JWT_SECRET"
    "DB_PASSWORD"
    "REDIS_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ $var is not set in .env${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All required environment variables are set${NC}"

# Update system packages
echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker installed${NC}"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker Compose...${NC}"
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
fi

# Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p nginx/ssl
mkdir -p backend/uploads
mkdir -p backend/logs
mkdir -p telegram-bot/logs
mkdir -p monitoring/grafana/dashboards
mkdir -p monitoring/grafana/datasources

# Set proper permissions
echo -e "${YELLOW}🔐 Setting permissions...${NC}"
sudo chmod 755 -R backend/uploads
sudo chmod 755 -R backend/logs
sudo chmod 755 -R telegram-bot/logs

# Build and start services
echo -e "${YELLOW}🐳 Building Docker images...${NC}"
docker-compose build

echo -e "${YELLOW}🐳 Starting services...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 30

# Check service status
echo -e "${YELLOW}🔍 Checking service status...${NC}"
for service in postgres redis backend frontend telegram-bot nginx; do
    if docker-compose ps | grep -q "$service.*Up"; then
        echo -e "${GREEN}✅ $service is running${NC}"
    else
        echo -e "${RED}❌ $service is not running${NC}"
        docker-compose logs $service
    fi
done

# Setup SSL certificates
if [ ! -f "nginx/ssl/live/$DOMAIN/fullchain.pem" ]; then
    echo -e "${YELLOW}🔐 Setting up SSL certificates...${NC}"
    docker-compose run --rm certbot
    
    # Update nginx config with domain
    sed -i "s/yourdomain\.com/$DOMAIN/g" nginx/sites-available/geez-bingo.conf
    sed -i "s/www\.yourdomain\.com/www.$DOMAIN/g" nginx/sites-available/geez-bingo.conf
    
    # Reload nginx
    docker-compose exec nginx nginx -s reload
    echo -e "${GREEN}✅ SSL certificates configured${NC}"
fi

# Setup Telegram bot webhook
echo -e "${YELLOW}🤖 Setting up Telegram bot webhook...${NC}"
if [ -n "$WEBHOOK_URL" ]; then
    curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
        -H "Content-Type: application/json" \
        -d "{
            \"url\": \"${WEBHOOK_URL}/webhook/${TELEGRAM_BOT_TOKEN}\",
            \"secret_token\": \"${WEBHOOK_SECRET}\",
            \"allowed_updates\": [\"message\", \"callback_query\"],
            \"drop_pending_updates\": true
        }"
    echo -e "${GREEN}✅ Telegram webhook set${NC}"
else
    echo -e "${YELLOW}⚠️ WEBHOOK_URL not set, using polling mode${NC}"
fi

# Setup bot commands
echo -e "${YELLOW}🤖 Setting up bot commands...${NC}"
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands" \
    -H "Content-Type: application/json" \
    -d '{
        "commands": [
            {"command": "start", "description": "Start the bot 🚀"},
            {"command": "play", "description": "Join current game 🎮"},
            {"command": "balance", "description": "Check balance 💰"},
            {"command": "deposit", "description": "Deposit funds 💳"},
            {"command": "withdraw", "description": "Withdraw funds 🏧"},
            {"command": "cards", "description": "View your cards 🃏"},
            {"command": "stats", "description": "Your statistics 📊"},
            {"command": "invite", "description": "Invite friends 👥"},
            {"command": "help", "description": "How to play ❓"},
            {"command": "menu", "description": "Show main menu 📱"}
        ]
    }'

echo -e "${GREEN}✅ Bot commands set${NC}"

# Create admin user
echo -e "${YELLOW}👑 Creating admin user...${NC}"
ADMIN_PASSWORD=$(openssl rand -base64 12)
docker-compose exec backend node src/scripts/create-admin.js \
    --email "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD"

echo -e "${GREEN}✅ Admin user created${NC}"
echo -e "${YELLOW}📧 Admin Email: $ADMIN_EMAIL${NC}"
echo -e "${YELLOW}🔑 Admin Password: $ADMIN_PASSWORD${NC}"

# Print deployment summary
echo -e "\n${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "\n${YELLOW}📊 Deployment Summary:${NC}"
echo -e "${GREEN}🌐 Website:${NC} https://$DOMAIN"
echo -e "${GREEN}🔗 API:${NC} https://$DOMAIN/api"
echo -e "${GREEN}🤖 Telegram Bot:${NC} https://t.me/$TELEGRAM_BOT_USERNAME"
echo -e "${GREEN}📊 Grafana Dashboard:${NC} https://$DOMAIN:3001"
echo -e "${GREEN}🗄️ Adminer (Database):${NC} https://$DOMAIN:8080"
echo -e "${GREEN}📈 Prometheus:${NC} https://$DOMAIN:9090"
echo -e "\n${YELLOW}📝 Next Steps:${NC}"
echo "1. Configure your domain DNS to point to this server"
echo "2. Set up SSL renewal cron job"
echo "3. Configure monitoring alerts"
echo "4. Set up backup strategy"
echo "\n${YELLOW}🚨 Important Security Notes:${NC}"
echo "• Change the admin password immediately"
echo "• Keep your .env file secure"
echo "• Enable firewall (ufw allow 80,443,22)"
echo "• Set up automatic backups"
echo "\n${GREEN}✅ Deployment completed successfully!${NC}"
