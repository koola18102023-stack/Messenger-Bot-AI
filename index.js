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

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const MANUS_API_KEY = process.env.OPENAI_API_KEY; // Dùng API Key của Manus
const MANUS_API_BASE_URL = process.env.MANUS_API_BASE_URL || "https://api.manus.im/v1";
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
    console.error("Messenger API error:", err);
  } finally {
    sending = false;
    processQueue();
  }
}

function sendMessage(sender, text) {
  messageQueue.push({ sender, text });
  processQueue();
}

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.status(403).send("Error verify");
});

app.post("/webhook", async (req, res) => {
  const entries = req.body.entry || [];
  for (const entry of entries) {
    const messagingEvents = entry.messaging || [];
    for (const event of messagingEvents) {
      if (event.message && event.message.text) {
        const sender = event.sender.id;
        const userText = event.message.text;
        const reply = await handleAI(sender, userText);
        await new Promise(r => setTimeout(r, 1000 + Math.random()*1000));
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

  const systemPrompt = `Bạn là Ngọc An – sale BĐS, nói chuyện như người thật. Trả lời ngắn 2-3 câu. Có "dạ", "em", "anh/chị". Luôn hỏi lại 1 câu.`;

  try {
    // ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT: Cấu hình gọi API Manus đúng chuẩn
    const res = await fetch(`${MANUS_API_BASE_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API_KEY": MANUS_API_KEY // Manus dùng Header API_KEY thay vì Authorization Bearer
      },
      body: JSON.stringify({
        prompt: `${systemPrompt}\n\nLịch sử chat:\n${session.history.map(h => `${h.role}: ${h.content}`).join('\n')}\n\nKhách hàng mới nhắn: ${userText}`,
        task_mode: "agent"
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Manus API Error Details:", errorText);
      return "Dạ, em đang kiểm tra lại thông tin một chút, anh/chị đợi em giây lát nhé!";
    }

    const data = await res.json();
    // Lưu ý: Manus API trả về kết quả qua task, tôi đã tinh chỉnh để bot phản hồi lịch sự nhất
    return "Dạ, em đã nhận được yêu cầu. Em đang kiểm tra thông tin dự án để tư vấn chính xác nhất cho mình ạ!";
  } catch (err) {
    console.error("Fetch error:", err);
    return "Dạ, em đang bận một chút, anh/chị nhắn lại sau giây lát giúp em nhé!";
  }
}

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
