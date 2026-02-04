import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.send("WhatsApp bot running - Fast2SMS Fix");
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  console.log("📥 WEBHOOK RECEIVED");
  
  try {
    const report = req.body.whatsapp_reports?.[0];
    if (!report) return res.sendStatus(200);

    const userNumber = report.from;
    const userMessage = report.body;

    if (!userNumber || !userMessage) return res.sendStatus(200);

    console.log(`👤 ${userNumber}: ${userMessage}`);

    /* -------- Get AI Response -------- */
    let botReply = "Thanks for your message! I'm here to help.";
    
    try {
      const aiResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-r1-distill-qwen-32b:free",
          messages: [
            { 
              role: "system", 
              content: "You are a helpful WhatsApp assistant. Keep responses concise and under 500 characters." 
            },
            { role: "user", content: userMessage }
          ],
          max_tokens: 200
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (aiResponse.data?.choices?.[0]?.message?.content) {
        botReply = aiResponse.data.choices[0].message.content.trim();
        if (botReply.length > 1000) {
          botReply = botReply.substring(0, 997) + "...";
        }
      }
    } catch (aiErr) {
      console.error("AI Error:", aiErr.message);
    }

    console.log(`🤖 Bot Reply: ${botReply.substring(0, 100)}...`);

    /* -------- OPTION 1: Try Fast2SMS SMS API instead -------- */
    console.log("🔄 Trying to send via SMS API...");
    
    try {
      // Option 1A: Try the SMS API (since WhatsApp API returns 404)
      const smsResponse = await axios.get(
        `https://www.fast2sms.com/dev/bulkV2`,
        {
          params: {
            authorization: process.env.FAST2SMS_API_KEY,
            route: "q", // "q" for quick route
            message: `WhatsApp Reply: ${botReply}`,
            numbers: userNumber,
            flash: 0
          }
        }
      );

      console.log("✅ SMS API Response:", smsResponse.data);
      
      if (smsResponse.data?.return === true) {
        console.log("📱 Message sent via SMS API");
      }
      
    } catch (smsErr) {
      console.error("❌ SMS API failed:", smsErr.message);
      
      /* -------- OPTION 2: Try different Fast2SMS endpoints -------- */
      console.log("🔄 Trying alternative endpoints...");
      
      try {
        // Option 2A: Try with v3 endpoint
        const v3Response = await axios.post(
          "https://www.fast2sms.com/dev/api/v3/sms",
          {
            route: "q",
            sender_id: "FSTSMS",
            message: `WA: ${botReply}`,
            language: "english",
            flash: 0,
            numbers: userNumber
          },
          {
            headers: {
              "authorization": process.env.FAST2SMS_API_KEY
            }
          }
        );
        
        console.log("✅ v3 API Response:", v3Response.data);
      } catch (v3Err) {
        console.error("❌ v3 API failed:", v3Err.message);
      }
    }

    /* -------- ALTERNATIVE: Use Twilio if available -------- */
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      console.log("🔄 Trying Twilio WhatsApp...");
      try {
        const client = require('twilio')(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        
        await client.messages.create({
          body: botReply,
          from: 'whatsapp:+14155238886', // Twilio sandbox number
          to: `whatsapp:+${userNumber}`
        });
        
        console.log("✅ Sent via Twilio");
      } catch (twilioErr) {
        console.error("❌ Twilio failed:", twilioErr.message);
      }
    }

    res.sendStatus(200);
    
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.sendStatus(200);
  }
});

/* -------- Test SMS API -------- */
app.get("/test-sms", async (req, res) => {
  try {
    const response = await axios.get(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        params: {
          authorization: process.env.FAST2SMS_API_KEY,
          route: "q",
          message: "Test message from bot",
          numbers: "918928417703", // Your number
          flash: 0
        }
      }
    );

    res.json({
      success: true,
      message: "Test sent via SMS API",
      response: response.data
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      response: error.response?.data
    });
  }
});

/* -------- Check Fast2SMS Balance -------- */
app.get("/check-balance", async (req, res) => {
  try {
    const response = await axios.get(
      "https://www.fast2sms.com/dev/wallet",
      {
        params: {
          authorization: process.env.FAST2SMS_API_KEY
        }
      }
    );

    res.json({
      success: true,
      balance: response.data
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* -------- Manual Send Endpoint -------- */
app.post("/send-manual", async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({ error: "Number and message required" });
    }

    console.log(`Manual send to ${number}: ${message}`);
    
    // Try multiple methods
    const results = [];
    
    // Method 1: SMS API
    try {
      const smsRes = await axios.get(
        "https://www.fast2sms.com/dev/bulkV2",
        {
          params: {
            authorization: process.env.FAST2SMS_API_KEY,
            route: "q",
            message: message,
            numbers: number,
            flash: 0
          }
        }
      );
      results.push({ method: "SMS API", success: true, data: smsRes.data });
    } catch (err) {
      results.push({ method: "SMS API", success: false, error: err.message });
    }
    
    res.json({
      success: true,
      results: results
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`
  ===========================================
  🚀 WhatsApp Bot Server
  📍 Port: ${PORT}
  
  🔧 Test Endpoints:
    1. GET  /test-sms       - Test SMS API
    2. GET  /check-balance  - Check Fast2SMS balance
    3. POST /send-manual    - Manual send
    
  📞 Webhook: POST /webhook
  ===========================================
  `);
});
