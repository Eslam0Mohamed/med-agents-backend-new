require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY,
  // OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  // ✅ مفيش DEEPSEEK_API_KEY منفصل - موديل DeepSeek نفسه بيشتغل مجانًا عن
  // طريق NVIDIA_API_KEY تحت (build.nvidia.com بيستضيفه مجانًا)
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  // Groq - مستخدم هنا بس لخدمة تحويل الصوت لنص (Whisper)، منفصل تمامًا
  // عن نظام fallback التشخيص (اللي بيعتمد على Gemini + NVIDIA بس)
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  PINECONE_API_KEY: process.env.PINECONE_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // عنوان خدمة تصنيف صور الأمراض الجلدية المحلية (Python/FastAPI) - شوف
  // مجلد skin-classifier-service. لو مش موجودة القيمة دي، الميزة بتتعطل
  // بصمت من غير ما تكسر أي حاجة تانية في التطبيق
  SKIN_CLASSIFIER_URL: process.env.SKIN_CLASSIFIER_URL,

  // Paymob (Intention API - النظام الجديد)
  PAYMOB_SECRET_KEY: process.env.PAYMOB_SECRET_KEY,
  PAYMOB_PUBLIC_KEY: process.env.PAYMOB_PUBLIC_KEY,
  PAYMOB_INTEGRATION_ID: process.env.PAYMOB_INTEGRATION_ID,
  PAYMOB_HMAC_SECRET: process.env.PAYMOB_HMAC_SECRET,

  // إعدادات إرسال الإيميلات (OTP التسجيل + نسيان الباسورد) - أي مزوّد
  // SMTP عادي شغال (Gmail App Password, SendGrid, Mailgun, Resend...).
  // مثال لو هتستخدم Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587,
  // SMTP_USER=your@gmail.com, SMTP_PASS=App Password (مش الباسورد العادي)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || "Med Agents <no-reply@medagents.com>",
};