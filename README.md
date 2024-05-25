# foundryvttDocker
A docker simple docker container builder for foundryvtt servers


To create Image
1. Clone repository and enter the repository directory
2. Download the new version's Linux/Node zip file from the [Foundry VTT Website](https://foundryvtt.com/community/drazev/licenses) into the versions folder.
3. Make sure the data folder is empty
4. Unzip the contents of the new versions zip into the data folder.
5. Build it using a tag for your image, Example with image tag as drazev/foundryvttdocker:12.0.0 would be: `docker build -t drazev/foundryvttdocker:12.0.0 .`
6. Run the image, using this format as an example: `sudo docker run --name YOUR_SERVER_NAME -d -p 30000:30000 -v /path/to/local/foundryDataFolder:/app/data --restart unless-stopped drazev/foundryvttdocker:12.0.0`
7. Navigate to your server on port `30000` and enter your license key.

- If multiple servers the "--name" must be unique
- the `-p host_port:container_port` maps the host port to the container port which is 30000 in this image
- The `-v` command will take a host directory for the foundry data and map it to a folder in the image where the app expects your data to reside.
> [!WARNING]
> If not provided docker run will create a volume on your disk to persist the data, but when you delete this container the data will be gone! You really should set this.
- The restart `-unless-stopped` makes the server always restart if it shuts down, including after reboots
- The `-d` means it runs detached
- Replace `drazev/foundryvttdocker:12.0.0` with your image tag for your build.

Keep in mind that if you are using multiple servers a virtual http server will be required like apache2. This will be used to receive http requests and map them to the correct applications port.


## Finding a Built Image
The builds for supported foundry versions can be found on [Docker Hub](https://hub.docker.com/r/drazev/foundryvttdocker/tags). Since May 2024 the major version of the image is aligned to the foundry versions.
If you target one of those valid images with run docker will automatically download the image before constructing your container.

> [!NOTE]
> I will only update the image for each foundry version since it requires a new image. For existing images, you will need to run the normal update from Foundry.
