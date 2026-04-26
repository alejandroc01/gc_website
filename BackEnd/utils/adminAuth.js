const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { storageDirectory } = require("./storageConfig");
const {
    getAdminAccountById,
    ownerRole,
} = require("./adminStore");

const adminTokenSecretPath = path.join(storageDirectory, "adminTokenSecret.txt");
const adminTokenLifetimeMs = 12 * 60 * 60 * 1000;

async function createAdminToken(adminAccount) {
    const now = Date.now();
    const payload = {
        sub: adminAccount.id,
        username: adminAccount.username,
        role: adminAccount.role,
        iat: now,
        exp: now + adminTokenLifetimeMs,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = await signTokenPayload(encodedPayload);

    return `${encodedPayload}.${signature}`;
}

async function verifyAdminToken(token) {
    const normalizedToken = String(token || "").trim();
    const [encodedPayload, signature] = normalizedToken.split(".");

    if (!encodedPayload || !signature) {
        return null;
    }

    const expectedSignature = await signTokenPayload(encodedPayload);

    if (!timingSafeEqual(signature, expectedSignature)) {
        return null;
    }

    let payload = null;

    try {
        payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
        return null;
    }

    if (!payload?.sub || Number(payload.exp) <= Date.now()) {
        return null;
    }

    return getAdminAccountById(payload.sub);
}

async function requireAdminAuth(req, res, next) {
    try {
        const adminAccount = await verifyAdminToken(extractBearerToken(req));

        if (!adminAccount) {
            return res.status(401).json({ error: "Sign in with an admin account to continue." });
        }

        req.admin = adminAccount;
        return next();
    } catch (error) {
        return next(error);
    }
}

async function requireOwnerRole(req, res, next) {
    await requireAdminAuth(req, res, (error) => {
        if (error) {
            return next(error);
        }

        if (req.admin?.role !== ownerRole) {
            return res.status(403).json({ error: "Owner permissions are required." });
        }

        return next();
    });
}

function extractBearerToken(req) {
    const authorizationHeader = String(req.headers.authorization || "").trim();
    const bearerMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);

    return bearerMatch?.[1] || "";
}

async function signTokenPayload(encodedPayload) {
    const secret = await ensureAdminTokenSecret();

    return crypto
        .createHmac("sha256", secret)
        .update(encodedPayload)
        .digest("base64url");
}

async function ensureAdminTokenSecret() {
    try {
        const secret = await fs.readFile(adminTokenSecretPath, "utf8");
        const normalizedSecret = secret.trim();

        if (normalizedSecret) {
            return normalizedSecret;
        }
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }

    const nextSecret = crypto.randomBytes(48).toString("base64url");
    await fs.mkdir(path.dirname(adminTokenSecretPath), { recursive: true });
    await fs.writeFile(adminTokenSecretPath, `${nextSecret}\n`);

    return nextSecret;
}

function timingSafeEqual(leftValue, rightValue) {
    const leftBuffer = Buffer.from(String(leftValue || ""));
    const rightBuffer = Buffer.from(String(rightValue || ""));

    return leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
    return Buffer.from(String(value)).toString("base64url");
}

function base64UrlDecode(value) {
    return Buffer.from(String(value), "base64url").toString("utf8");
}

module.exports = {
    createAdminToken,
    requireAdminAuth,
    requireOwnerRole,
    verifyAdminToken,
};
