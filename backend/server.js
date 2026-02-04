import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.send("WhatsApp bot running - Simple Manual Reply");
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  console.log("\n" + "=".repeat(50));
  console.log("📥 WEBHOOK RECEIVED");
  
  try {
    const report = req.body.whatsapp_reports?.[0];
    if (!report) {
      console.log("No report found");
      return res.sendStatus(200);
    }

    const userNumber = report.from;
    const userMessage = report.body?.trim() || "";

    console.log(`From: ${userNumber}`);
    console.log(`Message: "${userMessage}"`);

    if (!userNumber || !userMessage) {
      console.log("Missing number or message");
      return res.sendStatus(200);
    }

    // Check if message contains "Hi" (case-insensitive)
    if (userMessage.toLowerCase().includes("hi")) {
      console.log("✅ Detected 'Hi' message, will send 'hello'");
      
      // Try to send via Fast2SMS API
      try {
        const response = await axios.get(
          "https://www.fast2sms.com/dev/bulkV2",
          {
            params: {
              authorization: process.env.FAST2SMS_API_KEY,
              sender_id: 'FSTSMS',
              message: 'hello',
              route: 'q',
              numbers: userNumber,
              flash: 0
            }
          }
        );
        
        console.log("✅ Sent 'hello' via Fast2SMS");
        console.log("Response:", response.data);
        
      } catch (error) {
        console.error("❌ Failed to send via Fast2SMS:", error.message);
        
        // If Fast2SMS fails, log the message for manual sending
        console.log("\n📝 MANUAL SENDING REQUIRED:");
        console.log(`Send "hello" to: ${userNumber}`);
        console.log("\nTo send manually:");
        console.log("1. Open WhatsApp");
        console.log(`2. Send "hello" to ${userNumber}`);
        console.log("3. Or use Fast2SMS dashboard");
      }
    } else {
      console.log("❌ Message doesn't contain 'Hi', ignoring");
    }

    console.log("=".repeat(50) + "\n");
    res.sendStatus(200);
    
  } catch (err) {
    console.error("Error:", err.message);
    res.sendStatus(200);
  }
});

/* -------- Manual trigger endpoint -------- */
app.get("/trigger-hello", async (req, res) => {
  try {
    const testNumber = "918928417703"; // Your number
    
    console.log(`\n🔧 MANUAL TRIGGER: Sending "hello" to ${testNumber}`);
    
    const response = await axios.get(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        params: {
          authorization: process.env.FAST2SMS_API_KEY,
          sender_id: 'FSTSMS',
          message: 'hello',
          route: 'q',
          numbers: testNumber,
          flash: 0
        }
      }
    );
    
    res.json({
      success: true,
      message: `Sent "hello" to ${testNumber}`,
      response: response.data
    });
    
  } catch (error) {
    console.error("Manual trigger error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/* -------- Start server -------- */
app.listen(PORT, () => {
  console.log(`
  ==========================================
  🤖 SIMPLE WHATSAPP BOT
  📍 Port: ${PORT}
  
  ✅ Ready to respond to "Hi" with "hello"
  
  🔧 Endpoints:
     GET  /              - Health check
     POST /webhook       - WhatsApp webhook
     GET  /trigger-hello - Manual test send
  
  📱 How it works:
  1. User sends "Hi" (any case) to your WhatsApp
  2. Bot tries to send "hello" via Fast2SMS
  3. If fails, logs for manual sending
  
  ==========================================
  `);
});
