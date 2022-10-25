FROM node:16-alpine

WORKDIR /usr/src/app

COPY ./exampleServer.js ./exampleServer.js
COPY ./package.json ./package.json

RUN npm install

EXPOSE 7081

USER node

CMD ["node", "exampleServer.js"]