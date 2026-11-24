FROM node:26-slim

WORKDIR /opt/yandex2mqtt

# Dependencies first: the layer is reused while package.json is unchanged
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

COPY . ./

VOLUME /opt/yandex2mqtt/data

ENV NODE_ENV=production
ENV PATH_CONFIG="data/config"
ENV PATH_DEVICES="data/config.devices"

CMD node app.js \
    --log info \
    --db data/db.json \
    --cfg ${PATH_CONFIG} \
    --devices ${PATH_DEVICES}
