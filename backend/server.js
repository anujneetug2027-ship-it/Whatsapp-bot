import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import querystring from "querystring";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Store conversation history
const userConversations = new Map();

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.json({
    status: "active",
    service: "WhatsApp Bot",
    version: "3.0"
  });
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  console.log("\n" + "=".repeat(50));
  console.log("📥 NEW MESSAGE RECEIVED");
  
  try {
    const report = req.body.whatsapp_reports?.[0];
    if (!report) {
      console.log("⚠️ No valid report in webhook");
      return res.sendStatus(200);
    }

    const userNumber = report.from; // Should be "918928417703"
    const userMessage = report.body?.trim();

    if (!userNumber || !userMessage) {
      console.log("⚠️ Missing user number or message");
      return res.sendStatus(200);
    }

    console.log(`👤 From: ${userNumber}`);
    console.log(`💬 Message: "${userMessage}"`);

    // Get or create conversation history for this user
    if (!userConversations.has(userNumber)) {
      userConversations.set(userNumber, []);
    }
    const conversation = userConversations.get(userNumber);
    
    // Add user message to conversation
    conversation.push({ role: "user", content: userMessage });
    
    // Keep only last 10 messages to manage token usage
    if (conversation.length > 10) {
      conversation.splice(0, conversation.length - 10);
    }

    /* -------- Get AI Response -------- */
    let botReply = "Thanks for your message! I'm processing it now.";
    
    try {
      console.log("🤖 Calling AI...");
      
      const aiResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "deepseek/deepseek-chat-v1-1216:free",
          messages: [
            {
              role: "system",
              content: "You are a helpful WhatsApp assistant. Keep responses concise, friendly, and under 300 characters. Use emojis occasionally to make it engaging. If the user greets you, greet back warmly."
            },
            ...conversation.slice(-5) // Send last 5 messages for context
          ],
          max_tokens: 150,
          temperature: 0.7
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://your-bot.com",
            "X-Title": "WhatsApp AI Bot"
          },
          timeout: 10000
        }
      );

      if (aiResponse.data?.choices?.[0]?.message?.content) {
        botReply = aiResponse.data.choices[0].message.content.trim();
        
        // Clean up response
        botReply = botReply.replace(/\n\s*\n/g, '\n'); // Remove excessive newlines
        
        // Truncate if too long
        if (botReply.length > 1000) {
          botReply = botReply.substring(0, 997) + "...";
        }
        
        // Add AI response to conversation
        conversation.push({ role: "assistant", content: botReply });
        
        console.log(`✅ AI Response (${botReply.length} chars):`);
        console.log(botReply.substring(0, 150) + (botReply.length > 150 ? "..." : ""));
      }
    } catch (aiErr) {
      console.error("❌ AI Error:", aiErr.message);
      if (aiErr.response?.data) {
        console.error("AI Error Details:", JSON.stringify(aiErr.response.data, null, 2));
      }
      
      // Fallback responses based on user message
      const lowerMessage = userMessage.toLowerCase();
      if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
        botReply = "👋 Hello! How can I help you today?";
      } else if (lowerMessage.includes('thank')) {
        botReply = "You're welcome! 😊 Is there anything else I can help with?";
      } else {
        botReply = "I received your message! Unfortunately, my AI brain is taking a short break. Please try again in a moment! 🤖";
      }
    }

    /* -------- Send Response via Fast2SMS -------- */
    console.log("\n📤 ATTEMPTING TO SEND REPLY...");
    
    if (!process.env.FAST2SMS_API_KEY) {
      console.error("❌ FAST2SMS_API_KEY is not configured!");
      console.log("Please add your Fast2SMS API key to .env file:");
      console.log("FAST2SMS_API_KEY=your_api_key_here");
      return res.sendStatus(200);
    }

    // Display API key info (first few chars only for security)
    const apiKeyPreview = process.env.FAST2SMS_API_KEY.substring(0, 10) + "...";
    console.log(`🔑 Using API Key: ${apiKeyPreview}`);
    
    // Try Method 1: Current Fast2SMS API
    try {
      console.log("🔄 Method 1: Trying current API...");
      
      // IMPORTANT: This is the correct format as per Fast2SMS documentation
      const response = await axios.post(
        "https://www.fast2sms.com/dev/bulkV2",
        {
          sender_id: "FSTSMS", // This is important
          message: botReply,
          route: "v3", // Try v3 route
          numbers: userNumber
        },
        {
          headers: {
            "authorization": process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      console.log("✅ Method 1 Response:", response.data);
      
      if (response.data?.return === true || response.data?.message_id) {
        console.log("🎉 Message sent successfully via Fast2SMS!");
        return res.sendStatus(200);
      }
      
    } catch (method1Err) {
      console.error("❌ Method 1 Failed:", method1Err.message);
      if (method1Err.response) {
        console.error("Status:", method1Err.response.status);
        console.error("Data:", method1Err.response.data);
      }
    }

    // Try Method 2: Alternative format
    try {
      console.log("🔄 Method 2: Trying alternative format...");
      
      const response = await axios({
        method: 'GET',
        url: 'https://www.fast2sms.com/dev/bulkV2',
        params: {
          authorization: process.env.FAST2SMS_API_KEY,
          sender_id: 'FSTSMS',
          message: botReply,
          route: 'q', // Quick route
          numbers: userNumber,
          flash: 0
        }
      });

      console.log("✅ Method 2 Response:", response.data);
      
    } catch (method2Err) {
      console.error("❌ Method 2 Failed:", method2Err.message);
    }

    // Try Method 3: Direct SMS as last resort
    try {
      console.log("🔄 Method 3: Trying direct SMS...");
      
      // Sometimes the issue is with the number format
      const cleanNumber = userNumber.replace('+', '').replace('91', '').substring(0, 10);
      
      const response = await axios.get(
        `https://www.fast2sms.com/dev/bulk`,
        {
          params: {
            authorization: process.env.FAST2SMS_API_KEY,
            sender_id: 'FSTSMS',
            message: `[WhatsApp] ${botReply}`,
            route: 'p', // Promotional route
            numbers: cleanNumber,
            language: 'english',
            flash: 0
          }
        }
      );

      console.log("✅ Method 3 Response:", response.data);
      
    } catch (method3Err) {
      console.error("❌ Method 3 Failed:", method3Err.message);
    }

    console.log("\n" + "=".repeat(50));
    res.sendStatus(200);
    
  } catch (err) {
    console.error("💥 Unexpected error:", err.message);
    console.error(err.stack);
    res.sendStatus(200);
  }
});

