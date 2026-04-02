Hướng Dẫn Tích Hợp Bot AI Lên Messenger Fanpage & Phân Tích Code

Tài liệu này cung cấp phân tích chi tiết về đoạn mã nguồn bot AI bạn đã cung cấp, chỉ ra các lỗi/vấn đề tiềm ẩn và hướng dẫn từng bước để triển khai bot này lên Messenger của Fanpage Facebook.

1. Phân Tích Code và Các Vấn Đề Tiềm Ẩn

Đoạn mã bạn cung cấp là một ứng dụng Node.js sử dụng Express framework để tạo một webhook nhận tin nhắn từ Facebook Messenger, sau đó gọi API của Gemini (thông qua endpoint tương thích OpenAI) để tạo câu trả lời và gửi lại cho người dùng. Nhìn chung, logic cơ bản đã hoàn thiện, tuy nhiên có một số điểm cần lưu ý và khắc phục để bot hoạt động ổn định hơn.

Các Lỗi và Điểm Cần Cải Thiện

Quản lý bộ nhớ (Memory Leak tiềm ẩn):
Hệ thống lưu trữ lịch sử trò chuyện (sessions) đang sử dụng Map trong bộ nhớ RAM của server. Mặc dù bạn đã giới hạn mỗi người dùng chỉ lưu 10 tin nhắn gần nhất (if (session.history.length > 10) session.history.shift();), nhưng nếu có hàng ngàn người dùng nhắn tin, đối tượng sessions sẽ phình to liên tục và không bao giờ được dọn dẹp (clear) đối với những người dùng đã ngừng tương tác. Điều này có thể dẫn đến tràn bộ nhớ (Out of Memory) khiến server bị crash. Giải pháp tối ưu là sử dụng cơ sở dữ liệu như Redis hoặc MongoDB để lưu trữ session với thời gian hết hạn (TTL).

Nối chuỗi cứng nhắc trong câu trả lời:
Ở dòng 54, đoạn code message: { text: reply + "\n\nAnh/chị tiện đi xem thực tế lúc nào để em sắp lịch ạ?" } đang ép buộc mọi câu trả lời của AI đều phải kết thúc bằng câu hỏi hẹn lịch. Điều này sẽ khiến cuộc hội thoại trở nên thiếu tự nhiên và máy móc, đặc biệt khi người dùng chỉ đang hỏi những thông tin cơ bản hoặc chào hỏi. Nên để AI tự quyết định việc có nên mời đi xem thực tế hay không thông qua việc điều chỉnh systemPrompt.

Xử lý lỗi API chưa triệt để:
Khi gọi API Facebook (dòng 58-63) hoặc API Gemini (dòng 96-99), code chỉ in lỗi ra console (console.error) mà không có cơ chế thử lại (retry) hoặc cảnh báo cho quản trị viên. Nếu API bị lỗi tạm thời (timeout, rate limit), tin nhắn của người dùng sẽ bị bỏ qua mà không có phản hồi thỏa đáng.

Bảo mật Webhook:
Mặc dù đã có bước xác thực VERIFY_TOKEN khi Facebook đăng ký webhook (dòng 18-25), nhưng ở endpoint nhận tin nhắn POST /webhook (dòng 34), code không kiểm tra chữ ký X-Hub-Signature từ Facebook. Điều này có nghĩa là bất kỳ ai biết URL webhook của bạn đều có thể gửi request giả mạo (spoofing) để kích hoạt bot.

2. Hướng Dẫn Chi Tiết Tích Hợp Bot Lên Messenger Fanpage

Để bot hoạt động và trả lời tin nhắn trên Fanpage, bạn cần thực hiện các bước thiết lập trên Facebook Developers và triển khai (deploy) code lên một máy chủ (ví dụ: Railway, Render, Heroku).

Bước 1: Chuẩn bị Môi Trường và Triển Khai Code

