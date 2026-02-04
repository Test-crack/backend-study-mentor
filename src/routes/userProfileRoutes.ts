import { Router } from 'express';
import { getUserProfile, updateUserProfile, uploadProfileImage, removeProfileImage } from '../controllers/userProfileController';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure local temporary storage for uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Cloudinary service handles cleanup, so we just need a temp location
    // Using default OS temp dir via empty destination or a specific uploads folder
    // Let's use the project "uploads" folder which we know exists
    cb(null, 'uploads/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Middleware to log all requests
router.use((req, res, next) => {
  console.log(`[USER PROFILE ROUTES] ${req.method} ${req.url}`);
  next();
});

// Route definitions
router.get('/', getUserProfile);       // Get user profile
router.put('/', updateUserProfile);    // Update user profile
router.put('/image', upload.single('profileImage'), uploadProfileImage); // Upload profile image
router.delete('/image', removeProfileImage); // Remove profile image

export default router;
