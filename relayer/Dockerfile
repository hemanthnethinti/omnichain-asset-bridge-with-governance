FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY hardhat.config.js ./
COPY contracts ./contracts
COPY scripts ./scripts
COPY relayer ./relayer
COPY .env.example ./

RUN npx hardhat compile

ENV NODE_ENV=production
CMD ["node", "relayer/src/index.js"]
