FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package.json yarn.lock ./
RUN apt-get update

RUN npx playwright install
RUN yarn install --frozen-lockfile

COPY . .

EXPOSE 5173

COPY start.sh ./
RUN chmod +x start.sh

CMD ["./start.sh"]
