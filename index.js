const express = require("express");
const fetch = require("node-fetch");

const app = express();const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      history: [],
      need: null,
      budget: null
    });
  }
  return sessions.get(userId);
}
function extractInfo(text, session) {
  const t = text.toLowerCase();

  if (!session.need) {
    if (t.includes("ở")) session.need = "mua ở";
    if (t.includes("đầu tư")) session.need = "đầu tư";
  }

  const match = t.match(/\d+/);
  if (match && !session.budget) {
    session.budget = parseInt(match[0]) * 1000000000;
  }
}
app.use(express.json());

// Biến môi trường
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// Queue gửi tin nhắn để tránh crash
const messageQueue = [];
let sending = false;

async function processQueue() {
  if (sending || messageQueue.length === 0) return;
  sending = true;

  const { sender, text } = messageQueue.shift();
  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: sender }, message: { text } })
    });
    console.log("Message sent to", sender);
  } catch (err) {
    console.error("Messenger API error:", err);
    setTimeout(() => messageQueue.push({ sender, text }), 2000);
  } finally {
    sending = false;
    processQueue();
  }
}

function sendMessage(sender, text) {
  messageQueue.push({ sender, text });
  processQueue();
}

// --- Webhook verify
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("MODE:", mode);
  console.log("TOKEN:", token);
  console.log("VERIFY_TOKEN:", VERIFY_TOKEN);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFIED");
    return res.status(200).send(challenge);
  } else {
    console.log("VERIFY FAILED");
    return res.status(403).send("Error verify");
  }
});

// --- Nhận tin nhắn
app.post("/webhook", async (req, res) => {
  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];
      for (const event of messagingEvents) {
        if (event.message && event.message.text) {
          const sender = event.sender.id;
          const userText = event.message.text;
          const reply = await handleAI(sender, text);

// giả lập người thật (delay)
await new Promise(r => setTimeout(r, 1000 + Math.random()*1000));

await sendMessage(sender, reply + "\n\nAnh/chị tiện đi xem thực tế lúc nào để em sắp lịch ạ?");
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// --- Logic AI
async function handleAI(userId, userText) {
  const session = getSession(userId);

  extractInfo(userText, session);

  session.history.push({ role: "user", content: userText });
  if (session.history.length > 6) session.history.shift();

  const systemPrompt = `
Bạn là Ngọc An – sale BĐS, nói chuyện như người thật.

- Trả lời ngắn 2-3 câu
- Có "dạ", "em", "anh/chị"
- Luôn hỏi lại 1 câu

Thông tin khách:
- Nhu cầu: ${session.need || "chưa rõ"}
- Tài chính: ${session.budget ? session.budget / 1000000000 + " tỷ" : "chưa rõ"}

Chiến lược:
- Trả lời đúng câu hỏi
- Sau đó kéo về BĐS
- Chốt lịch xem nhà
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...session.history
      ]
    })
  });

  const data = await res.json();
  const reply = data.choices[0].message.content;

  session.history.push({ role: "assistant", content: reply });

  return reply;
}

// Heartbeat log
setInterval(() => console.log("Bot heartbeat... ✅"), 30000);

// Global error handling
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  setTimeout(() => console.log("Bot restarting..."), 5000);
});

// Start server
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
