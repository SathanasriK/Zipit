# 🤖 ZipIt Chatbot Setup Guide

The ZipIt chatbot can provide intelligent, context-aware responses using AI. Follow this guide to enable AI chatbot features.

## ✨ What You Get

With AI enabled, the chatbot can:
- ✅ Answer questions about what to pack for any trip
- ✅ Suggest specific snacks, foods, and beverages
- ✅ Recommend places and attractions to visit
- ✅ Provide travel tips and advice
- ✅ Answer any question about your trip planning

**Without AI**: Chatbot uses pre-programmed limited responses
**With AI**: Chatbot replies like ChatGPT with real knowledge and context

## 🚀 Quick Setup (5 minutes)

### Option 1: OpenAI (Recommended - Easiest)

**Step 1: Get Free Credits**
1. Go to: **https://platform.openai.com/account/api-keys**
2. Sign up with your email (Gmail, Microsoft, Apple ID work too)
3. You'll get $18 in free credits (valid for 3 months)

**Step 2: Create an API Key**
1. Click **"Create new secret key"**
2. Copy the key (looks like: `sk-proj-abc123...`)
3. ⚠️ Keep this safe - don't share it!

**Step 3: Add to ZipIt**
1. Open file: `app.js`
2. Find line ~56:
   ```javascript
   const OPENAI_API_KEY = ''; // ← PASTE YOUR KEY HERE
   ```
3. Replace with:
   ```javascript
   const OPENAI_API_KEY = 'sk-proj-abc123...'; // Paste your actual key
   ```
4. Save the file (Ctrl+S)
5. **Reload your browser** (F5 or refresh)

**Step 4: Test It**
- Open ZipIt in your browser
- Try asking: "suggest me snacks"
- Check browser console (F12) - you should see:
  - `📞 Calling OpenAI API...` ← API was called ✅
  - `✅ Got OpenAI response` ← Response received ✅

✨ **Done!** Your chatbot is now AI-powered!

---

### Option 2: HuggingFace (Free Alternative)

1. Go to: https://huggingface.co/settings/tokens
2. Create new token (select "Read access")
3. Copy the token (`hf_...`)
4. In `app.js` line ~60:
   ```javascript
   const HUGGINGFACE_API_KEY = 'hf_abc123...';
   ```
5. Save and reload

---

### Option 3: Google Generative AI (Free)

1. Go to: https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key
4. In `app.js` line ~63:
   ```javascript
   const GOOGLE_API_KEY = 'AIza...';
   ```
5. Save and reload

---

## 🔍 Troubleshooting

### Problem: "No LLM API configured" message

**Solution**: You haven't added your API key yet.
1. Check line 56 in `app.js` - is `OPENAI_API_KEY` still empty?
2. Add your key, save, and reload

### Problem: Getting old built-in responses

**Solution**:
1. Open browser console (F12)
2. Look for one of these messages:
   - `❌ No LLM API configured` → Add API key (see above)
   - `❌ OpenAI error 401` → Wrong API key (copy again from OpenAI)
   - `❌ OpenAI error 429` → Rate limited (wait a minute)

### Problem: API key not working

**Checklist**:
- [ ] Did you copy the FULL key? (including "sk-" prefix)
- [ ] Did you paste it between the quotes? `'sk-...'`
- [ ] Did you save the file?
- [ ] Did you reload the browser?
- [ ] Is the API key active? (Check OpenAI dashboard)

---

## 💰 Pricing

### OpenAI (Recommended)
- **Free tier**: $18 credits (3-month validity)
- **After free credits**: $0.001 per 1000 tokens (~$0.02 per chat)
- **Budget control**: Set in OpenAI dashboard

### HuggingFace
- Free Inference API available
- Rate limited on free tier

### Google
- Free tier available with limitations

---

## 🎯 Example Prompts to Try

Once AI is enabled:

```
"What snacks should I pack for a mountain trip?"
→ Gets real snack recommendations based on trip context

"Suggest me places to explore in a beach town"
→ Gets actual attraction suggestions

"Does my packing list look complete?"
→ Reviews current items and suggests missing essentials

"What's the weather like in Dubai in June?"
→ Provides travel advice
```

---

## 📞 Need Help?

Check the browser console (F12) for debug messages:
- `🤖 Calling LLM API...` - API call sent
- `📞 Calling OpenAI API...` - Using OpenAI
- `✅ Got OpenAI response` - Success!
- `❌ OpenAI error` - Error (see details)

---

## 🔒 API Key Security

- Never share your API key publicly
- The key is only used by your browser to call OpenAI
- Your API key is NOT sent anywhere except OpenAI's servers
- Keep backup in password manager

---

**Questions?** Check app.js lines 8-65 for detailed comments in the code.
