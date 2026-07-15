require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Load from .env file
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

// Groq model to use
const GROQ_MODEL = "llama-3.1-8b-instant";

console.log("✅ Environment loaded");
console.log(`📱 Phone Number ID: ${PHONE_NUMBER_ID}`);
console.log(`🤖 Groq Model: ${GROQ_MODEL}`);

// ============================================================
// 1. WEBHOOK VERIFICATION (Meta requires this)
// ============================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook verification request received");
  console.log(`   Mode: ${mode}`);
  console.log(`   Token provided: ${token}`);
  console.log(`   Expected token: ${WEBHOOK_VERIFY_TOKEN}`);

  if (mode && token === WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook verification failed!");
    res.sendStatus(403);
  }
});

// ============================================================
// 2. RECEIVE INCOMING MESSAGES FROM WHATSAPP
// ============================================================
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // Send 200 OK immediately to Meta
  res.sendStatus(200);

  // Check if this is a message event
  if (body.object) {
    try {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        // Extract message details
        const phoneNumberId =
          body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = body.entry[0].changes[0].value.messages[0].from;
        const msgBody = body.entry[0].changes[0].value.messages[0].text.body;
        const messageId = body.entry[0].changes[0].value.messages[0].id;

        console.log("\n📨 Incoming message:");
        console.log(`   From: ${from}`);
        console.log(`   Message: ${msgBody}`);
        console.log(`   Message ID: ${messageId}`);

        // Mark message as read
        await markMessageAsRead(phoneNumberId, messageId);

        // Send typing indicator
        await sendTypingIndicator(phoneNumberId, from);

        // Generate AI response
        console.log("🤔 Generating response...");
        const aiResponse = await generateResponseGroq(msgBody);
        console.log(`📤 AI Response: ${aiResponse}`);

        // Send response via WhatsApp
        await sendWhatsAppMessage(phoneNumberId, from, aiResponse);
      }
    } catch (error) {
      console.error("❌ Error processing message:", error);
      try {
        await sendWhatsAppMessage(
          body.entry[0].changes[0].value.metadata.phone_number_id,
          body.entry[0].changes[0].value.messages[0].from,
          "Sorry, I encountered an issue. Please try again or visit billionaireschow.vercel.app 🍕"
        );
      } catch (e) {
        console.error("Failed to send error message:", e);
      }
    }
  }
});

// ============================================================
// 3. GENERATE RESPONSE USING GROQ AI
// ============================================================
async function generateResponseGroq(userMessage) {
  try {
    console.log("   📡 Calling Groq API...");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You are Billionaires Chow customer service bot. Warri's #1 Pizza & Shawarma spot!

MENU & PRICES:

🍕 PIZZA (All from ₦11,500):
- Billionaires Beef Pizza
- Billionaires Chicken Pizza
- Billionaires Special Pizza

🥙 SHAWARMA:
- Billionaires Chicken Shawarma - ₦5,000
- Billionaires Special Shawarma - ₦5,950
- Billionaires Special Suya Shawarma - ₦6,000
- Billionaires Extra Special Shawarma - ₦6,950
- Billionaires Extra Special Shawarma Jumbo - ₦7,950

🍰 DESSERT:
- Special Parfait - ₦7,000

🥤 DRINKS:
- Coconut Yoghurt - ₦4,000
- Zobo (Hibiscus Tea) - ₦2,000

🍛 COMBOS:
- Family Combo - from ₦12,000

FEATURES: Fresh ingredients • Grilled to perfection • 4-min prep time

WEBSITE: billionaireschow.vercel.app

INSTRUCTIONS:
- Keep responses SHORT (max 2 sentences)
- Be enthusiastic and friendly (Warri vibe!)
- Always mention price when recommending items
- For orders: direct to website or WhatsApp
- Use emoji sparingly (🍕 🥙 😋)
- Response must be fast - hungry customers!
- If greeting: welcome them warmly
- If asking about specific item: give price + brief description
- If asking to order: tell them to use website or call

Your tone: Energetic, welcoming, quick, local.`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("   ✅ Groq response received");
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("❌ Groq API error:", error.response?.data || error.message);
    throw error;
  }
}

// ============================================================
// 4. SEND TYPING INDICATOR
// ============================================================
async function sendTypingIndicator(phoneNumberId, recipientNumber) {
  const url = `https://graph.instagram.com/v18.0/${phoneNumberId}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientNumber,
        type: "typing",
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("   ⌨️  Typing indicator sent");
  } catch (error) {
    console.error(
      "Error sending typing indicator:",
      error.response?.data || error.message
    );
  }
}

// ============================================================
// 5. MARK MESSAGE AS READ
// ============================================================
async function markMessageAsRead(phoneNumberId, messageId) {
  const url = `https://graph.instagram.com/v18.0/${phoneNumberId}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("   ✓ Message marked as read");
  } catch (error) {
    console.error(
      "Error marking message as read:",
      error.response?.data || error.message
    );
  }
}

// ============================================================
// 6. SEND MESSAGE VIA WHATSAPP API
// ============================================================
async function sendWhatsAppMessage(phoneNumberId, recipientNumber, messageText) {
  const url = `https://graph.instagram.com/v18.0/${phoneNumberId}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: recipientNumber,
        type: "text",
        text: {
          body: messageText,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`   ✅ Message sent to ${recipientNumber}`);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error sending message:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// ============================================================
// 7. START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log("\n🚀 Billionaires Chow WhatsApp Bot is running!");
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
  console.log("\n⏳ Waiting for incoming messages...\n");
});
