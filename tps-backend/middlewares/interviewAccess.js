const jwt = require('jsonwebtoken');
const { users, company } = require('../models');

// Interview authentication is separate from other modules: account types and
// current database roles must be checked, not just browser-supplied identities.
async function accountFor(req, staff) {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error('Authentication unavailable'), { status: 503 });
  let claims;
  try { claims = jwt.verify(token, secret, { algorithms: ['HS256'] }); }
  catch { return null; }
  if (!claims.user_id || claims.type === 'refresh') return null;
  if (staff ? (!claims.role || claims.type !== 'access') : !!claims.role) return null;
  return (staff ? company : users).findByPk(claims.user_id);
}

const learner = async (req, res, next) => {
  try {
    const account = await accountFor(req, false);
    if (!account) return res.status(401).json({ error: 'Please sign in.' });
    req.appUser = account;
    req.body = { ...req.body, userId: Number(account.id), userName: account.name,
      userEmail: account.email, email: account.email, isPublished: false, isExpert: false };
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (error) { next(error); }
};

const admin = async (req, res, next) => {
  try {
    const account = await accountFor(req, true);
    if (!account) return res.status(401).json({ error: 'Staff sign-in required.' });
    if (!['admin', 'superadmin'].includes(account.role)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    req.staff = account;
    req.body = { ...req.body, reviewerId: Number(account.id), reviewedBy: Number(account.id) };
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (error) { next(error); }
};

const publicOrLearner = async (req, res, next) => {
  if (['mine', 'saved'].includes(req.query.view) || req.query.onlySaved === 'true') {
    return learner(req, res, next);
  }
  try {
    // Invalid/expired cookies must not prevent reading public content.
    const account = await accountFor(req, false);
    if (account) req.appUser = account;
    next();
  } catch (error) { next(error); }
};

// Strip contact information from public question responses, including nested
// saved-question responses. Submission history/admin responses stay private.
const responsePolicy = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const original = res.json.bind(res);
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['phone', 'email', 'userEmail'].includes(key))
      .map(([key, item]) => [key, clean(item)]));
  };
  res.json = value => original(req.staff || req.path.includes('submissions') || req.query.view === 'mine'
    ? value : clean(value));
  next();
};

module.exports = { learner, admin, publicOrLearner, responsePolicy };
