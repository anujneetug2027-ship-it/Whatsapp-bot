import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.send("WhatsApp bot running v2.0");
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  console.log("📥 WEBHOOK RECEIVED ===================================");
  
  try {
    console.log("📋 Request Body:", JSON.stringify(req.body, null, 2));

    // Accept webhook verification from Fast2SMS
    if (req.body.event === "webhook_verify") {
      console.log("✅ Webhook verification received");
      return res.json({ status: "success" });
    }

    const report = req.body.whatsapp_reports?.[0];
    if (!report) {
      console.log("⚠️ No report found in webhook");
      return res.sendStatus(200);
    }

    const userNumber = report.from; // Should be like "918928417703"
    const userMessage = report.body;

    if (!userNumber || !userMessage) {
      console.log("⚠️ Missing user number or message");
      return res.sendStatus(200);
    }

    console.log(`👤 User: ${userNumber}`);
    console.log(`💬 Message: ${userMessage}`);

    /* -------- Step 1: Get AI Response -------- */
    let botReply = "I'm here to help! What would you like to know?";
    
    try {
      console.log("🤖 Calling AI...");
      const aiResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-r1-distill-qwen-32b:free",
          messages: [
            { 
              role: "system", 
              content: "You are a helpful WhatsApp assistant. Keep responses concise, friendly, and under 1000 characters." 
            },
            { role: "user", content: userMessage }
          ],
          max_tokens: 300
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 10000
        }
      );

      if (aiResponse.data?.choices?.[0]?.message?.content) {
        botReply = aiResponse.data.choices[0].message.content.trim();
        // Clean up and truncate for WhatsApp
        botReply = botReply.replace(/\n\s*\n/g, '\n'); // Remove excessive newlines
        if (botReply.length > 1000) {
          botReply = botReply.substring(0, 997) + "...";
        }
        console.log(`🤖 AI Response (${botReply.length} chars): ${botReply.substring(0, 100)}...`);
      }

    } catch (aiErr) {
      console.error("❌ AI Error:", aiErr.message);
      if (aiErr.response) {
        console.error("AI Response Status:", aiErr.response.status);
        console.error("AI Response Data:", JSON.stringify(aiErr.response.data));
      }
      botReply = `Thanks for your message! "${userMessage}" - I'll respond properly when my AI service is back.`;
    }

    /* -------- Step 2: Send via Fast2SMS WhatsApp API -------- */
    console.log("\n📤 SENDING TO FAST2SMS WHATSAPP API ===================");
    
    // Check API key
    if (!process.env.FAST2SMS_API_KEY) {
      console.error("❌ FAST2SMS_API_KEY is not set!");
      return res.sendStatus(200);
    }

    console.log(`🔑 API Key present: ${process.env.FAST2SMS_API_KEY.substring(0, 10)}...`);
    console.log(`📞 To: ${userNumber}`);
    console.log(`💬 Message preview: ${botReply.substring(0, 80)}...`);

    try {
      // IMPORTANT: Using Fast2SMS WhatsApp API endpoint
      const fast2smsData = {
        route: "whatsapp",  // This is crucial - must be "whatsapp" not "dlt"
        message: botReply,
        numbers: userNumber
      };

      console.log("📦 Fast2SMS Request Data:", JSON.stringify(fast2smsData, null, 2));

      const fast2smsResponse = await axios.post(
        "https://www.fast2sms.com/dev/whatsapp/send",  // WhatsApp-specific endpoint
        fast2smsData,
        {
          headers: {
            "authorization": process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }
      );

      console.log("✅ Fast2SMS Response Status:", fast2smsResponse.status);
      console.log("📄 Fast2SMS Response Data:", JSON.stringify(fast2smsResponse.data, null, 2));

      if (fast2smsResponse.data?.return === true) {
        console.log("🎉 WhatsApp message sent successfully!");
      } else {
        console.error("⚠️ Fast2SMS returned false/error:", fast2smsResponse.data);
        
        // Try alternative format if needed
        console.log("\n🔄 Trying alternative format...");
        try {
          const altResponse = await axios.post(
            "https://www.fast2sms.com/dev/whatsapp/send",
            {
              route: "whatsapp",
              message: botReply,
              numbers: `+${userNumber}`  // Try with + prefix
            },
            {
              headers: {
                "authorization": process.env.FAST2SMS_API_KEY,
                "Content-Type": "application/json"
              }
            }
          );
          console.log("Alternative response:", altResponse.data);
        } catch (altErr) {
          console.error("Alternative also failed:", altErr.message);
        }
      }

    } catch (sendErr) {
      console.error("\n🚨 FAST2SMS SEND ERROR =========================");
      console.error("Error message:", sendErr.message);
      
      if (sendErr.response) {
        console.error("Status:", sendErr.response.status);
        console.error("Headers:", sendErr.response.headers);
        console.error("Response data:", JSON.stringify(sendErr.response.data, null, 2));
        
        // If 401/403, API key issue
        if (sendErr.response.status === 401 || sendErr.response.status === 403) {
          console.error("❌ API KEY INVALID OR EXPIRED!");
          console.error("Please check your Fast2SMS API key in dashboard.");
        }
        
        // If 400, bad request
        if (sendErr.response.status === 400) {
          console.error("❌ Bad request - check parameters");
        }
      }
      
      console.error("Full error:", sendErr);
    }

    console.log("====================================================\n");
    res.sendStatus(200);
    
  } catch (err) {
    console.error("💥 Unhandled error in webhook:", err.message);
    console.error(err.stack);
    res.sendStatus(200);
  }
});

