import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT } = process.env;

// Ensure the directories exist
// const ensureDirExists = (dir: any) => {
//   if (!fs.existsSync(dir)) {
//     fs.mkdirSync(dir);
//   }
// };

// const imagesDir = path.resolve('images');
// const documentsDir = path.resolve('documents');
// const audioDir = path.resolve('audio');
// const videosDir = path.resolve('videos');

// ensureDirExists(imagesDir);
// ensureDirExists(documentsDir);
// ensureDirExists(audioDir);
// ensureDirExists(videosDir);

// Simple in-memory cache for processed message IDs
const processedMessages = new Set();

app.post("/webhook", async (req, res) => {
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
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

  if (message?.type === "text") {
    const businessPhoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
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
        Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name,
        Type: "text"
      }
    };
    try {
      const response = await axios(postItem);
      console.log('Response from Azure Logic App:', response.data);
    } catch (error) {
      console.error('Error sending data to Azure Logic App:', error);
    }
    try {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${businessPhoneNumberId}/messages`,
        headers: {
          Authorization: `Bearer ${GRAPH_API_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: message.id,
        },
      });

      return res.sendStatus(200);
    } catch (error: any) {
      console.error('Error marking message as read:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error processing message');
    }
  }
  if (message?.type === "image") {
    const imageId = message?.image.id;
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const Caption = message.image.caption == undefined ? "" : message.image.caption;
    try {
      const imageMetaResponse = await axios({
        url: `https://graph.facebook.com/v13.0/${imageId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      const imageUrl = imageMetaResponse.data.url;
      console.log(`Image URL: ${imageUrl}`);

      const imageResponse = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      // const imagePath = path.resolve(imagesDir, `${imageId}.jpg`);
      // console.log(`Absolute path for saving image: ${imagePath}`);

      // fs.writeFileSync(imagePath, imageResponse.data);
      const imageBuffer = Buffer.from(imageResponse.data);
      const imageBase64 = imageBuffer.toString('base64');
      console.log("Image response data length:", imageResponse.data.byteLength);

      const imageItem = {
        url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
        method: "POST",
        timeout: 0,
        headers: {
          'Access-Control-Allow-Origin': '*',
          "Accept": "application/json; odata=nometadata",
          "Content-Type": "application/json; odata=nometadata"
        },
        data: {
          // ImageURL: `https://webhook.remodigital.in/images/${imageId}`,
          Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
          Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name,
          Type: "image",
          FileBase64: imageBase64,
          FileName: `${imageId}.jpg`,
          Message: Caption,
        }
      };

      try {
        const response = await axios(imageItem);
        console.log('Response from Azure Logic App:', response.data);
      } catch (error) {
        console.error('Error sending data to Azure Logic App:', error);
      }

      // if (fs.existsSync(imagePath)) {
      //   console.log(`Image successfully saved as ${imageId}.jpg at ${imagePath}`);
      // } else {
      //   console.error(`Failed to save image at ${imagePath}`);
      //   return res.status(500).send('Failed to save image');
      // }

      return res.status(200).send('Image retrieved successfully');
    } catch (error: any) {
      console.error('Error retrieving image:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error retrieving image');
    }
  }
  if (message?.type === "document") {
    const documentId = message?.document.id;
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

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
      const documentBuffer = Buffer.from(documentResponse.data);
      const documentBase64 = documentBuffer.toString('base64');
      // const documentPath = path.resolve(documentsDir, documentName);
      // console.log(`Absolute path for saving document: ${documentPath}`);

      // fs.writeFileSync(documentPath, documentResponse.data);
      // console.log("Document response data length:", documentResponse.data.byteLength);
      const documentItem = {
        url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
        method: "POST",
        timeout: 0,
        headers: {
          'Access-Control-Allow-Origin': '*',
          "Accept": "application/json; odata=nometadata",
          "Content-Type": "application/json; odata=nometadata"
        },
        data: {
          // DocumentURL: `https://webhook.remodigital.in/documents/${documentName}`,
          Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
          Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name,
          Type: "document",
          DocumentBase64: documentBase64,
          DocumentName: message?.document.filename
        }
      };

      try {
        const response = await axios(documentItem);
        console.log('Response from Azure Logic App:', response.data);
      } catch (error) {
        console.error('Error sending data to Azure Logic App:', error);
      }

      // if (fs.existsSync(documentPath)) {
      //   console.log(`Document successfully saved as ${documentName} at ${documentPath}`);
      // } else {
      //   console.error(`Failed to save document at ${documentPath}`);
      //   return res.status(500).send('Failed to save document');
      // }

      return res.status(200).send('Document retrieved successfully');
    } catch (error: any) {
      console.error('Error retrieving document:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error retrieving document');
    }
  }
  if (message?.type === "audio") {
    const audioId = message?.audio.id;
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    try {
      const audioMetaResponse = await axios({
        url: `https://graph.facebook.com/v13.0/${audioId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      const audioUrl = audioMetaResponse.data.url;
      console.log(`Audio URL: ${audioUrl}`);

      const audioResponse = await axios({
        url: audioUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      // const audioPath = path.resolve(audioDir, `${audioId}.ogg`);
      // console.log(`Absolute path for saving audio: ${audioPath}`);

      // fs.writeFileSync(audioPath, audioResponse.data);
      const audioBuffer = Buffer.from(audioResponse.data);
      const audioBase64 = audioBuffer.toString('base64');
      console.log("Audio response data length:", audioResponse.data.byteLength);
      const audioItem = {
        url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
        method: "POST",
        timeout: 0,
        headers: {
          'Access-Control-Allow-Origin': '*',
          "Accept": "application/json; odata=nometadata",
          "Content-Type": "application/json; odata=nometadata"
        },
        data: {
          // AudioURL: `https://webhook.remodigital.in/audio/${audioId}`,
          Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
          Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name,
          Type: "audio",
          FileBase64: audioBase64,
          FileName: `${audioId}.ogg`
        }
      };

      try {
        const response = await axios(audioItem);
        console.log('Response from Azure Logic App:', response.data);
      } catch (error) {
        console.error('Error sending data to Azure Logic App:', error);
      }

      // if (fs.existsSync(audioPath)) {
      //   console.log(`Audio successfully saved as ${audioId}.ogg at ${audioPath}`);
      // } else {
      //   console.error(`Failed to save audio at ${audioPath}`);
      //   return res.status(500).send('Failed to save audio');
      // }

      return res.status(200).send('Audio retrieved successfully');
    } catch (error: any) {
      console.error('Error retrieving audio:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error retrieving audio');
    }
  }
  if (message?.type === "video") {
    const videoId = message?.video.id;
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    try {
      const videoMetaResponse = await axios({
        url: `https://graph.facebook.com/v13.0/${videoId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      const videoUrl = videoMetaResponse.data.url;
      console.log(`Video URL: ${videoUrl}`);

      const videoResponse = await axios({
        url: videoUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${GRAPH_API_TOKEN}`,
        },
      });

      // const videoPath = path.resolve(videosDir, `${videoId}.mp4`);
      // console.log(`Absolute path for saving video: ${videoPath}`);

      // fs.writeFileSync(videoPath, videoResponse.data);
      const videoBuffer = Buffer.from(videoResponse.data);
      const videoBase64 = videoBuffer.toString('base64');
      console.log("Video response data length:", videoResponse.data.byteLength);
      const videoItem = {
        url: "https://prod-134.westus.logic.azure.com:443/workflows/54a65ff633684999b86c7d2067a4ed82/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KNvJymBCdH3oU-BzKHvXT3BXmWju_IzMyCNkCevuEwE",
        method: "POST",
        timeout: 0,
        headers: {
          'Access-Control-Allow-Origin': '*',
          "Accept": "application/json; odata=nometadata",
          "Content-Type": "application/json; odata=nometadata"
        },
        data: {
          // VideoURL: `https://webhook.remodigital.in/videos/${videoId}`,
          Number: req.body.entry?.[0]?.changes[0]?.value?.messages?.[0].from,
          Name: req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0].profile.name,
          Type: "video",
          FileBase64: videoBase64,
          FileName: `${videoId}.mp4`
        }
      };

      try {
        const response = await axios(videoItem);
        console.log('Response from Azure Logic App:', response.data);
      } catch (error) {
        console.error('Error sending data to Azure Logic App:', error);
      }

      // if (fs.existsSync(videoPath)) {
      //   console.log(`Video successfully saved as ${videoId}.mp4 at ${videoPath}`);
      // } else {
      //   console.error(`Failed to save video at ${videoPath}`);
      //   return res.status(500).send('Failed to save video');
      // }

      return res.status(200).send('Video retrieved successfully');
    } catch (error: any) {
      console.error('Error retrieving video:', error.response ? error.response.data : error.message);
      return res.status(500).send('Error retrieving video');
    }
  }

  res.sendStatus(200);
});

