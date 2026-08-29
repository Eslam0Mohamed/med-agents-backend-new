const mongoose = require('mongoose');

const TRIAL_DAYS = 14;
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['doctor', 'admin'], default: 'doctor' },
  specialty: { type: String, default: 'Internal Medicine'  },
  language: { type: String, enum: ['en', 'ar'], default: 'en' },
  isActive: { type: Boolean, default: true },

  // ===== تحقق الإيميل وقت التسجيل =====
  isEmailVerified: { type: Boolean, default: false },
  // بنخزن hash بتاع الـ OTP مش القيمة نفسها، زي الباسورد بالظبط - عشان لو
  // حد وصل لقاعدة البيانات مايقدرش يستخدم الأكواد القديمة
  emailOtpHash: String,
  emailOtpExpiry: Date,

  // ===== نسيان الباسورد =====
  resetOtpHash: String,
  resetOtpExpiry: Date,

  // ===== موافقة الأدمن على حساب الدكتور (إثبات الشخصية) =====
  // admin مش بيمر بالخطوة دي أصلاً (بيتعمل عن طريق create-admin منفصل)،
  // فالقيمة الافتراضية دي بتخص الأطباء بس
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  // مسار ملف إثبات إنه دكتور (كارت نقابة/شهادة) - بيتخزن على الديسك
  // ويترجع بس عن طريق endpoint محمي للأدمن، مش static route عام
  credentialProofPath: String,
  rejectionReason: String,
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

subscription: {
  status: {
    type: String,
    enum: ["trial", "active", "expired"],
    default: "trial",
  },

  plan: {
    type: String,
    default: "Trial",
  },

  trialStart: {
    type: Date,
    default: Date.now,
  },

  trialEnd: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setDate(date.getDate() + TRIAL_DAYS);
      return date;
    },
  },

  subscriptionStart: Date,

  subscriptionEnd: Date,
},
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);