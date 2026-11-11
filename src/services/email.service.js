const crypto = require("crypto");
const { Resend } = require("resend");

let resendClient = null;

// بننشئ الـ client مرة واحدة بس، ومش بنكسر التطبيق لو RESEND_API_KEY ناقص -
// بنسجل تحذير في اللوج بس، عشان باقي التطبيق يفضل شغال
const getResend = () => {
  if (resendClient) return resendClient;

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "[email.service] RESEND_API_KEY مش متظبط - إرسال الإيميلات معطل حاليًا.",
    );
    return null;
  }

  resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
};

// كود من 6 أرقام - عشان يبقى سهل الدكتور يكتبه من على الإيميل
const generateOtp = () => String(crypto.randomInt(100000, 999999));

// بنخزن الـ hash بس في الداتا بيز مش الكود نفسه (نفس منطق الباسورد)
const hashOtp = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

const OTP_TTL_MINUTES = 10;

const sendEmail = async ({ to, subject, html }) => {
  const client = getResend();
  if (!client) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: process.env.EMAIL_FROM || "Med Agents <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[email.service] فشل إرسال الإيميل:", error.message);
      return { sent: false, reason: error.message };
    }

    console.log("[email.service] تم الإرسال بنجاح، id:", data?.id);
    return { sent: true };
  } catch (err) {
    console.error("[email.service] فشل إرسال الإيميل:", err.message);
    return { sent: false, reason: err.message };
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