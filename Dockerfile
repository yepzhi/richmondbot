FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

COPY package*.json ./

RUN npm install

# Install Playwright browsers (optional if base image has them, but ensures matching version)
# RUN npx playwright install chromium

COPY . .

EXPOSE 7860

CMD ["node", "server.js"]
