const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// Biến môi trường
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// --- Queue gửi message để tránh crash ---
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
      body: JSON.stringify({
        recipient: { id: sender },
        message: { text }
      })
    });
    console.log("Message sent to", sender);
  } catch (err) {
    console.error("Messenger API error:", err);
    // Retry sau 2s
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

// --- Webhook verify ---
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.send("Error verify");
  }
});

// --- Nhận tin nhắn ---
app.post("/webhook", async (req, res) => {
  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];
      for (const event of messagingEvents) {
        if (event.message && event.message.text) {
          const sender = event.sender.id;
          const userText = event.message.text;
          const reply = await handleAI(sender, userText);
          sendMessage(sender, reply);
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// --- Logic AI ---
async function handleAI(userId, userText) {
  try {
    const prompt = `
Bạn là Ngọc An – chuyên viên tư vấn bất động sản Danh Khôi.

Mục tiêu:
- Hỏi nhu cầu (mua ở hay đầu tư)
- Hỏi tài chính
- Gợi ý sản phẩm phù hợp
- Chốt lịch xem nhà

Quy tắc:
- Trả lời ngắn (2-3 câu)
- Luôn hỏi lại khách 1 câu
- Giọng thân thiện, chuyên nghiệp

Sản phẩm:
- Icon Central: căn hộ cao cấp, giá từ 4-8 tỷ
- Nhà phố Dĩ An: 5-7 tỷ
- Đất nền Dĩ An: từ 3 tỷ
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userText }
        ]
      })
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Xin lỗi, tôi chưa hiểu câu hỏi của bạn.";
  } catch (err) {
    console.error("OpenAI API error:", err);
    return "Xin lỗi, tôi gặp sự cố. Bạn thử lại sau nhé!";
  }
}

// --- Heartbeat ---
setInterval(() => console.log("Bot heartbeat... ✅"), 30000);

// --- Global error handling ---
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  setTimeout(() => console.log("Bot restarting..."), 5000);
});

// --- Start server ---
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
