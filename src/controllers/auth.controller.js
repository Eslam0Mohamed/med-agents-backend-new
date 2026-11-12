const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { JWT_SECRET, ADMIN_SECRET_KEY } = require('../config/env');
const BlacklistedToken = require('../models/BlacklistedToken');
const Patient = require('../models/Patient');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Followup = require('../models/Followup');
const { chatCompletion } = require('../services/openai.service');
const {
  generateOtp,
  hashOtp,
  sendOtpEmail,
  OTP_TTL_MINUTES,
} = require('../services/email.service');
const { UPLOAD_DIR: CREDENTIAL_PROOF_DIR } = require('../middleware/credentialProofUpload.middleware');


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const register = async (req, res) => {
  try {
    const { name, email, password, specialty, language } = req.body;

    const trimmedName = (name || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your full name.',
      });
    }

    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.',
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    // نطلب رقم وحرف على الأقل - عشان منمنعش استخدام باسوردات زي "aaaaaaaa"
    // اللي طولها كفاية بس ضعيفة فعليًا
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number.',
      });
    }

    if (language && !['en', 'ar'].includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language value.',
      });
    }

    // صورة/PDF إثبات إنه دكتور (كارت نقابة أو شهادة) - إلزامية، لأنها
    // الأساس اللي الأدمن هيوافق أو يرفض الحساب بناءً عليها
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload proof that you are a licensed doctor (syndicate card or certificate).',
      });
    }

    const existing = await User.findOne({ email: trimmedEmail });

    // بنرفض الإيميل المكرر، ماعدا الدكتور اللي اترفض - ده بنسيبه يقدم تاني
    const canResubmit =
      existing && existing.role === 'doctor' && existing.verificationStatus === 'rejected';

    if (existing && !canResubmit) {
      // امسح الملف اللي اترفع بالفعل قبل ما نرفض الطلب، عشان مانسيبش
      // ملفات يتيمة على الديسك
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const otp = generateOtp();
    const emailOtpHash = hashOtp(otp);
    const emailOtpExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    let user;
    if (canResubmit) {
      // امسح الكارنيه القديم عشان مانسيبش ملفات يتيمة
      if (existing.credentialProofPath) {
        fs.unlink(path.join(CREDENTIAL_PROOF_DIR, existing.credentialProofPath), () => {});
      }

      existing.name = trimmedName;
      existing.passwordHash = passwordHash;
      existing.specialty = (specialty || '').trim() || undefined;
      if (language) existing.language = language;
      existing.credentialProofPath = req.file.filename;

      // رجّعه للمراجعة من الأول
      existing.verificationStatus = 'pending';
      existing.rejectionReason = undefined;
      existing.reviewedAt = undefined;
      existing.reviewedBy = undefined;

      // لازم يأكد الإيميل تاني، عشان محدش يقدر يستولي على إيميل غيره
      existing.isEmailVerified = false;
      existing.emailOtpHash = emailOtpHash;
      existing.emailOtpExpiry = emailOtpExpiry;

      user = await existing.save();
    } else {
      user = await User.create({
        name: trimmedName,
        email: trimmedEmail,
        passwordHash,
        specialty: (specialty || '').trim() || undefined,
        language,
        credentialProofPath: req.file.filename,
        verificationStatus: 'pending',
        isEmailVerified: false,
        emailOtpHash,
        emailOtpExpiry,
      });
    }

    const emailResult = await sendOtpEmail(trimmedEmail, otp, { purpose: 'verify' });

    res.status(201).json({
      success: true,
      data: { id: user._id, name: user.name, email: user.email },
      // otpEmailSent بيبقى false لو SMTP مش متظبطة - الفرونت يقدر يوضح
      // للدكتور إنه يتواصل مع الدعم لو الإيميل ما وصلوش
      otpEmailSent: emailResult.sent,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// بعد التسجيل، الدكتور لازم يأكد إيميله بالكود اللي وصله قبل ما يقدر
// يعمل login خالص
const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!trimmedEmail || !otp) {
      return res.status(400).json({ success: false, message: 'Email and code are required.' });
    }

    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified.' });
    }

    if (!user.emailOtpHash || !user.emailOtpExpiry || user.emailOtpExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Code expired. Please request a new one.',
      });
    }

    if (hashOtp(otp) !== user.emailOtpHash) {
      return res.status(400).json({ success: false, message: 'Invalid code.' });
    }

    user.isEmailVerified = true;
    user.emailOtpHash = undefined;
    user.emailOtpExpiry = undefined;
    await user.save();

    // بعد التأكيد، نديله توكن على طول (نفس شكل رد /login بالظبط) عشان
    // الفرونت يقدر يكمله دخول مباشرة من غير ما يطلب منه يعمل login تاني
    const token = jwt.sign(
      { id: user._id, role: user.role, language: user.language },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    res.json({
      success: true,
      data: {
        token,
        name: user.name,
        role: user.role,
        language: user.language,
        verificationStatus: user.verificationStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const trimmedEmail = (email || '').trim().toLowerCase();
    const user = await User.findOne({ email: trimmedEmail });

    // مبنقولش "الإيميل مش موجود" صراحة هنا - عشان محدش يقدر يستخدم
    // الـ endpoint ده يتأكد إيه الإيميلات المسجلة في النظام (user enumeration)
    if (!user || user.isEmailVerified) {
      return res.json({
        success: true,
        message: 'If an account with this email exists and is unverified, a new code has been sent.',
      });
    }

    const otp = generateOtp();
    user.emailOtpHash = hashOtp(otp);
    user.emailOtpExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await user.save();

    await sendOtpEmail(trimmedEmail, otp, { purpose: 'verify' });

    res.json({
      success: true,
      message: 'If an account with this email exists and is unverified, a new code has been sent.',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const trimmedEmail = (email || '').trim().toLowerCase();
    const user = await User.findOne({ email: trimmedEmail });

    // نفس فكرة عدم الإفصاح فوق - رد موحّد سواء الإيميل موجود ولا لأ
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account with this email exists, a reset code has been sent.',
      });
    }

    const otp = generateOtp();
    user.resetOtpHash = hashOtp(otp);
    user.resetOtpExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await user.save();

    await sendOtpEmail(trimmedEmail, otp, { purpose: 'reset' });

    res.json({
      success: true,
      message: 'If an account with this email exists, a reset code has been sent.',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const trimmedEmail = (email || '').trim().toLowerCase();

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number.',
      });
    }

    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code.' });
    }

    if (!user.resetOtpHash || !user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Code expired. Please request a new one.' });
    }

    if (hashOtp(otp) !== user.resetOtpHash) {
      return res.status(400).json({ success: false, message: 'Invalid code.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetOtpHash = undefined;
    user.resetOtpExpiry = undefined;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact the admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // لازم يأكد إيميله الأول قبل أي حاجة تانية - من غير كده مش هنديله
    // توكن خالص، لأن هويته لسه مش متأكدة
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in.',
        data: { email: user.email },
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, language: user.language },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // بنسيب الدكتور يدخل حتى لو حسابه لسه pending أو rejected (بدل ما
    // نمنعه خالص)، والفرونت هو اللي بيقرر يوريه شاشة "تحت المراجعة" أو
    // "الحساب مرفوض" بناءً على verificationStatus - أي محاولة فعلية
    // للوصول لبيانات طبية حقيقية برضو محمية من الباك اند (requireApprovedDoctor)
    res.json({
      success: true,
      data: {
        token,
        name: user.name,
        role: user.role,
        language: user.language,
        verificationStatus: user.verificationStatus,
        rejectionReason: user.rejectionReason,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ⚠️ endpoint داخلي للتجربة بس - لازم يكون فيه authMiddleware على الراوت
// (اتضاف في auth.routes.js) عشان محدش يستهلك الـ AI budget من غير تسجيل دخول.
const testAI = async (req, res) => {
  try {
    const result = await chatCompletion({
      systemPrompt: 'You are a medical assistant.',
      userMessage: req.body.message,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllDoctors = async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('-passwordHash');
    res.json({ success: true, count: doctors.length, data: doctors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===== موافقة الأدمن على تسجيل الأطباء =====

const getPendingDoctors = async (req, res) => {
  try {
    const doctors = await User.find({
      role: 'doctor',
      verificationStatus: 'pending',
    })
      .select('-passwordHash')
      .sort({ createdAt: 1 });
    res.json({ success: true, count: doctors.length, data: doctors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// بيرجع ملف إثبات الهوية للأدمن بس - endpoint محمي، مش static route عام
// زي lab-files (المشكلة اللي كانت عندنا قبل كده)
const getDoctorCredentialProof = async (req, res) => {
  try {
    const doctor = await User.findById(req.params.id).select('credentialProofPath');
    if (!doctor || !doctor.credentialProofPath) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const filePath = path.join(CREDENTIAL_PROOF_DIR, doctor.credentialProofPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const approveDoctor = async (req, res) => {
  try {
    const doctor = await User.findById(req.params.id);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    doctor.verificationStatus = 'approved';
    doctor.rejectionReason = undefined;
    doctor.reviewedAt = new Date();
    doctor.reviewedBy = req.user.id;
    await doctor.save();

    res.json({ success: true, message: 'Doctor approved successfully', data: doctor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectDoctor = async (req, res) => {
  try {
    const { reason } = req.body;
    const doctor = await User.findById(req.params.id);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    doctor.verificationStatus = 'rejected';
    doctor.rejectionReason = (reason || '').trim() || 'Submitted credentials could not be verified.';
    doctor.reviewedAt = new Date();
    doctor.reviewedBy = req.user.id;
    await doctor.save();

    res.json({ success: true, message: 'Doctor registration rejected', data: doctor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// أدمن يشوف أي دكتور، الدكتور العادي يشوف بروفايله هو بس
const getDoctorById = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own profile.',
      });
    }

    const doctor = await User.findById(req.params.id).select('-passwordHash');
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, data: doctor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateDoctor = async (req, res) => {
  try {
    const { name, email, specialty, language } = req.body;
    const doctor = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, specialty, language },
      { new: true }
    ).select('-passwordHash');
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, data: doctor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// بيمسح الدكتور + كل حاجة مرتبطة بيه (كونسلتيشنز، روشتات، فولو أبس اللي هو
// طرف فيها)، وبيشيله من مصفوفة doctors بتاعة أي مريض كان بيتابعه، عشان
// نتجنب سجلات يتيمة معلّقة على user اتمسح.
const deleteDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const doctor = await User.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    // المرضى اللي الدكتور ده هو اللي أنشأهم (createdBy) - المطلوب دلوقتي
    // إنهم يتحذفوا نهائيًا مع الدكتور، بكل السجلات المرتبطة بيهم (كونسلتيشنز/
    // روشتات/فوللو أب) عشان محدش يفضل معلّق على مريض متمسوح.
    const ownedPatients = await Patient.find({ createdBy: doctorId }).select('_id');
    const ownedPatientIds = ownedPatients.map((p) => p._id);

    if (ownedPatientIds.length > 0) {
      await Consultation.deleteMany({ patientId: { $in: ownedPatientIds } });
      await Prescription.deleteMany({ patientId: { $in: ownedPatientIds } });
      await Followup.deleteMany({ patientId: { $in: ownedPatientIds } });
      await Patient.deleteMany({ _id: { $in: ownedPatientIds } });
    }

    // المرضى اللي الدكتور ده مش اللي أنشأهم بس عمل معاهم كونسلتيشن (موجود في
    // doctors[])، دول بيفضلوا موجودين (ليهم دكتور تاني أساسي)، بس بنشيل
    // ربط الدكتور المحذوف منهم بس.
    await Patient.updateMany(
      { doctors: doctorId },
      { $pull: { doctors: doctorId } }
    );

    // كونسلتيشنز/روشتات/فوللو أب المتبقيين (على مرضى مش هو صاحبهم) واللي
    // عملهم الدكتور ده بنفسه - بتتحذف زي الأول.
    await Consultation.deleteMany({ doctorId });
    await Prescription.deleteMany({ doctorId });
    await Followup.deleteMany({ doctorId });

    await User.findByIdAndDelete(doctorId);

    res.json({ success: true, message: 'Doctor and related records deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { name, email, password, secretKey } = req.body;

    // secret key عشان محدش يعمل admin من غير إذن - لازم يكون متظبط في .env
    if (!ADMIN_SECRET_KEY || secretKey !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ success: false, message: 'Invalid secret key' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // الأدمن بيتجاوز كل خطوات التحقق (تأكيد إيميل + موافقة أدمن) لأنه
    // أصلاً بيتعمل بمفتاح سري من شخص موثوق فيه، مش عن طريق /register العام
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: 'admin',
      isEmailVerified: true,
      verificationStatus: 'approved',
    });

    res.status(201).json({ success: true, data: { id: user._id, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(400).json({ success: false, message: 'No token ' });
    }

    await BlacklistedToken.create({ token });

    return res.status(200).json({ success: true, message: 'Logged out successfully' });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const { confirmEmail, name, specialty, language, newPassword } = req.body;

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (confirmEmail !== currentUser.email) {
      return res.status(403).json({ success: false, message: 'Email confirmation does not match your account email' });
    }

    const updates = {};
    if (name) updates.name = name;
    if (specialty) updates.specialty = specialty;
    if (language) updates.language = language;

    if (newPassword) {
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select('-passwordHash');

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  register,
  verifyEmailOtp,
  resendEmailOtp,
  forgotPassword,
  resetPasswordWithOtp,
  login,
  logout,
  testAI,
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  createAdmin,
  updateMyProfile,
  getPendingDoctors,
  getDoctorCredentialProof,
  approveDoctor,
  rejectDoctor,
};