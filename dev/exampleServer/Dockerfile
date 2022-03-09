FROM node:16-alpine

WORKDIR /usr/src/app

COPY package.json .
COPY package-lock.json .
RUN npm ci

COPY ./exampleServer.js ./exampleServer.js

EXPOSE 7081

USER node

CMD ["node", "exampleServer.js"]