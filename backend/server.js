import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { OpenRouter } from "@openrouter/sdk";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.send("WhatsApp bot running");
});

/* -------- Webhook -------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming:", JSON.stringify(req.body, null, 2));

    const report = req.body.whatsapp_reports?.[0];
    if (!report) return res.sendStatus(200);

    const userNumber = report.from;
    const userMessage = report.body;

    console.log("User:", userNumber, "Message:", userMessage);

    /* ---- Ask AI ---- */
    let botReply = "Sorry, something went wrong.";

    try {
      const aiResponse = await openrouter.chat.send({
        model: "deepseek/deepseek-r1-0528:free",
        messages: [
          { role: "user", content: userMessage }
        ]
      });

      console.log("AI raw response:", JSON.stringify(aiResponse, null, 2));

      botReply =
        aiResponse?.choices?.[0]?.message?.content ||
        aiResponse?.choices?.[0]?.text ||
        "I didn't understand that.";

    } catch (aiErr) {
      console.error("AI error:", aiErr.message);
    }

    console.log("Bot reply:", botReply);

    /* ---- Send reply ---- */
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
    console.error("Webhook error:", err.message);
    res.sendStatus(200);
  }
});

/* -------- Start server -------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
