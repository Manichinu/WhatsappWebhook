/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors())
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT } = process.env;

app.post("/webhook", async (req, res) => {
  // log incoming messages
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  // check if the webhook request contains a message
  // details on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
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

  res.sendStatus(200);
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
