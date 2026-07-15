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

const GROQ_MODEL = "llama-3.1-8b-instant";

// Simple in-memory store for conversations
const userSessions = {};

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
        const aiResponse = await generateResponseGroq(msgBody, from);
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
        console.error("Failed to send error message:"// ============================================================
// 3. GENERATE RESPONSE USING GROQ AI
// ============================================================
async function generateResponseGroq(userMessage, phoneNumberId) {
  try {
    console.log("   📡 Calling Groq API...");

    if (!userSessions[phoneNumberId]) {
      userSessions[phoneNumberId] = [];
    }

    userSessions[phoneNumberId].push({ role: "user", content: userMessage });

    // Keep history manageable (last 10 messages)
    if (userSessions[phoneNumberId].length > 10) {
      userSessions[phoneNumberId].splice(0, 2);
    }

    const systemPrompt = `You are the Billionaires Chow customer service representative. Professional, warm, and efficient.

MENU & PRICES:

🍕 PIZZA:
Premium (Beef, Special, Suya Pepper, Chicken Suya Pepper):
- Medium: ₦11,500 | Large: ₦14,000 | Jumbo: ₦23,000

Standard (Chicken, Sausage):
- Medium: ₦10,000 | Large: ₦13,000 | Jumbo: ₦23,000

🥙 SHAWARMA:
- Chicken Shawarma - ₦5,000
- Special Shawarma - ₦5,950
- Special Suya Shawarma - ₦6,000
- Extra Special Shawarma - ₦6,950
- Extra Special Shawarma Jumbo - ₦7,950

🍰 DESSERT:
- Special Parfait - ₦7,000

🥤 DRINKS:
- Coconut Yoghurt - ₦4,000
- Zobo (Hibiscus Tea) - ₦2,000

🍛 FAMILY COMBO:
- From ₦12,000

KEY INFO:
- Fresh ingredients • Grilled to perfection • 4-minute prep time
- Website: billionaireschow.vercel.app
- Order via WhatsApp: 07890-1022

COMMUNICATION STYLE:
- Professional but personable (not robotic)
- Concise (max 2 sentences)
- Helpful and solution-oriented
- Confident in recommendations
- Use a touch of warmth without being casual
- STRICTLY standard English: Do NOT use slang, colloquialisms, or terms like "Oga", "Boss", or "Chief".

AMBIGUOUS ORDERS:
- If a customer asks for a general category (like "shawarma" or "drink") without specifying the exact item or size, DO NOT guess or pick one for them.
- INSTEAD, ask them to clarify which specific item from that category they would like. (e.g., "Which type of shawarma would you like? We have Chicken, Special, etc.")

ORDER TAKING:
- When a customer specifies their items (e.g., "I want a jumbo suya and zobo"), DO NOT just recommend the items back to them.
- INSTEAD, calculate the total price for their items, state the total clearly, and ask if they would like to add anything else or proceed to checkout.

HANDLING OUT-OF-SCOPE REQUESTS:
If someone asks for something NOT on the menu (medical help, other services, products we don't sell):
- Politely acknowledge their question
- Clearly state we only serve pizza, shawarma, and drinks
- Redirect to what we DO offer
- Keep it brief and friendly

EXAMPLES OF GOOD RESPONSES:

Menu question: "Our premium pizzas are fantastic - the Beef pizza at ₦11,500 (medium) or ₦14,000 (large) is a customer favorite. What size suits you?"

Special request: "We specialize in pizza and shawarma made fresh. Let me know if you'd like to try one of our signature items."

Out of scope: "We focus exclusively on pizza and shawarma. However, our Special Parfait (₦7,000) is a great dessert option if you're interested!"

Pricing question: "All our pizzas start at ₦10,000 for medium and go up to ₦23,000 for jumbo sizes. What's your budget?"

TONE: Professional, helpful, confident. Not stiff, but not casual.`;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...userSessions[phoneNumberId]
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
    const aiMessage = response.data.choices[0].message.content;
    userSessions[phoneNumberId].push({ role: "assistant", content: aiMessage });
    return aiMessage;
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
