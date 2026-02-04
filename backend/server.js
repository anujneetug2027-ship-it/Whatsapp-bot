import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { OpenRouter } from "@openrouter/sdk";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ---------- OpenRouter Setup ---------- */
const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

/* ---------- Health Route ---------- */
app.get("/", (req, res) => {
  res.send("WhatsApp bot running");
});

/* ---------- WhatsApp Webhook ---------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming:", JSON.stringify(req.body, null, 2));

    // Fast2SMS simplified payload
    const report = req.body.whatsapp_reports?.[0];
    if (!report) return res.sendStatus(200);

    const userNumber = report.from;
    const userMessage = report.body;

    if (!userNumber || !userMessage) {
      return res.sendStatus(200);
    }

    console.log("User:", userNumber, "Message:", userMessage);

    /* ---------- Ask AI ---------- */
    const aiResponse = await openrouter.chat.send({
      model: "deepseek/deepseek-r1-0528:free",
      messages: [
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    const botReply =
      aiResponse.choices?.[0]?.message?.content ||
      "Sorry, I didn't understand.";

    console.log("Bot reply:", botReply);

    /* ---------- Send reply via Fast2SMS ---------- */
    await axios.post(
      "https://www.fast2sms.com/dev/whatsapp/send",
      {
        message: botReply,
        numbers: [userNumber]
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* ---------- Start Server ---------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
