const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const authLimiter = require('../middleware/authRateLimit.middleware');
const { credentialProofUpload } = require('../middleware/credentialProofUpload.middleware');
const {
  register,
  verifyEmailOtp,
  resendEmailOtp,
  forgotPassword,
  resetPasswordWithOtp,
  login,
  testAI,
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  createAdmin,
  logout,
  updateMyProfile,
  getPendingDoctors,
  getDoctorCredentialProof,
  approveDoctor,
  rejectDoctor,
} = require('../controllers/auth.controller');

router.post('/register', authLimiter, credentialProofUpload.single('credentialProof'), register);
router.post('/verify-email-otp', authLimiter, verifyEmailOtp);
router.post('/resend-email-otp', authLimiter, resendEmailOtp);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password-otp', authLimiter, resetPasswordWithOtp);
router.post('/login', authLimiter, login);
router.post('/logout', authMiddleware,logout);
router.post('/test-ai', authMiddleware, testAI);
router.post('/create-admin', authLimiter, createAdmin);

// ===== موافقة الأدمن على تسجيل الأطباء (كلها admin بس) =====
router.get('/doctors/pending', authMiddleware, adminMiddleware, getPendingDoctors);
router.get('/doctors/:id/credential-proof', authMiddleware, adminMiddleware, getDoctorCredentialProof);
router.post('/doctors/:id/approve', authMiddleware, adminMiddleware, approveDoctor);
router.post('/doctors/:id/reject', authMiddleware, adminMiddleware, rejectDoctor);

// router.get('/doctors', authMiddleware, getAllDoctors);
router.get('/doctors/:id', authMiddleware, getDoctorById);
router.put('/doctors/:id', authMiddleware, adminMiddleware, updateDoctor);
router.delete('/doctors/:id', authMiddleware, adminMiddleware, deleteDoctor);
router.get('/doctors', authMiddleware, adminMiddleware, getAllDoctors); // admin بس
router.put('/me', authMiddleware, updateMyProfile);

module.exports = router;