FROM node:18-alpine

RUN npm install -g cnpmjs.org sqlite3

RUN mkdir -p /root/.cnpmjs.org

WORKDIR /root/.cnpmjs.org

COPY config.json /root/.cnpmjs.org/config.json

EXPOSE 7001 7002

CMD ["cnpmjs.org", "start"]
