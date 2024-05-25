# foundryvttDocker Image
A docker simple docker container builder for foundryvtt servers.

To use this image you must have a valid licence from [Foundry VTT Website](https://foundryvtt.com/community/drazev/licenses). You will be prompted for this the first time you set up a server and log into it.

This image will help you set up your own dedicated server easily within a docker container. If you just want to run a game instance for your sessions it may not be necessary to have a dedicated server unless your machine lacks the necessary power. 
In these instances, you should download and install Foundry's pre-packaged Windows installation to make your life easier. 

Also, note that creating a dedicated server will involve more than creating a docker container. You will need to publish


## Using a Pre-built Image
The builds for supported foundry versions can be found on [Docker Hub](https://hub.docker.com/r/drazev/foundryvttdocker/tags). Since May 2024 the major version of the image is aligned to the foundry versions.
If you target one of those valid images with run docker will automatically download the image before constructing your container.

> [!NOTE]
> I will only update the image for each foundry version since it requires a new image. For existing images, you will need to run the normal update from Foundry.
### Steps to Create or Update a Docker Server using an Image
1. If you have an older version of the server running, you need to stop and then delete it from your docker instance. This requires that you use `docker ps` to find the **containerID** and then run `docker stop containerID` followed by `docker rm containerID`.
> [!CAUTION]
> If you forgot to map your volume when you created the server with docker run, it will delete all your data and you will not be able to get it back. If you forgot to do this you should use `docker inspect containerId` to find where the the volume it created is located on your disk and then copy it to another location which will be your new foundryData folder. You should then use the `-v` tag to target that folder and map it to the internal image `/app/data` folder as shown in the example command
3. Create a new foundryData folder for your server instance on your local disk, or if you already have one find and note it's location. 
4. Run the image, using this format as an example for version 12: `sudo docker run --name YOUR_SERVER_NAME -d -p 30000:30000 -v /path/to/local/foundryDataFolder:/app/data --restart unless-stopped drazev/foundryvttdocker:12.0.0`
5. Navigate to your server on port `30000`
6. If this is a new foundry server enter your license key.
7. Get your computer's IP address using `ifconfig` for linux or `ipconfig` using Windows and note it for step 9.
8. Open port 30000 on the server computer's firewall for `TCP` so that external computers can communicate with the docker container.
9. On your router you will need to forward port `30000` to your computer's IP address. You should also make sure your router has a static or unchanging IP before you do this or it might randomly change on your and make your server inaccessible.

> [!WARNING]
> Do not share or copy your `foundryData` folder for a live server. The foundry app expects it to have exclusive control over the folder for a single instance of the app.
> If you have more than one app running on it or attempt to copy it while it is running you could end up with corrupted or lost data.
>
> If you wish to backup the foundryData folder, first stop the container instance and then copy it. This makes sure you copy a valid state. Never have two or more app instances ever used a folder.

## Using this repo to make your own image
To create Image
1. Clone repository and enter the repository directory
2. Download the new version's Linux/Node zip file from the [Foundry VTT Website](https://foundryvtt.com/community/drazev/licenses) into the versions folder.
3. Make sure the data folder is empty
4. Unzip the contents of the new versions zip into the data folder.
5. Build it using a tag for your image, Example with image tag as drazev/foundryvttdocker:12.0.0 would be: `docker build -t drazev/foundryvttdocker:12.0.0 .`
6. Run the image, using this format as an example: `sudo docker run --name YOUR_SERVER_NAME -d -p 30000:30000 -v /path/to/local/foundryDataFolder:/app/data --restart unless-stopped drazev/foundryvttdocker:12.0.0`
7. Navigate to your server on port `30000` and enter your license key.

## Understanding and Decomposing the docker Run command examples
- If multiple servers the "--name" must be unique
- the `-p host_port:container_port` maps the host port to the container port which is 30000 in this image
- The `-v` command will take a host directory for the foundry data and map it to a folder in the image where the app expects your data to reside.
> [!WARNING]
> If not provided docker run will create a volume on your disk to persist the data, but when you delete this container the data will be gone! You really should set this.
- The restart `-unless-stopped` makes the server always restart if it shuts down, including after reboots
- The `-d` means it runs detached
- Replace `drazev/foundryvttdocker:12.0.0` with your image tag for your build.

Keep in mind that if you are using multiple servers a virtual http server will be required like apache2. This will be used to receive http requests and map them to the correct applications port.


