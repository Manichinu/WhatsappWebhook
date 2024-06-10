/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors())
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT } = process.env;

// Ensure the images directory exists
const imagesDir = path.resolve('images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}


// Ensure the document directory exists
const documentDir = path.resolve('documents');
if (!fs.existsSync(documentDir)) {
  fs.mkdirSync(documentDir);
}

// Simple in-memory cache for processed message IDs
const processedMessages = new Set();

app.post("/webhook", async (req, res) => {
  // log incoming messages
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  // check if the webhook request contains a message
  // details on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];

  if (!message) {
    return res.sendStatus(200);
  }

  // Check if message ID is already processed
  if (processedMessages.has(message.id)) {
    console.log("Duplicate message detected:", message.id);
    return res.sendStatus(200);
  }

  // Mark the message as processed
  processedMessages.add(message.id);

  // Retain only the most recent 100 message IDs
  // if (processedMessages.size > 100) {
  //   const ids = Array.from(processedMessages);
  //   processedMessages.delete(ids[0]);
  // }

  // axios(postItem)
  //   .then(response => {
  //     console.log('Response:', response.data);
  //   })
  //   .catch(error => {
  //     console.error('Error:', error);
  //   });

  // check if the incoming message contains text
  if (message?.type === "text") {
    // extract the business number to send the reply from it
    const business_phone_number_id =
      req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;

    const postItem = {
      url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
      method: "POST",
      timeout: 0,
      headers: {
        'Access-Control-Allow-Origin': '*',
        "Accept": "application/json; odata=nometadata",
        "Content-Type": "application/json; odata=nometadata"
      },
      data: {
        Message: message?.text.body,
        Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
        Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name
      }
    };
    try {
      const response = await axios(postItem);
      console.log('Response from Azure Logic App:', response.data);
    } catch (error) {
      console.error('Error sending data to Azure Logic App:', error);
    }
    // mark incoming message as read
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        status: "read",
        message_id: message.id,
      },
    });
  }
  if (message?.type === "image") {
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const imageId = message?.image.id;

    try {
      // Step 1: Get the image metadata including the URL
      const imageMetaResponse = await axios({
        url: `https://graph.facebook.com/v13.0/${imageId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      const imageUrl = imageMetaResponse.data.url;
      console.log(`Image URL: ${imageUrl}`);


      // Step 2: Fetch the image data
      const imageResponse = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      // Step 3: Save the image to the server
      const imagePath = path.resolve(imagesDir, `${imageId}.jpg`);
      console.log(`Absolute path for saving image: ${imagePath}`);

      fs.writeFileSync(imagePath, imageResponse.data);
      console.log("Image response data length:", imageResponse.data.byteLength);

      const postItem = {
        url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
        method: "POST",
        timeout: 0,
        headers: {
          'Access-Control-Allow-Origin': '*',
          "Accept": "application/json; odata=nometadata",
          "Content-Type": "application/json; odata=nometadata"
        },
        data: {
          ImageURL: `https://webhook.remodigital.in/images/${imageId}`,
          Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
          Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name
        }
      };
      try {
        const response = await axios(postItem);
        console.log('Response from Azure Logic App:', response.data);
      } catch (error) {
        console.error('Error sending data to Azure Logic App:', error);
      }

      // Verify the file exists
      if (fs.existsSync(imagePath)) {
        console.log(`Image successfully saved as ${imageId}.jpg at ${imagePath}`);
      } else {
        console.error(`Failed to save image at ${imagePath}`);
        return res.status(500).send('Failed to save image');
      }

      return res.status(200).send('Image retrieved successfully');
    } catch (error: any) {
      console.error('Error retrieving image:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error retrieving image');
    }
  }
  if (message?.type === "document") {
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const documentId = message?.document.id;

    try {
      const documentMetaResponse = await axios({
        url: `https://graph.facebook.com/v13.0/${documentId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      const documentUrl = documentMetaResponse.data.url;
      console.log(`Document URL: ${documentUrl}`);


      const documentResponse = await axios({
        url: documentUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      const documentName = message.document.filename || `${documentId}.pdf`;
      const documentPath = path.resolve(documentDir, documentName);
      console.log(`Absolute path for saving document: ${documentPath}`);

      fs.writeFileSync(documentPath, documentResponse.data);
      console.log("Document response data length:", documentResponse.data.byteLength);
      const postItem = {
        url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
        method: "POST",
        timeout: 0,
        headers: {
          'Access-Control-Allow-Origin': '*',
          "Accept": "application/json; odata=nometadata",
          "Content-Type": "application/json; odata=nometadata"
        },
        data: {
          DocumentURL: `https://webhook.remodigital.in/documents/${documentId}.pdf`,
          Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
          Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name
        }
      };
      try {
        const response = await axios(postItem);
        console.log('Response from Azure Logic App:', response.data);
      } catch (error) {
        console.error('Error sending data to Azure Logic App:', error);
      }

      if (fs.existsSync(documentPath)) {
        console.log(`Document successfully saved as ${documentName} at ${documentPath}`);
      } else {
        console.error(`Failed to save document at ${documentPath}`);
        return res.status(500).send('Failed to save document');
      }

      return res.status(200).send('Document retrieved successfully');
    } catch (error: any) {
      console.error('Error retrieving document:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error retrieving document');
    }
  }

  res.sendStatus(200);
});

app.get('/images/:mediaId', (req, res) => {
  const mediaId = req.params.mediaId;
  const imagePath = path.resolve(imagesDir, `${mediaId}.jpg`);

  console.log('Request for image with mediaId:', mediaId);
  console.log('Looking for image at path:', imagePath);

  if (fs.existsSync(imagePath)) {
    console.log(`Serving image from path: ${imagePath}`);
    res.sendFile(imagePath, { headers: { 'Content-Type': 'image/jpeg' } }, (err: any) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(err.status).end();
      }
    });
  } else {
    console.error('Image not found at path:', imagePath);
    res.status(404).send('Image not found');
  }
});

app.get('/documents/:documentName', (req, res) => {
  const documentName = req.params.documentName;
  const documentPath = path.resolve(documentDir, documentName);

  console.log('Request for document with name:', documentName);
  console.log('Looking for document at path:', documentPath);

  if (fs.existsSync(documentPath)) {
    console.log(`Serving document from path: ${documentPath}`);
    res.sendFile(documentPath, (err: any) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(err.status).end();
      }
    });
  } else {
    console.error('Document not found at path:', documentPath);
    res.status(404).send('Document not found');
  }
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // check the mode and token sent are correct
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    // respond with 200 OK and challenge token from the request
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    // respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

// app.get("/", (req, res) => {
//   res.send(`<pre>Nothing to see here.
// Checkout README.md to start.</pre>`);
// });
app.get('*', (req, res) => {
  res.send("API is hosted")
})

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
