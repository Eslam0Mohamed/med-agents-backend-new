const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ملفات إثبات هوية الدكتور (كارت نقابة/شهادة) - أحساس جدًا، فبنخزنها في
// مجلد منفصل تمامًا عن lab-files، وده المجلد اللي مش هيتقدّم كـ static
// route عام أبدًا (زي ما اتفقنا)، بيتقرا بس عن طريق endpoint محمي للأدمن
const UPLOAD_DIR = path.join(__dirname, "../../uploads/credential-proofs");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // اسم الملف عشوائي تمامًا (UUID-like) عشان محدش يقدر يخمّن اسم ملف
    // دكتور تاني - نفس المشكلة اللي كنا لاحظناها في lab-files قبل كده
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Unsupported file type. Only images (JPG, PNG, WEBP) and PDF files are allowed.",
      ),
    );
  }
};

const credentialProofUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB
    files: 1,
  },
});

module.exports = { credentialProofUpload, UPLOAD_DIR, ALLOWED_MIME_TYPES };