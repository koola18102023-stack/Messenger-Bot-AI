const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch"); // npm i node-fetch@2

const app = express();
app.use(bodyParser.json());

// --- Biến môi trường ---
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

// --- Queue gửi tin nhắn ---
const messageQueue = [];
let sending = false;

async function processQueue() {
  if (sending || messageQueue.length === 0) return;
  sending = true;

  const { senderPsid, response } = messageQueue.shift();
  try {
    const res = await fetch(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderPsid },
          message: response,
        }),
      }
    );
    const data = await res.json();
    console.log("Message sent:", data);
  } catch (err) {
    console.error("Messenger API error:", err);
    // Retry 1 lần sau 2s nếu có lỗi
    setTimeout(() => {
      messageQueue.push({ senderPsid, response });
    }, 2000);
  } finally {
    sending = false;
    processQueue();
  }
}

// --- Send message ---
function callSendAPI(senderPsid, response) {
  messageQueue.push({ senderPsid, response });
  processQueue();
}

// --- Bot logic ---
function startBot() {
  try {
    console.log("Messenger Bot running...");

    // Heartbeat log
    setInterval(() => {
      console.log("Bot heartbeat... ✅");
    }, 30000);
  } catch (err) {
    console.error("Bot crashed:", err);
    console.log("Restarting bot in 5s...");
    setTimeout(startBot, 5000);
  }
}

// Start bot lần đầu
startBot();

// --- Global error handling ---
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  console.log("Restarting bot in 5s...");
  setTimeout(startBot, 5000);
});

// --- HTTP Server ---
app.get("/", (req, res) => res.send("Messenger Bot is running! ✅"));
app.get("/status", (req, res) => res.json({ status: "running", timestamp: new Date() }));

// --- Messenger Webhook ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    body.entry.forEach((entry) => {
      try {
        const messagingEvents = entry.messaging;
        if (!messagingEvents) return;

        messagingEvents.forEach((event) => {
          const senderPsid = event.sender.id;
          console.log("Received message:", event);

          if (event.message) {
            handleMessage(senderPsid, event.message);
          }
        });
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// --- Handle message ---
function handleMessage(senderPsid, receivedMessage) {
  try {
    let response;
    if (receivedMessage.text) {
      response = { text: `Bạn vừa gửi: "${receivedMessage.text}"` };
    } else {
      response = { text: "Xin lỗi, tôi không hiểu." };
    }
    callSendAPI(senderPsid, response);
  } catch (err) {
    console.error("Error in handleMessage:", err);
  }
}

// --- Start HTTP server ---
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
