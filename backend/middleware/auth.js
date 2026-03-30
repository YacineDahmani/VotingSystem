const jwt = require('jsonwebtoken');

function createAuthMiddleware(jwtSecret) {
    function requireAuth(req, res, next) {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }

        try {
            const decoded = jwt.verify(token, jwtSecret);
            req.auth = decoded;
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired authorization token' });
        }
    }

    function requireAdminAuth(req, res, next) {
        requireAuth(req, res, () => {
            if (req.auth?.role !== 'admin') {
                return res.status(403).json({ error: 'Admin access is required' });
            }
            next();
        });
    }

    function requireVoterAuth(req, res, next) {
        requireAuth(req, res, () => {
            if (req.auth?.role !== 'voter') {
                return res.status(403).json({ error: 'Voter access is required' });
            }
            next();
        });
    }

    function issueAuthToken(payload) {
        return jwt.sign(payload, jwtSecret, { expiresIn: '12h' });
    }

    return {
        issueAuthToken,
        requireAuth,
        requireAdminAuth,
        requireVoterAuth,
    };
}

module.exports = {
    createAuthMiddleware,
};
