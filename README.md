# foundryvttDocker
A docker container for foundryvtt servers


To create Image
1. Clone repository and enter the repository directory
2. docker build -t foundryvtt_server .
3. docker run --name foundry-vtt1 -dp 30000:30000 --mount type=bind,source=/srv/www/foundrydata,target=/app/data --restart unless-stopped foundryvtt_server

- If multiple servers the "--name" must be unique
- the "-p host_port:container_port" maps the host port to the container port which is 30000 in this image
- The mount command will take a host directory for the foundry data and map it to be used by the image. This option will let you know in advance the directory where data is stored so it can be backed up. Alternativly you can create a volume that is not bound and then use a root process to copy the contents of the docker volume (which is just a location on the host machine. Inspect the container to find it"
- The restart unless-stopped makes the server always restart if it shuts down, including after reboots


Keep in mind that if you are using multiple servers a virtual http server will be required like apache2. This will be used to receive http requests and map them to the correct applications port.