Trước khi cấu hình trên Facebook, bạn cần đưa đoạn code này lên một máy chủ để nó có một URL công khai (Public URL) hoạt động 24/7. Theo khuyến nghị, bạn nên đẩy code lên GitHub và triển khai thông qua các dịch vụ như Railway.

1.
Tạo một thư mục dự án mới, khởi tạo Node.js (npm init -y) và cài đặt các thư viện cần thiết: npm install express node-fetch@2. Lưu ý: Nên dùng node-fetch phiên bản 2 để tương thích với cú pháp require.

2.
Lưu đoạn code của bạn vào file index.js.

3.
Đẩy toàn bộ code lên một repository trên GitHub.

4.
Đăng nhập vào Railway (hoặc dịch vụ tương tự), tạo một dự án mới và kết nối với repository GitHub vừa tạo.

5.
Trong phần cài đặt môi trường (Environment Variables) của Railway, bạn cần thêm các biến sau (giá trị sẽ lấy ở các bước tiếp theo):

•
PORT: (Railway tự động cấp, có thể bỏ qua)

•
VERIFY_TOKEN: Một chuỗi ký tự bất kỳ do bạn tự đặt (ví dụ: my_secret_token_123).

•
PAGE_ACCESS_TOKEN: Token truy cập Fanpage (lấy ở Bước 2).

•
OPENAI_API_KEY: API Key của Gemini (hoặc OpenAI).

•
MANUS_API_BASE_URL: URL API của Gemini (như trong code).



Sau khi triển khai thành công, Railway sẽ cung cấp cho bạn một URL công khai (ví dụ: https://your-app-name.up.railway.app ). URL Webhook của bạn sẽ là https://your-app-name.up.railway.app/webhook.

Bước 2: Tạo Ứng Dụng Trên Facebook Developers

1.
Truy cập Facebook for Developers và đăng nhập bằng tài khoản Facebook của bạn.

2.
Nhấp vào My Apps (Ứng dụng của tôi) ở góc trên bên phải, sau đó chọn Create App (Tạo ứng dụng).

3.
Chọn loại ứng dụng là Other (Khác) -> Business (Doanh nghiệp) và điền tên ứng dụng, email liên hệ.

4.
Trong bảng điều khiển ứng dụng, cuộn xuống phần Add products to your app (Thêm sản phẩm vào ứng dụng) và tìm Messenger, nhấp vào Set Up (Thiết lập).

Bước 3: Lấy Page Access Token

1.
Trong menu bên trái của phần Messenger, chọn API Setup (Cài đặt API).

2.
Cuộn xuống phần Access Tokens (Mã truy cập).

3.
Nhấp vào Add or Remove Pages (Thêm hoặc gỡ Trang) và chọn Fanpage mà bạn muốn tích hợp bot. Bạn sẽ cần cấp quyền cho ứng dụng truy cập vào trang này.

4.
Sau khi liên kết thành công, nhấp vào nút Generate Token (Tạo mã) bên cạnh tên Fanpage.

5.
Sao chép đoạn mã token dài này. Đây chính là giá trị cho biến môi trường PAGE_ACCESS_TOKEN. Hãy quay lại Railway và cập nhật biến này.

Bước 4: Cấu Hình Webhook

1.
Vẫn trong phần API Setup của Messenger, cuộn xuống phần Webhooks.

2.
Nhấp vào Add Callback URL (Thêm URL gọi lại).

3.
Một bảng hiện ra, bạn điền các thông tin sau:

•
Callback URL: Nhập URL Webhook bạn đã có ở Bước 1 (ví dụ: https://your-app-name.up.railway.app/webhook ). Đảm bảo URL phải bắt đầu bằng https://.

•
Verify Token: Nhập chính xác chuỗi ký tự bạn đã đặt cho biến VERIFY_TOKEN trên Railway (ví dụ: my_secret_token_123 ).



4.
Nhấp vào Verify and Save (Xác minh và lưu). Facebook sẽ gửi một request GET đến URL của bạn để kiểm tra. Nếu code của bạn hoạt động đúng và VERIFY_TOKEN khớp, quá trình này sẽ thành công.

5.
Sau khi lưu thành công, nhấp vào Add Subscriptions (Thêm đăng ký) hoặc Edit (Chỉnh sửa) bên cạnh tên Fanpage trong phần Webhooks.

6.
Đánh dấu tích vào ô messages (để nhận tin nhắn văn bản) và messaging_postbacks (nếu bạn dùng nút bấm), sau đó lưu lại.

Bước 5: Kiểm Tra và Hoàn Thiện

Bây giờ, bạn hãy dùng một tài khoản Facebook cá nhân (không phải tài khoản quản trị viên của Fanpage) để gửi tin nhắn đến Fanpage.
Nếu mọi thứ được cấu hình đúng:

1.
Facebook sẽ gửi dữ liệu tin nhắn đến Webhook của bạn.

2.
Code của bạn sẽ nhận tin nhắn, gửi cho Gemini API.

3.
Gemini trả về câu trả lời.

4.
Code của bạn dùng PAGE_ACCESS_TOKEN để gửi câu trả lời đó lại cho người dùng qua Messenger.

Lưu ý quan trọng: Ứng dụng Facebook của bạn hiện đang ở chế độ Development (Phát triển). Ở chế độ này, bot chỉ có thể trả lời tin nhắn từ những người có vai trò trong ứng dụng (Quản trị viên, Nhà phát triển, Người thử nghiệm). Để bot có thể trả lời bất kỳ ai, bạn cần chuyển ứng dụng sang chế độ Live (Trực tiếp) và gửi yêu cầu xét duyệt quyền pages_messaging cho Facebook. Quá trình xét duyệt có thể mất vài ngày.

3. Code Đề Xuất Đã Chỉnh Sửa

Dưới đây là phiên bản code đã được tinh chỉnh lại để khắc phục vấn đề nối chuỗi cứng nhắc và cải thiện logic xử lý:

JavaScript


const express = require("express");
const fetch = require("node-fetch");

const app = express();
const sessions = new Map();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("Bot Icon Central is Live!");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    console.log("Xác thực Webhook thành công!");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.status(403).send("Xác thực thất bại");
});

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const API_KEY = process.env.OPENAI_API_KEY; 
const BASE_URL = process.env.MANUS_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";