/* -------- DIAGNOSTIC ENDPOINTS -------- */

// Test Fast2SMS API directly
app.get("/diagnose", async (req, res) => {
  try {
    const apiKey = process.env.FAST2SMS_API_KEY;
    const number = "918928417703"; // Your test number
    
    console.log("\n🔍 DIAGNOSING FAST2SMS API...");
    console.log(`API Key present: ${!!apiKey}`);
    console.log(`API Key preview: ${apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING'}`);
    console.log(`Test number: ${number}`);
    
    // Test 1: Check balance
    console.log("\n💰 Checking balance...");
    try {
      const balanceRes = await axios.get(
        "https://www.fast2sms.com/dev/wallet",
        {
          params: { authorization: apiKey }
        }
      );
      console.log("Balance API Response:", balanceRes.data);
    } catch (balanceErr) {
      console.error("Balance check failed:", balanceErr.message);
    }
    
    // Test 2: Try to send test SMS
    console.log("\n📤 Testing send...");
    try {
      const sendRes = await axios.get(
        "https://www.fast2sms.com/dev/bulkV2",
        {
          params: {
            authorization: apiKey,
            sender_id: 'FSTSMS',
            message: 'Test from WhatsApp Bot',
            route: 'q',
            numbers: number,
            flash: 0
          }
        }
      );
      console.log("Send Test Response:", sendRes.data);
    } catch (sendErr) {
      console.error("Send test failed:", sendErr.message);
      if (sendErr.response) {
        console.error("Response data:", sendErr.response.data);
      }
    }
    
    res.json({
      status: "Diagnosis complete",
      apiKeyPresent: !!apiKey,
      checkConsole: true
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simple send test
app.post("/send-test", async (req, res) => {
  try {
    const { number = "918928417703", message = "Test from bot" } = req.body;
    
    console.log(`\n🧪 SEND TEST: ${number} -> "${message}"`);
    
    const response = await axios.get(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        params: {
          authorization: process.env.FAST2SMS_API_KEY,
          sender_id: 'FSTSMS',
          message: message,
          route: 'q',
          numbers: number,
          flash: 0
        }
      }
    );
    
    res.json({
      success: true,
      message: "Test sent",
      fast2smsResponse: response.data
    });
    
  } catch (error) {
    console.error("Send test error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/* -------- Server Start -------- */
app.listen(PORT, () => {
  console.log(`
  ===========================================
  🚀 WHATSAPP BOT SERVER v3.0
  📍 Port: ${PORT}
  
  🔧 DIAGNOSTIC ENDPOINTS:
    1. GET  /diagnose     - Full API diagnosis
    2. POST /send-test    - Send test message
    3. GET  /             - Health check
    
  📞 Webhook: POST /webhook
  ===========================================
  `);
  
  // Auto-diagnose on startup
  console.log("\n🔍 Running auto-diagnosis...");
  console.log(`OpenRouter API Key: ${process.env.OPENROUTER_API_KEY ? "✅ Set" : "❌ Missing"}`);
  console.log(`Fast2SMS API Key: ${process.env.FAST2SMS_API_KEY ? "✅ Set" : "❌ Missing"}`);
  
  if (!process.env.FAST2SMS_API_KEY) {
    console.log("\n⚠️  IMPORTANT: FAST2SMS_API_KEY is not set!");
    console.log("Create a .env file with:");
    console.log("FAST2SMS_API_KEY=your_fast2sms_key_here");
    console.log("OPENROUTER_API_KEY=your_openrouter_key_here");
  }
});
