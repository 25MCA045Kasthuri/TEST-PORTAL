import { Request, Response } from 'express';
import { Candidate } from '../models/Candidate';
import { Admin } from '../models/Admin';
import { asyncHandler } from '../utils/asyncHandler';
import { setAuthCookie, clearAuthCookie } from '../middleware/auth';
import { ok } from '../utils/respond';
import { normalizeUid, CandidateLoginInput, AdminLoginInput } from '../validators/authValidators';
import { verifyCandidatePassword } from '../services/candidatePassword';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError';

export const candidateLogin = asyncHandler(async (req: Request, res: Response) => {
  const { uid, password } = req.body as CandidateLoginInput;
  const normalized = normalizeUid(uid);

  const candidate = await Candidate.findOne({ uid: normalized }).select('+passwordHash');
  if (!candidate) {
    throw ApiError.unauthorized('Invalid UID or password.');
  }
  if (!candidate.active) {
    throw ApiError.forbidden('Your account is deactivated. Contact the administrator.');
  }
  const match = await verifyCandidatePassword(password, candidate.passwordHash);
  if (!match) {
    throw ApiError.unauthorized('Invalid UID or password.');
  }

  setAuthCookie(res, { sub: String(candidate._id), role: 'candidate', name: candidate.name });
  ok(res, {
    uid: candidate.uid,
    name: candidate.name,
    mobile: candidate.mobile,
    college: candidate.college,
    department: candidate.department,
  }, 'Candidate login successful.');
});

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as AdminLoginInput;
  const normalized = email.trim().toLowerCase();

  const admin = await Admin.findOne({ email: normalized }).select('+passwordHash');
  if (!admin) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (!admin.active) {
    throw ApiError.forbidden('This administrator account is deactivated.');
  }
  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  setAuthCookie(res, { sub: String(admin._id), role: 'admin', name: admin.name });
  ok(res, { email: admin.email, name: admin.name }, 'Admin login successful.');
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  ok(res, null, 'Logged out successfully.');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  if (req.auth.role === 'admin') {
    const admin = await Admin.findById(req.auth.sub);
    if (!admin) throw ApiError.unauthorized('Admin account not found.');
    ok(res, { role: 'admin', email: admin.email, name: admin.name });
  } else {
    const candidate = await Candidate.findById(req.auth.sub);
    if (!candidate) throw ApiError.unauthorized('Candidate account not found.');
    ok(res, {
      role: 'candidate',
      uid: candidate.uid,
      name: candidate.name,
      mobile: candidate.mobile,
      college: candidate.college,
      department: candidate.department,
    });
  }
});