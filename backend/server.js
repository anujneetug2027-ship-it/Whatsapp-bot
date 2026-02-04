import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* -------- Health -------- */
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

    /* -------- Ask AI -------- */
    let botReply = "Sorry, something went wrong.";

    try {
      const aiResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-r1-0528:free",
          messages: [
            { role: "user", content: userMessage }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      botReply =
        aiResponse.data?.choices?.[0]?.message?.content ||
        "I didn't understand that.";

    } catch (aiErr) {
      console.error("AI error:", aiErr.response?.data || aiErr.message);
    }

    console.log("Bot reply:", botReply);

    /* -------- Send WhatsApp reply -------- */
    try {
      await axios.post(
        "https://www.fast2sms.com/dev/whatsapp/send",
        {
          message: botReply,
          numbers: userNumber
        },
        {
          headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (sendErr) {
      console.error("Send error:", sendErr.response?.data || sendErr.message);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.sendStatus(200);
  }
});

/* -------- Start -------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
