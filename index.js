const express = require("express");
const fetch = require("node-fetch");

const app = express();
const sessions = new Map();

// CẤU HÌNH PORT TỰ ĐỘNG CHO RAILWAY (RẤT QUAN TRỌNG)
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. PHẢN HỒI RAILWAY HEALTH CHECK (GIÚP BOT KHÔNG BỊ TẮT)
app.get("/", (req, res) => {
  res.status(200).send("Bot Icon Central is Live!");
});

// 2. XÁC THỰC WEBHOOK VỚI FACEBOOK
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    console.log("Xác thực Webhook thành công!");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.status(200).send("Webhook active");
});

// 3. BIẾN MÔI TRƯỜNG
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const API_KEY = process.env.OPENAI_API_KEY; 
// Sử dụng URL trực tiếp của Gemini nếu không có BASE_URL
const BASE_URL = process.env.MANUS_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";

// 4. XỬ LÝ TIN NHẮN ĐẾN
app.post("/webhook", async (req, res) => {
  const entries = req.body.entry || [];
  for (const entry of entries) {
    const messagingEvents = entry.messaging || [];
    for (const event of messagingEvents) {
      if (event.message && event.message.text) {
        const sender = event.sender.id;
        const userText = event.message.text;
        
        console.log(`Nhận tin nhắn từ ${sender}: ${userText}`);
        
        try {
          const reply = await handleAI(sender, userText);
          
          // Gửi tin nhắn trả lời qua Facebook Graph API
          const fbRes = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: sender },
              message: { text: reply + "\n\nAnh/chị tiện đi xem thực tế lúc nào để em sắp lịch ạ?" }
            })
          });
          
          const fbData = await fbRes.json();
          if (fbData.error) {
            console.error("Lỗi Facebook API:", fbData.error.message);
          } else {
            console.log("Đã gửi câu trả lời thành công!");
          }
        } catch (err) {
          console.error("Lỗi xử lý tin nhắn:", err);
        }
      }
    }
  }
  res.sendStatus(200);
});

async function handleAI(userId, userText) {
  if (!sessions.has(userId)) sessions.set(userId, { history: [] });
  const session = sessions.get(userId);
  session.history.push({ role: "user", content: userText });
  if (session.history.length > 10) session.history.shift();

  const systemPrompt = "Bạn là Ngọc An – sale BĐS dự án Icon Central chuyên nghiệp. Trả lời ngắn gọn 2-3 câu, dùng 'dạ', 'em', 'anh/chị'. Tập trung tư vấn về nhà phố và shophouse.";

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "gemini-1.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...session.history]
      })
    });
    
    const data = await res.json();
    
    if (data.error) {
      console.error("Lỗi từ Gemini API:", data.error.message);
      return "Dạ, hiện tại em đang kiểm tra lại thông tin dự án, Anh/Chị đợi em một chút nhé!";
    }
    
    const reply = data.choices?.[0]?.message?.content || "Dạ, em đã nhận được thông tin, em sẽ phản hồi Anh/Chị ngay ạ!";
    session.history.push({ role: "assistant", content: reply });
    return reply;
  } catch (err) {
    console.error("Lỗi kết nối AI:", err);
    return "Dạ, hiện tại hệ thống đang bận, Anh/Chị vui lòng để lại số điện thoại em gọi lại ngay ạ!";
  }
}

// LẮNG NGHE TRÊN CỔNG RAILWAY CẤP PHÁT (SỬ DỤNG 0.0.0.0)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`>>> BOT ĐÃ SẴN SÀNG TRÊN CỔNG: ${PORT}`);
});