// app.get('/images/:mediaId', (req, res) => {
//   const mediaId = req.params.mediaId;
//   const imagePath = path.resolve(imagesDir, `${mediaId}.jpg`);

//   console.log('Request for image with mediaId:', mediaId);
//   console.log('Looking for image at path:', imagePath);

//   if (fs.existsSync(imagePath)) {
//     console.log(`Serving image from path: ${imagePath}`);
//     res.sendFile(imagePath, { headers: { 'Content-Type': 'image/jpeg' } }, (err: any) => {
//       if (err) {
//         console.error('Error sending file:', err);
//         res.status(err.status).end();
//       }
//     });
//   } else {
//     console.error('Image not found at path:', imagePath);
//     res.status(404).send('Image not found');
//   }
// });
// app.get('/documents/:documentName', (req, res) => {
//   const documentName = req.params.documentName;
//   const documentPath = path.resolve(documentsDir, documentName);

//   console.log('Request for document with name:', documentName);
//   console.log('Looking for document at path:', documentPath);

//   if (fs.existsSync(documentPath)) {
//     console.log(`Serving document from path: ${documentPath}`);
//     res.sendFile(documentPath, (err: any) => {
//       if (err) {
//         console.error('Error sending file:', err);
//         res.status(err.status).end();
//       }
//     });
//   } else {
//     console.error('Document not found at path:', documentPath);
//     res.status(404).send('Document not found');
//   }
// });
// app.get('/audio/:audioId', (req, res) => {
//   const audioId = req.params.audioId;
//   const audioPath = path.resolve(audioDir, `${audioId}.ogg`);

