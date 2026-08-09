const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const authLimiter = require('../middleware/authRateLimit.middleware');
const { register, login, testAI, getAllDoctors, getDoctorById, updateDoctor, deleteDoctor, createAdmin, logout,updateMyProfile } = require('../controllers/auth.controller');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', authMiddleware,logout);
router.post('/test-ai', authMiddleware, testAI);
router.post('/create-admin', authLimiter, createAdmin);

// router.get('/doctors', authMiddleware, getAllDoctors);
router.get('/doctors/:id', authMiddleware, getDoctorById);
router.put('/doctors/:id', authMiddleware, adminMiddleware, updateDoctor);
router.delete('/doctors/:id', authMiddleware, adminMiddleware, deleteDoctor);
router.get('/doctors', authMiddleware, adminMiddleware, getAllDoctors); // admin بس
router.put('/me', authMiddleware, updateMyProfile);

module.exports = router;