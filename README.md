# BUSINESS COMMUNICATIONS: API Explorer

This sample demonstrates how to use the [Business Communications API](https://businesscommunications.googleapis.com)
to create and manage Business Messages brands, agents, and locations.

This application assumes that you're signed up with
[Business Messages](https://developers.google.com/business-communications/business-messages/guides/set-up/register).

This sample is setup to run on the Google App Engine or locally.

See the Google App Engine (https://cloud.google.com/appengine/docs/java/) standard environment
documentation for more detailed instructions.


## PREREQUISITES

You must have the following software installed on your development machine:

	* [Google Cloud SDK](https://cloud.google.com/sdk/) (aka gcloud)
	* [Node.js](https://nodejs.org/en/) - version 10 or above


## SETUP

Register with Business Messages:

    1. Open [Google Cloud Console](https://console.cloud.google.com) with your
    Business Messages Google account and create a new project for your agent.

    Note the **Project ID** and **Project number** values.

    2. Open the
    [Business Communications API](https://console.developers.google.com/apis/library/businesscommunications.googleapis.com)
    in the API Library.

    3. Click **Enable**.

    4. [Register your project](https://developers.google.com/business-communications/business-messages/guides/set-up/register)
    with Business Messages.

    5. Create a service account.

        1. Navigate to [Credentials](https://console.cloud.google.com/apis/credentials).
    
        2. Click **Create service account**.
    
        3. For **Service account name**, enter your agent's name, then click **Create**.
    
        4. For **Select a role**, choose **Project** > **Editor**, the click **Continue**.
    
        5. Under **Create key**, choose **JSON**, then click **Create**.
    
           Your browser downloads the service account key. Store it in a secure location.

    6. Click **Done**.

    7. Copy the JSON credentials file into this sample's /src/main/resources
    folder and rename it to "bc-agent-service-account-credentials.json".


## RUN THE SAMPLE

	1. In a terminal, navigate to this sample's root directory.

	2. Run the following commands:

	    npm install
	    npm start

	3. Navigate to http://localhost:3000