/* -------- Test Endpoints -------- */
app.post("/test-fast2sms", async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({ 
        error: "Please provide number and message in body",
        example: {
          number: "918928417703",
          message: "Test message from bot"
        }
      });
    }

    console.log(`🔧 Testing Fast2SMS with number: ${number}`);
    
    const response = await axios.post(
      "https://www.fast2sms.com/dev/whatsapp/send",
      {
        route: "whatsapp",
        message: message,
        numbers: number
      },
      {
        headers: {
          "authorization": process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      success: true,
      message: "Test request sent",
      yourInput: { number, message },
      fast2smsResponse: response.data,
      note: "Check server logs for detailed response"
    });
    
  } catch (error) {
    console.error("Test error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      responseData: error.response?.data
    });
  }
});

/* -------- Direct WhatsApp Test -------- */
app.get("/send-test", async (req, res) => {
  try {
    const testNumber = "918928417703"; // Replace with your number
    const testMessage = "🚀 Bot is working! Time: " + new Date().toLocaleTimeString();
    
    const response = await axios.post(
      "https://www.fast2sms.com/dev/whatsapp/send",
      {
        route: "whatsapp",
        message: testMessage,
        numbers: testNumber
      },
      {
        headers: {
          "authorization": process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      success: true,
      message: "Test WhatsApp sent",
      to: testNumber,
      fast2smsResponse: response.data
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/* -------- Check API Key -------- */
app.get("/check-key", (req, res) => {
  const key = process.env.FAST2SMS_API_KEY;
  res.json({
    hasKey: !!key,
    keyPreview: key ? `${key.substring(0, 10)}...${key.substring(key.length - 4)}` : null,
    keyLength: key ? key.length : 0
  });
});

/* -------- Start server -------- */
app.listen(PORT, () => {
  console.log(`
  ===========================================
  🚀 WhatsApp Bot Server v2.0
  📍 Port: ${PORT}
  🌐 Health: http://localhost:${PORT}/
  
  🔧 Test Endpoints:
    1. GET  /check-key          - Check API key
    2. GET  /send-test          - Send test WhatsApp
    3. POST /test-fast2sms      - Test with custom data
  
  📞 Webhook: POST /webhook
  ===========================================
  `);
});
