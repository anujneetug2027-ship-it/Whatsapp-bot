import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.send("WhatsApp bot running");
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  try {
    console.log("=== WEBHOOK CALLED ===");
    console.log("Incoming:", JSON.stringify(req.body, null, 2));

    // Accept webhook verification from Fast2SMS
    if (req.body.event === "webhook_verify") {
      console.log("Webhook verification received");
      return res.json({ status: "success" });
    }

    const report = req.body.whatsapp_reports?.[0];
    if (!report) {
      console.log("No report found in webhook");
      return res.sendStatus(200);
    }

    const userNumber = report.from;
    const userMessage = report.body;

    if (!userNumber || !userMessage) {
      console.log("Missing user number or message");
      return res.sendStatus(200);
    }

    console.log("User:", userNumber, "Message:", userMessage);

    /* -------- Ask AI -------- */
    let botReply = "Sorry, I couldn't process your request. Please try again later.";

    try {
      console.log("Calling OpenRouter AI...");
      const aiResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-r1-distill-qwen-32b:free",
          messages: [
            { 
              role: "system", 
              content: "You are a helpful WhatsApp assistant. Keep responses concise and under 1000 characters." 
            },
            { role: "user", content: userMessage }
          ],
          max_tokens: 500
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000", // Optional but good for OpenRouter
            "X-Title": "WhatsApp Bot"
          },
          timeout: 30000 // 30 seconds timeout
        }
      );

      console.log("AI Response received:", aiResponse.status);
      
      if (aiResponse.data?.choices?.[0]?.message?.content) {
        botReply = aiResponse.data.choices[0].message.content.trim();
        
        // Truncate if too long for WhatsApp
        if (botReply.length > 1000) {
          botReply = botReply.substring(0, 997) + "...";
        }
        
        console.log("Bot reply length:", botReply.length);
      } else {
        console.log("No content in AI response:", aiResponse.data);
      }

    } catch (aiErr) {
      console.error("AI Error:", aiErr.message);
      if (aiErr.response) {
        console.error("AI Response Error Data:", aiErr.response.data);
        console.error("AI Response Status:", aiErr.response.status);
      }
      botReply = "I'm having trouble connecting to my brain right now. Please try again in a moment.";
    }

    console.log("Final bot reply:", botReply);

    /* -------- Send reply via Fast2SMS -------- */
    if (!process.env.FAST2SMS_API_KEY) {
      console.error("FAST2SMS_API_KEY is not set in environment variables");
      return res.sendStatus(200);
    }

    try {
      console.log("Sending to Fast2SMS...");
      console.log("Number:", userNumber);
      console.log("Message preview:", botReply.substring(0, 100));
      
      const fast2smsResponse = await axios.post(
        "https://www.fast2sms.com/dev/whatsapp/send",
        {
          route: "whatsapp",
          message: botReply,
          numbers: userNumber
        },
        {
          headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      console.log("Fast2SMS Response Status:", fast2smsResponse.status);
      console.log("Fast2SMS Response Data:", fast2smsResponse.data);

      if (fast2smsResponse.data?.return === true) {
        console.log("✅ Message sent successfully via Fast2SMS");
      } else {
        console.error("❌ Fast2SMS returned false:", fast2smsResponse.data);
      }

    } catch (sendErr) {
      console.error("🚨 Fast2SMS Send Error:");
      console.error("Error Message:", sendErr.message);
      if (sendErr.response) {
        console.error("Status Code:", sendErr.response.status);
        console.error("Response Data:", sendErr.response.data);
        console.error("Response Headers:", sendErr.response.headers);
      }
      console.error("Full Error:", sendErr);
    }

    res.sendStatus(200);
    
  } catch (err) {
    console.error("🚨 Unhandled Webhook Error:", err.message);
    console.error("Stack:", err.stack);
    res.sendStatus(200); // Always return 200 to Fast2SMS
  }
});

/* -------- Test Endpoint (for debugging) -------- */
app.post("/test-send", async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({ error: "Number and message required" });
    }

    const response = await axios.post(
      "https://www.fast2sms.com/dev/whatsapp/send",
      {
        route: "whatsapp",
        message: message,
        numbers: number
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      success: true,
      fast2smsResponse: response.data
    });
    
  } catch (error) {
    console.error("Test send error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

/* -------- Start server -------- */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📞 Health check: http://localhost:${PORT}`);
  console.log(`🔧 Test endpoint: POST http://localhost:${PORT}/test-send`);
});
