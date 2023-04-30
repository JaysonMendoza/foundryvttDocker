#NOTE: This constainer will by default create a new foundrydata folder
# When executing docker you must
#1) Map the foundrydata file: -v HOST_FOUNDRYDATA_PATHcontainer-dest[:<options>
FROM node:18-alpine
WORKDIR /app/program
COPY . /app/program
RUN yarn install --production
RUN mkdir -p /app/data
##Setup foundry data mount from host. Internal container path is fixed
# RUN --mount=type=bind,source=${HOST_FOUNDRYDATA_PATH},target=./foundrydata,rw
ENTRYPOINT ["node", "resources/app/main.js","--dataPath=/app/data"]

#This is the listening port within the container that will be open for listening
EXPOSE 30000/tcp




