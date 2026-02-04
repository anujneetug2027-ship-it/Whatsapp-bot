import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Store pending replies that need manual sending
const pendingReplies = [];

/* -------- Health check -------- */
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "WhatsApp Hi-Bot",
    pendingReplies: pendingReplies.length,
    instruction: "Send 'Hi' to get 'hello' reply"
  });
});

/* -------- List pending replies -------- */
app.get("/pending", (req, res) => {
  res.json({
    count: pendingReplies.length,
    replies: pendingReplies
  });
});

/* -------- Clear pending replies -------- */
app.get("/clear", (req, res) => {
  const cleared = pendingReplies.length;
  pendingReplies.length = 0;
  res.json({
    message: `Cleared ${cleared} pending replies`,
    cleared: cleared
  });
});

/* -------- WhatsApp Webhook -------- */
app.post("/webhook", async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log("📥 WHATSAPP MESSAGE RECEIVED");
  console.log("Time:", new Date().toLocaleTimeString());
  
  try {
    const report = req.body.whatsapp_reports?.[0];
    if (!report) {
      console.log("No report found in webhook");
      return res.sendStatus(200);
    }

    const userNumber = report.from;
    const userMessage = report.body?.trim() || "";

    console.log(`👤 From: ${userNumber}`);
    console.log(`💬 Message: "${userMessage}"`);
    
    // Log full webhook for debugging
    console.log("Full webhook data:", JSON.stringify(req.body, null, 2));

    if (!userNumber || !userMessage) {
      console.log("Missing number or message");
      return res.sendStatus(200);
    }

    // Check if message contains "hi" (case-insensitive)
    const lowerMessage = userMessage.toLowerCase();
    if (lowerMessage.includes("hi") || lowerMessage.includes("hello") || lowerMessage.includes("hey")) {
      console.log("✅ Detected greeting message!");
      
      // Add to pending replies for manual sending
      const reply = {
        to: userNumber,
        message: "hello 👋",
        receivedAt: new Date().toISOString(),
        originalMessage: userMessage
      };
      
      pendingReplies.push(reply);
      
      console.log("\n" + "=".repeat(40));
      console.log("📝 REPLY QUEUED FOR MANUAL SENDING");
      console.log("=".repeat(40));
      console.log(`To: ${userNumber}`);
      console.log(`Reply: "hello 👋"`);
      console.log(`Time: ${new Date().toLocaleTimeString()}`);
      console.log("\n💡 HOW TO SEND MANUALLY:");
      console.log("1. Open WhatsApp Web/Desktop");
      console.log(`2. Send "hello 👋" to ${userNumber}`);
      console.log("3. Or use the Fast2SMS dashboard");
      console.log("\n📊 View all pending: GET /pending");
      console.log("🗑️  Clear pending: GET /clear");
      console.log("=".repeat(40));
      
    } else {
      console.log("ℹ️ Not a greeting message, ignoring");
    }

    console.log("=".repeat(60) + "\n");
    res.sendStatus(200);
    
  } catch (error) {
    console.error("💥 Error in webhook:", error.message);
    res.sendStatus(200);
  }
});

/* -------- Manual reply endpoint -------- */
app.post("/manual-reply", (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({
        error: "Number and message required",
        example: {
          number: "918928417703",
          message: "hello 👋"
        }
      });
    }
    
    const reply = {
      to: number,
      message: message,
      addedAt: new Date().toISOString(),
      source: "manual"
    };
    
    pendingReplies.push(reply);
    
    console.log(`\n📝 MANUAL REPLY ADDED:`);
    console.log(`To: ${number}`);
    console.log(`Message: ${message}`);
    
    res.json({
      success: true,
      message: "Reply queued for manual sending",
      reply: reply,
      totalPending: pendingReplies.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* -------- Start server -------- */
app.listen(PORT, () => {
  console.log(`
  =============================================
  🤖 WHATSAPP HI-BOT
  📍 Port: ${PORT}
  
  ✅ Ready to receive messages!
  
  🔧 ENDPOINTS:
     GET  /               - Health check
     GET  /pending        - View pending replies
     GET  /clear          - Clear pending replies
     POST /webhook        - WhatsApp webhook
     POST /manual-reply   - Add manual reply
  
  📱 HOW IT WORKS:
  1. User sends "Hi" to your WhatsApp
  2. Bot logs the reply needed
  3. You manually send "hello 👋"
  
  💡 MANUAL SENDING:
  1. Check /pending endpoint
  2. Open WhatsApp Web
  3. Send reply to shown number
  
  =============================================
  `);
});
