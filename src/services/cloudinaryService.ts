import { v2 as cloudinary } from 'cloudinary';
import { unlink } from 'fs/promises';

// Initialize Cloudinary
// Expects CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

/**
 * Upload an image to Cloudinary
 * @param filePath Local path to the file
 * @param folder Cloudinary folder name (default: 'backend-study-mentor/profiles')
 * @returns Promise with the secure URL of the uploaded image
 */
export const uploadImage = async (
    filePath: string,
    folder: string = 'Testcrack/users/profiles'
): Promise<{ url: string; publicId: string }> => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder,
            resource_type: 'image',
            transformation: [
                { width: 500, height: 500, crop: 'fill', gravity: 'face' }, // Face-centered square crop
                { quality: 'auto', fetch_format: 'auto' }, // Optimization
            ],
        });

        // Remove local file after successful upload
        try {
            await unlink(filePath);
        } catch (err) {
            console.warn('Failed to delete local file after upload:', err);
        }

        return {
            url: result.secure_url,
            publicId: result.public_id,
        };
    } catch (error: any) {
        // Attempt to clean up local file even on error
        try {
            await unlink(filePath);
        } catch { }

        console.error('Cloudinary upload error:', error);
        throw new Error(`Image upload failed: ${error.message}`);
    }
};

/**
 * Delete an image from Cloudinary
 * @param publicId Cloudinary public ID
 */
export const deleteImage = async (publicId: string): Promise<void> => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        // Suppress error as this is a cleanup operation
    }
};

/**
 * Extract public ID from a Cloudinary URL
 * Useful when we only have the URL stored in DB
 */
export const getPublicIdFromUrl = (url: string): string | null => {
    try {
        // Example: https://res.cloudinary.com/cloudname/image/upload/v1234/Testcrack/users/profiles/filename.jpg
        const parts = url.split('/');

        // Find the index of 'upload'
        const uploadIndex = parts.indexOf('upload');
        if (uploadIndex === -1) return null;

        // Start looking from after 'upload'
        let startIndex = uploadIndex + 1;

        // Skip version if present (starts with 'v' followed by numbers)
        if (parts[startIndex].match(/^v\d+$/)) {
            startIndex++;
        }

        // Join the remaining parts to get the path
        const publicIdWithExtension = parts.slice(startIndex).join('/');

        // Remove the file extension (last dot onwards)
        const lastDotIndex = publicIdWithExtension.lastIndexOf('.');
        if (lastDotIndex === -1) return publicIdWithExtension;

        return publicIdWithExtension.substring(0, lastDotIndex);
    } catch {
        return null;
    }
};
