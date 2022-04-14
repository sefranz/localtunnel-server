FROM node:alpine

WORKDIR /app

COPY package.json /app/
COPY yarn.lock /app/

RUN yarn install --production && yarn cache clean

COPY . /app

ARG DOMAIN=localhost
ENV DOMAIN ${DOMAIN}

ENV NODE_ENV production
ENV DEBUG localtunnel*
ENV PORT 3000
ENV SECURE true

ENTRYPOINT [ "yarn", "start" ]
