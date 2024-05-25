#NOTE: This constainer will by default create a new foundrydata folder
# When executing docker you must
#1) Map the foundrydata file: -v HOST_FOUNDRYDATA_PATHcontainer-dest[:<options>
FROM node:18-slim
LABEL ca.jkmconsulting.foundryvttdocker.authors="jayson.mendoza@jkmconsulting.ca"
LABEL ca.jkmconsulting.foundryvttdocker.version="1.0.0"
LABEL ca.jkmconsulting.foundryvttdocker.foundryvtt.version="11.315"
ENV FOUNDRY_ROOT=/app

VOLUME $FOUNDRY_ROOT/program $FOUNDRY_ROOT/data
ADD data/ $FOUNDRY_ROOT/program
RUN mkdir -p $FOUNDRY_ROOT/data
##Setup foundry data mount from host. Internal container path is fixed
# RUN --mount=type=bind,source=${HOST_FOUNDRYDATA_PATH},target=./foundrydata,rw
ENTRYPOINT node $FOUNDRY_ROOT/program/resources/app/main.js --dataPath=$FOUNDRY_ROOT/data

#This is the listening port within the container that will be open for listening
EXPOSE 30000/tcp




