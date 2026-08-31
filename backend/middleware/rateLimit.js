function createRateLimiter({ windowMs = 60 * 1000, max = 30, message = 'Too many requests, please try again later.' } = {}) {
    const requestLog = new Map();

    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, timestamps] of requestLog.entries()) {
            const validTimestamps = timestamps.filter((time) => now - time < windowMs);
            if (validTimestamps.length === 0) {
                requestLog.delete(ip);
            } else {
                requestLog.set(ip, validTimestamps);
            }
        }
    }, windowMs);

    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return function rateLimitMiddleware(req, res, next) {
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        const timestamps = requestLog.get(clientIp) || [];
        const recentTimestamps = timestamps.filter((time) => now - time < windowMs);

        if (recentTimestamps.length >= max) {
            const oldestRequest = recentTimestamps[0];
            const retryAfterSeconds = Math.ceil((windowMs - (now - oldestRequest)) / 1000);

            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                error: message,
                retryAfter: retryAfterSeconds,
            });
        }

        recentTimestamps.push(now);
        requestLog.set(clientIp, recentTimestamps);
        next();
    };
}

module.exports = {
    createRateLimiter,
};
