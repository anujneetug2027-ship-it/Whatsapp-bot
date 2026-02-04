import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { OpenRouter } from "@openrouter/sdk";

dotenv.config();

const app = express();
app.use(express.json());

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

const PORT = process.env.PORT || 3000;

/*
  Health check
*/
app.get("/", (req, res) => {
  res.send("WhatsApp bot running");
});

/*
  WhatsApp webhook
*/
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming:", req.body);

    // Adjust according to Fast2SMS payload
    const userNumber = req.body.from;
    const userMessage = req.body.message;

    if (!userNumber || !userMessage) {
      return res.sendStatus(200);
    }

    // Send message to chatbot
    const response = await openrouter.chat.send({
      model: "deepseek/deepseek-r1-0528:free",
      messages: [
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    const botReply =
      response.choices?.[0]?.message?.content ||
      "Sorry, I didn't understand.";

    console.log("Bot reply:", botReply);

    // Send reply via Fast2SMS
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
    console.error("Error:", err.message);
    res.sendStatus(200);
  }
});

app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
