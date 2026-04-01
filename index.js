const express = require("express");
const fetch = require("node-fetch");

const app = express();
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { history: [], need: null, budget: null });
  }
  return sessions.get(userId);
}

app.use(express.json());

// Lấy thông tin từ Railway Variables
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const API_KEY = process.env.OPENAI_API_KEY; 
const BASE_URL = process.env.MANUS_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
const PORT = process.env.PORT || 3000;

const messageQueue = [];
let sending = false;

async function processQueue( ) {
  if (sending || messageQueue.length === 0) return;
  sending = true;
  const { sender, text } = messageQueue.shift();
  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: sender }, message: { text } } )
    });
  } catch (err) {
    console.error("Lỗi gửi tin nhắn Facebook:", err);
  } finally {
    sending = false;
    processQueue();
  }
}

function sendMessage(sender, text) {
  messageQueue.push({ sender, text });
  processQueue();
}

// Webhook xác thực với Facebook
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.status(403).send("Lỗi xác thực Webhook");
});

// Nhận tin nhắn từ khách hàng
app.post("/webhook", async (req, res) => {
  const entries = req.body.entry || [];
  for (const entry of entries) {
    const messagingEvents = entry.messaging || [];
    for (const event of messagingEvents) {
      if (event.message && event.message.text) {
        const sender = event.sender.id;
        const userText = event.message.text;
        
        // Gọi AI xử lý câu trả lời
        const reply = await handleAI(sender, userText);
        
        // Giả lập thời gian gõ phím (delay)
        await new Promise(r => setTimeout(r, 1000 + Math.random()*1000));
        
        // Gửi câu trả lời trực tiếp vào Messenger
        await sendMessage(sender, reply + "\n\nAnh/chị tiện đi xem thực tế lúc nào để em sắp lịch ạ?");
      }
    }
  }
  res.sendStatus(200);
});

async function handleAI(userId, userText) {
  const session = getSession(userId);
  session.history.push({ role: "user", content: userText });
  if (session.history.length > 6) session.history.shift();

  const systemPrompt = `Bạn là Ngọc An – sale BĐS chuyên nghiệp, nói chuyện như người thật. 
- Trả lời ngắn gọn 2-3 câu. 
- Luôn dùng "dạ", "em", "anh/chị". 
- Không chào hỏi lặp lại nếu đã chào rồi. 
- Trả lời thẳng vào vấn đề khách hỏi.`;

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gemini-1.5-flash", // Dùng model nhanh nhất và miễn phí
        messages: [
          { role: "system", content: systemPrompt },
          ...session.history
        ]
      })
    });

    const data = await res.json();
    if (data.choices && data.choices[0]) {
      const reply = data.choices[0].message.content;
      session.history.push({ role: "assistant", content: reply });
      return reply;
    }
    return "Dạ, em đang kiểm tra lại thông tin dự án, anh/chị đợi em một chút nhé!";
  } catch (err) {
    console.error("Lỗi gọi AI:", err);
    return "Dạ, hiện tại hệ thống đang bận, anh/chị vui lòng để lại số điện thoại em sẽ gọi lại ngay ạ!";
  }
}

app.listen(PORT, () => console.log(`Bot đang chạy tại cổng ${PORT}`));
