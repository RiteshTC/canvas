const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// **Important:** Replace with your actual Salesforce connected app details.
const connectedApp = {
    consumerKey: "YOUR_CONSUMER_KEY",  //  Replace with your Consumer Key from Salesforce Connected App
    consumerSecret: "YOUR_CONSUMER_SECRET" // Replace with your Consumer Secret from Salesforce Connected App
};

// **Important**: Change to true in production.  This is just for development.
const isSecure = false;

/**
 * Generates a signed request using the connected app credentials.
 * This is the core logic for creating a Salesforce Canvas request.
 */
function generateSignedRequest(params) {
    try {
        if (!connectedApp.consumerKey || !connectedApp.consumerSecret) {
            throw new Error("Consumer Key and Consumer Secret must be configured.");
        }

        const signedRequest = {
            oauth: {
                consumerKey: connectedApp.consumerKey,
                callbackUrl: 'https://localhost:3000', //  Important:  This should match your Canvas App URL.  Use ngrok for testing.
            },
            params: params,
        };

        const token = jwt.sign(signedRequest, connectedApp.consumerSecret, { algorithm: 'HS256' });
        return token;
    } catch (error) {
        console.error("Error generating signed request:", error);
        throw error; // Re-throw to be caught by the caller.
    }
}

/**
 * Endpoint to initiate the Canvas app.
 * This endpoint is called by Salesforce.
 */
app.post('/canvas', (req, res) => {
    try {
        const { instance_url, user_id, organization_id, isSandbox, lis_person_name_full, custom_parameters } = req.body;

        //  Include any custom parameters you want to send to your Canvas app.
        const canvasContext = {
            organizationId: organization_id,
            userId: user_id,
            isSandbox: isSandbox,
            instanceUrl: instance_url,
            namespace: 'your_namespace', // Replace with your namespace, if any
            customParameters: custom_parameters || {}
        };

        const signedRequest = generateSignedRequest(canvasContext);

        //  Basic HTML to load the Canvas app within an iframe.
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Salesforce Canvas App</title>
                <style>
                    body { margin: 0; padding: 0; font-family: sans-serif; }
                    iframe {
                        width: 100%;
                        height: 100vh;
                        border: none;
                        display: block; /* Removes extra space below the iframe */
                    }
                </style>
            </head>
            <body>
                <iframe src="/hello?signed_request=${signedRequest}"></iframe>
                <script>
                  //  Optional:  PostMessage listener for communication between the Canvas app and Salesforce.
                  window.addEventListener('message', (event) => {
                    //  IMPORTANT:  Verify the origin of the message!  This is crucial for security.
                    if (event.origin === "${instance_url}") { //  Replace with your Salesforce instance URL.
                      console.log('Received message from Canvas app:', event.data);
                      //  You can send messages back to Salesforce using sforce.one.postMessage.
                    }
                  }, false);
                </script>
            </body>
            </html>
        `;
        res.send(html);
    } catch (error) {
        res.status(500).send("Error processing Canvas request: " + error.message);
    }
});

/**
 * Example endpoint for the Canvas app content.
 * This is a simple "Hello, World!" example.  Replace this with your actual app.
 */
app.get('/hello', (req, res) => {
    const { signed_request } = req.query;

    try {
        if (!signed_request) {
            return res.status(400).send("Missing signed_request parameter.");
        }
        // In a real application, you would decode and validate the signed request here.
        // For this basic example, we'll just display it.
        const decoded = jwt.decode(signed_request, { complete: true });

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Hello from Canvas App</title>
                 <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        background-color: #f4f4f4;
                        margin: 0;
                        padding: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                    }

                    .container {
                        background-color: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                        text-align: center;
                    }

                    h1 {
                        color: #0078d7; /* Salesforce Blue */
                        margin-bottom: 20px;
                    }
                    p {
                       color: #333;
                       font-size: 1.1em;
                       margin-bottom: 10px;

                    }
                    #signedRequestData {
                        font-family: monospace;
                        background-color: #f0f0f0;
                        padding: 10px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        overflow-x: auto;
                        max-width: 80%;
                        margin: 20px auto;
                        text-align: left;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Hello, Canvas User!</h1>
                    <p>This is a simple Canvas app running in Salesforce.</p>
                    <p>Signed Request Data:</p>
                    <div id="signedRequestData">
                       ${JSON.stringify(decoded, null, 2)}
                    </div>
                </div>
                <script>
                  // Example of sending a message back to Salesforce.
                  // In a real app, you would do this in response to user actions.
                  if (window.sforce && window.sforce.one) {
                    setTimeout(() => {
                      sforce.one.postMessage({
                        name: 'myCanvasAppMessage',
                        payload: { message: 'Hello from the Canvas app!' }
                      });
                    }, 2000); //  Send message after 2 seconds
                  } else {
                    console.warn('sforce.one is not defined.  Are you running within Salesforce?');
                  }
                </script>
            </body>
            </html>
        `;
        res.send(htmlContent);
    } catch (error) {
        console.error("Error in /hello endpoint:", error);
        res.status(500).send("Internal server error.");
    }
});

//  Error handling middleware (Added for robustness)
app.use((err, req, res, next) => {
    console.error("Global error handler:", err);
    res.status(500).send("Internal server error: " + err.message);
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
