'use strict';

const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
  name: z.string().trim().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'Provide at least one field to update',
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Password must be at least 10 characters').max(128),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

// A TOTP (6 digits) or a backup code (e.g. "abcde-fghij"). Loose min length so both
// forms pass; the controller decides which check to run.
const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

const twoFactorLoginSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().trim().min(6).max(20),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  verifyEmailSchema,
  twoFactorCodeSchema,
  twoFactorLoginSchema,
};