app.post("/webhook", async (req, res ) => {
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
          
          const fbRes = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: sender },
              message: { text: reply } // Đã bỏ phần nối chuỗi cứng nhắc
            } )
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
  if (!sessions.has(userId)) sessions.set(userId, { history: [], lastActive: Date.now() });
  const session = sessions.get(userId);
  session.lastActive = Date.now(); // Cập nhật thời gian hoạt động
  
  session.history.push({ role: "user", content: userText });
  if (session.history.length > 10) session.history.shift();

  // Đưa yêu cầu hẹn lịch vào system prompt để AI tự nhiên hơn
  const systemPrompt = "Bạn là Ngọc An – sale BĐS dự án Icon Central chuyên nghiệp. Trả lời ngắn gọn 2-3 câu, dùng 'dạ', 'em', 'anh/chị'. Tập trung tư vấn về nhà phố và shophouse. Nếu khách hàng có vẻ quan tâm, hãy khéo léo hỏi xem họ tiện đi xem thực tế lúc nào để sắp lịch.";

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

// Hàm dọn dẹp session cũ (chống tràn bộ nhớ cơ bản)
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    // Xóa session nếu không hoạt động quá 1 giờ (3600000 ms)
    if (now - session.lastActive > 3600000) {
      sessions.delete(userId);
    }
  }
}, 600000); // Chạy mỗi 10 phút

app.listen(PORT, "0.0.0.0", () => {
  console.log(`>>> BOT ĐÃ SẴN SÀNG TRÊN CỔNG: ${PORT}`);
});