//   console.log('Request for audio with audioId:', audioId);
//   console.log('Looking for audio at path:', audioPath);

//   if (fs.existsSync(audioPath)) {
//     console.log(`Serving audio from path: ${audioPath}`);
//     res.sendFile(audioPath, { headers: { 'Content-Type': 'audio/ogg' } }, (err: any) => {
//       if (err) {
//         console.error('Error sending file:', err);
//         res.status(err.status).end();
//       }
//     });
//   } else {
//     console.error('Audio not found at path:', audioPath);
//     res.status(404).send('Audio not found');
//   }
// });
// app.get('/videos/:videoId', (req, res) => {
//   const videoId = req.params.videoId;
//   const videoPath = path.resolve(videosDir, `${videoId}.mp4`);

//   console.log('Request for video with videoId:', videoId);
//   console.log('Looking for video at path:', videoPath);

//   if (fs.existsSync(videoPath)) {
//     console.log(`Serving video from path: ${videoPath}`);
//     res.sendFile(videoPath, { headers: { 'Content-Type': 'video/mp4' } }, (err: any) => {
//       if (err) {
//         console.error('Error sending file:', err);
//         res.status(err.status).end();
//       }
//     });
//   } else {
//     console.error('Video not found at path:', videoPath);
//     res.status(404).send('Video not found');
//   }
// });

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    res.sendStatus(403);
  }
});

// app.get("/", (req, res) => {
//   res.send(`<pre>Nothing to see here. Checkout README.md to start.</pre>`);
// });
app.get('*', (req, res) => {
  res.send("API is hosted")
})

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
