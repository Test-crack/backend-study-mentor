// src/controllers/domainController.ts
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { slugify } from '../helper/stringUtils';

export async function getDomains(req: Request, res: Response) {
    try {
        const domains = await prisma.domain.findMany({
            orderBy: { name: 'asc' },
        });
        res.json(domains);
    } catch (error) {
        console.error('getDomains error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function createDomain(req: Request, res: Response) {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Domain name is required' });
        }

        const slug = slugify(name);

        const domain = await prisma.domain.create({
            data: {
                name,
                description,
                slug,
            },
        });

        res.status(201).json(domain);
    } catch (error) {
        console.error('createDomain error:', error);
        // Handle unique constraint violation for slug or name
        if ((error as any).code === 'P2002') {
            return res.status(400).json({ message: 'Domain with this name or slug already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
}
