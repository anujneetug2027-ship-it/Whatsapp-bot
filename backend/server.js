import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Initialize Twilio client (will be null if credentials missing)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log("✅ Twilio client initialized");
} else {
  console.log("⚠️ Twilio credentials not set - using manual mode");
}

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "WhatsApp Bot",
    twilio: !!twilioClient,
    instruction: "Send 'Hi' to get 'hello' reply"
  });
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  console.log("\n" + "=".repeat(50));
  console.log("📥 WHATSAPP MESSAGE RECEIVED");
  
  try {
    // Log the full request for debugging
    console.log("Full request:", JSON.stringify(req.body, null, 2));
    
    const report = req.body.whatsapp_reports?.[0];
    if (!report) {
      console.log("⚠️ No valid message found");
      return res.sendStatus(200);
    }

    const userNumber = report.from; // Format: 918928417703
    const userMessage = report.body?.trim() || "";

    console.log(`👤 From: ${userNumber}`);
    console.log(`💬 Message: "${userMessage}"`);

    if (!userNumber || !userMessage) {
      console.log("⚠️ Missing data");
      return res.sendStatus(200);
    }

    // Check if message contains "hi" (case-insensitive)
    if (userMessage.toLowerCase().includes("hi")) {
      console.log("✅ Detected 'Hi' message");
      
      // Format number for Twilio: +918928417703
      const formattedNumber = `+${userNumber}`;
      
      // Try to send via Twilio
      if (twilioClient) {
        try {
          console.log(`📤 Attempting to send via Twilio to: ${formattedNumber}`);
          
          const message = await twilioClient.messages.create({
            body: 'hello 👋',
            from: 'whatsapp:+14155238886', // Twilio sandbox number
            to: `whatsapp:${formattedNumber}`
          });
          
          console.log("✅ Twilio message sent successfully!");
          console.log(`Message SID: ${message.sid}`);
          console.log(`Status: ${message.status}`);
          
        } catch (twilioError) {
          console.error("❌ Twilio error:", twilioError.message);
          logManualInstructions(userNumber);
        }
      } else {
        // Twilio not configured, show manual instructions
        logManualInstructions(userNumber);
      }
    } else {
      console.log("ℹ️ Message doesn't contain 'Hi', ignoring");
    }

    console.log("=".repeat(50));
    res.sendStatus(200);
    
  } catch (error) {
    console.error("💥 Unexpected error:", error.message);
    res.sendStatus(200);
  }
});

/* -------- Helper function -------- */
function logManualInstructions(number) {
  console.log("\n📝 MANUAL REPLY REQUIRED:");
  console.log("=".repeat(30));
  console.log(`📱 Send "hello" to this number:`);
  console.log(`   ${number}`);
  console.log("\n💡 Quick ways to send:");
  console.log("1. Open WhatsApp Web/Desktop");
  console.log("2. Search for this number");
  console.log("3. Send 'hello'");
  console.log("\n🔧 Or configure Twilio:");
  console.log("1. Sign up at twilio.com (free trial)");
  console.log("2. Get WhatsApp Sandbox number");
  console.log("3. Add credentials to .env file");
  console.log("=".repeat(30));
}

/* -------- Test endpoint -------- */
app.get("/test-send", async (req, res) => {
  try {
    const testNumber = "+918928417703"; // Your number with +
    
    if (!twilioClient) {
      return res.status(400).json({
        success: false,
        message: "Twilio not configured",
        instructions: "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env"
      });
    }
    
    console.log(`\n🔧 TEST: Sending to ${testNumber}`);
    
    const message = await twilioClient.messages.create({
      body: 'Test hello from bot! 🤖',
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${testNumber}`
    });
    
    res.json({
      success: true,
      message: "Test sent via Twilio",
      sid: message.sid,
      status: message.status,
      to: testNumber
    });
    
  } catch (error) {
    console.error("Test error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

/* -------- Start server -------- */
app.listen(PORT, () => {
  console.log(`
  =============================================
  🤖 WHATSAPP AUTO-REPLY BOT
  📍 Port: ${PORT}
  
  ${twilioClient ? '✅ TWILIO CONFIGURED' : '⚠️ MANUAL MODE'}
  
  🔧 Endpoints:
     GET  /            - Health check
     POST /webhook     - WhatsApp webhook
     GET  /test-send   - Test Twilio send
  
  📱 How to use:
  1. User sends "Hi" to your WhatsApp
  2. Bot replies with "hello"
  
  ⚡ Setup Twilio (Recommended):
  1. Go to twilio.com/try-twilio
  2. Sign up for free account
  3. Get $15 free credit
  4. Enable WhatsApp Sandbox
  5. Add to .env file:
     TWILIO_ACCOUNT_SID=your_sid
     TWILIO_AUTH_TOKEN=your_token
  
  =============================================
  `);
  
  if (!twilioClient) {
    console.log("\n📋 .env FILE TEMPLATE:");
    console.log(`
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
PORT=3000
    `);
  }
});
