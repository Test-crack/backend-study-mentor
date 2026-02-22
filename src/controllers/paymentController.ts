import { Request, Response } from 'express';
import { razorpay } from '../lib/razorpay';
import prisma from '../lib/prisma';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';

export const createCheckoutSession = async (req: Request, res: Response): Promise<void> => {
    try {
        const { courseId } = req.body;
        const userId = (req as AuthRequest & { appUserId?: string }).appUserId;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            res.status(404).json({ error: 'Course not found' });
            return;
        }

        if (!course.price) {
            res.status(400).json({ error: 'Course is free or price not set' });
            return;
        }

        const options = {
            amount: Number(course.price) * 100, // amount in smallest currency unit
            currency: 'INR',
            receipt: `receipt_order_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        await prisma.courseOrder.create({
            data: {
                userId,
                courseId,
                amount: course.price,
                currency: 'INR',
                razorpayOrderId: order.id,
                status: 'PENDING',
            },
        });

        res.json({
            id: order.id,
            currency: order.currency,
            amount: order.amount,
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const userId = (req as AuthRequest & { appUserId?: string }).appUserId;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return
        }

        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            throw new Error("Razorpay secret not found")
        }

        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature === razorpay_signature) {
            // Payment is successful

            // Update Order Status
            const order = await prisma.courseOrder.update({
                where: { razorpayOrderId: razorpay_order_id },
                data: {
                    status: 'SUCCESS',
                    razorpayPaymentId: razorpay_payment_id,
                },
            });

            // Enroll User
            await prisma.userCourseEnrollment.create({
                data: {
                    user_id: userId,
                    course_id: order.courseId,
                    status: 'NOT_STARTED',
                },
            });

            res.json({ status: 'success' });
        } else {
            // Payment failed
            await prisma.courseOrder.update({
                where: { razorpayOrderId: razorpay_order_id },
                data: {
                    status: 'FAILED',
                },
            });
            res.status(400).json({ status: 'failure', message: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
