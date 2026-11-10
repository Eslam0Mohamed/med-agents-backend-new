const nodemailer = require("nodemailer");
const crypto = require("crypto");
const env = require("../config/env");

let transporter = null;

// بننشئ الـ transporter مرة واحدة بس ونعيد استخدامه، ومش بنكسر التطبيق لو
// إعدادات SMTP مش متظبطة لسه - بنسجل تحذير في اللوج بس، عشان باقي
// التطبيق يفضل شغال حتى لو فيتشر الإيميل معطل مؤقتًا
const getTransporter = () => {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn(
      "[email.service] SMTP env vars مش متظبطة (SMTP_HOST/SMTP_USER/SMTP_PASS) - إرسال الإيميلات معطل حاليًا.",
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: Number(env.SMTP_PORT) === 465, // 465 بيحتاج TLS من الاتصال الأول
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  return transporter;
};

// كود من 6 أرقام - عشان يبقى سهل الدكتور يكتبه من على الإيميل
const generateOtp = () =>
  String(crypto.randomInt(100000, 999999));

// بنخزن الـ hash بس في الداتا بيز مش الكود نفسه (نفس منطق الباسورد)
const hashOtp = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

const OTP_TTL_MINUTES = 10;

const sendEmail = async ({ to, subject, html }) => {
  const t = getTransporter();
  if (!t) {
    // منرميش error يوقف الطلب كله - الكولر (auth.controller) هو اللي
    // يقرر يتصرف إزاي لو الإرسال فشل (مثلاً يرجّع الكود في رد الـ API
    // في بيئة التطوير بس، لحد ما SMTP الحقيقي يتظبط)
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await t.sendMail({ from: env.SMTP_FROM, to, subject, html });
    return { sent: true };
  } catch (error) {
    console.error("[email.service] فشل إرسال الإيميل:", error.message);
    return { sent: false, reason: error.message };
  }
};

const sendOtpEmail = async (to, otp, { purpose = "verify" } = {}) => {
  const isReset = purpose === "reset";
  const subject = isReset
    ? "إعادة تعيين كلمة المرور - Med Agents"
    : "تأكيد بريدك الإلكتروني - Med Agents";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Med Agents</h2>
      <p>${isReset ? "كود إعادة تعيين كلمة المرور بتاعك هو:" : "كود تأكيد بريدك الإلكتروني هو:"}</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
      <p>الكود صالح لمدة ${OTP_TTL_MINUTES} دقايق بس. لو ماطلبتش الكود ده، تجاهل الإيميل ده.</p>
    </div>
  `;

  return sendEmail({ to, subject, html });
};

module.exports = {
  generateOtp,
  hashOtp,
  sendOtpEmail,
  sendEmail,
  OTP_TTL_MINUTES,
};