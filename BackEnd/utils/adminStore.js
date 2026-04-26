const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { promisify } = require("util");

const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");

const scrypt = promisify(crypto.scrypt);
const adminStorePath = path.join(storageDirectory, "admins.json");
const ownerRole = "Owner";
const administratorRole = "Administrator";
const adminRoles = new Set([ownerRole, administratorRole]);
const defaultAdminUsername = "admin";
const defaultAdminPassword = "8?,<Y~0mD4$-#wCCRS8QcZf{X";

async function ensureAdminStore() {
    await copyBundledStorageFileIfMissing("admins.json");

    try {
        await fs.access(adminStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        await writeStore(await buildDefaultStore());
        return;
    }

    const store = await readStore();

    if (store.admins.length === 0) {
        await writeStore(await buildDefaultStore());
    }
}

async function listAdminAccounts() {
    const store = await readStore();
    return store.admins.map(toPublicAdminAccount);
}

async function getAdminAccountById(adminId) {
    const store = await readStore();
    const account = store.admins.find((admin) => admin.id === String(adminId || ""));

    return account ? toPublicAdminAccount(account) : null;
}

async function verifyAdminCredentials(username, password) {
    const normalizedUsername = normalizeUsername(username);
    const store = await readStore();
    const account = store.admins.find((admin) => admin.username.toLowerCase() === normalizedUsername.toLowerCase());

    if (!account) {
        return null;
    }

    const isValidPassword = await verifyPassword(password, account.passwordSalt, account.passwordHash);

    return isValidPassword ? toPublicAdminAccount(account) : null;
}

async function createAdminAccount({ username, password, role }) {
    const normalizedUsername = sanitizeUsername(username);
    const normalizedPassword = sanitizePassword(password);
    const normalizedRole = sanitizeRole(role);
    const store = await readStore();

    assertUniqueUsername(store, normalizedUsername);

    const passwordRecord = await hashPassword(normalizedPassword);
    const now = new Date().toISOString();
    const nextAccount = {
        id: crypto.randomUUID(),
        username: normalizedUsername,
        role: normalizedRole,
        passwordHash: passwordRecord.passwordHash,
        passwordSalt: passwordRecord.passwordSalt,
        createdAt: now,
        updatedAt: now,
    };

    store.admins.push(nextAccount);
    await writeStore(store);

    return toPublicAdminAccount(nextAccount);
}

async function updateAdminAccount(adminId, updates = {}) {
    const store = await readStore();
    const accountIndex = store.admins.findIndex((admin) => admin.id === String(adminId || ""));

    if (accountIndex < 0) {
        const error = new Error("Admin account not found.");
        error.statusCode = 404;
        throw error;
    }

    const currentAccount = store.admins[accountIndex];
    const nextAccount = {
        ...currentAccount,
        updatedAt: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(updates, "username")) {
        const nextUsername = sanitizeUsername(updates.username);

        if (nextUsername.toLowerCase() !== currentAccount.username.toLowerCase()) {
            assertUniqueUsername(store, nextUsername);
        }

        nextAccount.username = nextUsername;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "role")) {
        const nextRole = sanitizeRole(updates.role);

        if (currentAccount.role === ownerRole && nextRole !== ownerRole && countOwners(store.admins) <= 1) {
            const error = new Error("At least one Owner account is required.");
            error.statusCode = 400;
            throw error;
        }

        nextAccount.role = nextRole;
    }

    if (Object.prototype.hasOwnProperty.call(updates, "password")) {
        const nextPassword = sanitizePassword(updates.password);
        const passwordRecord = await hashPassword(nextPassword);
        nextAccount.passwordHash = passwordRecord.passwordHash;
        nextAccount.passwordSalt = passwordRecord.passwordSalt;
    }

    store.admins[accountIndex] = nextAccount;
    await writeStore(store);

    return toPublicAdminAccount(nextAccount);
}

async function deleteAdminAccount(adminId) {
    const store = await readStore();
    const accountIndex = store.admins.findIndex((admin) => admin.id === String(adminId || ""));

    if (accountIndex < 0) {
        const error = new Error("Admin account not found.");
        error.statusCode = 404;
        throw error;
    }

    const [account] = store.admins.splice(accountIndex, 1);

    if (account.role === ownerRole && countOwners(store.admins) === 0) {
        const error = new Error("At least one Owner account is required.");
        error.statusCode = 400;
        throw error;
    }

    await writeStore(store);

    return toPublicAdminAccount(account);
}

async function buildDefaultStore() {
    const now = new Date().toISOString();
    const passwordRecord = await hashPassword(defaultAdminPassword);

    return {
        admins: [
            {
                id: crypto.randomUUID(),
                username: defaultAdminUsername,
                role: ownerRole,
                passwordHash: passwordRecord.passwordHash,
                passwordSalt: passwordRecord.passwordSalt,
                createdAt: now,
                updatedAt: now,
            },
        ],
    };
}

async function readStore() {
    try {
        const rawStore = await fs.readFile(adminStorePath, "utf8");

        if (!rawStore.trim()) {
            return { admins: [] };
        }

        return normalizeAdminStore(JSON.parse(rawStore));
    } catch (error) {
        if (error.code === "ENOENT") {
            return { admins: [] };
        }

        throw error;
    }
}

async function writeStore(store) {
    await fs.mkdir(path.dirname(adminStorePath), { recursive: true });
    await fs.writeFile(adminStorePath, JSON.stringify(normalizeAdminStore(store), null, 2));
}

function normalizeAdminStore(store) {
    return {
        admins: (Array.isArray(store?.admins) ? store.admins : [])
            .map(normalizeAdminAccount)
            .filter(Boolean),
    };
}

function normalizeAdminAccount(account) {
    const id = String(account?.id || "").trim();
    const username = normalizeUsername(account?.username);
    const role = normalizeRole(account?.role);
    const passwordHash = String(account?.passwordHash || "").trim();
    const passwordSalt = String(account?.passwordSalt || "").trim();

    if (!id || !username || !passwordHash || !passwordSalt) {
        return null;
    }

    return {
        id,
        username,
        role,
        passwordHash,
        passwordSalt,
        createdAt: normalizeOptionalString(account?.createdAt),
        updatedAt: normalizeOptionalString(account?.updatedAt),
    };
}

function toPublicAdminAccount(account) {
    return {
        id: account.id,
        username: account.username,
        role: account.role,
        createdAt: account.createdAt || null,
        updatedAt: account.updatedAt || null,
    };
}

async function hashPassword(password) {
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = (await scrypt(String(password), passwordSalt, 64)).toString("hex");

    return {
        passwordHash,
        passwordSalt,
    };
}

async function verifyPassword(password, passwordSalt, expectedPasswordHash) {
    const actualPasswordHash = (await scrypt(String(password || ""), passwordSalt, 64)).toString("hex");
    const actualBuffer = Buffer.from(actualPasswordHash, "hex");
    const expectedBuffer = Buffer.from(expectedPasswordHash, "hex");

    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function assertUniqueUsername(store, username) {
    const hasDuplicate = store.admins.some((admin) => admin.username.toLowerCase() === username.toLowerCase());

    if (hasDuplicate) {
        const error = new Error("An admin account with that username already exists.");
        error.statusCode = 409;
        throw error;
    }
}

function countOwners(admins) {
    return admins.filter((admin) => admin.role === ownerRole).length;
}

function sanitizeUsername(username) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
        const error = new Error("Enter a username.");
        error.statusCode = 400;
        throw error;
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 40) {
        const error = new Error("Admin usernames must be between 3 and 40 characters.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^[a-z0-9_.-]+$/i.test(normalizedUsername)) {
        const error = new Error("Admin usernames can use letters, numbers, dots, dashes, and underscores.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedUsername;
}

function normalizeUsername(username) {
    return String(username || "").trim();
}

function sanitizePassword(password) {
    const normalizedPassword = String(password || "");

    if (normalizedPassword.length < 8) {
        const error = new Error("Admin passwords must be at least 8 characters.");
        error.statusCode = 400;
        throw error;
    }

    if (normalizedPassword.length > 256) {
        const error = new Error("Admin passwords must be 256 characters or fewer.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedPassword;
}

function sanitizeRole(role) {
    const normalizedRole = normalizeRole(role);

    if (!adminRoles.has(normalizedRole)) {
        const error = new Error("Choose a valid admin role.");
        error.statusCode = 400;
        throw error;
    }

    return normalizedRole;
}

function normalizeRole(role) {
    const normalizedRole = String(role || "").trim();
    return adminRoles.has(normalizedRole) ? normalizedRole : administratorRole;
}

function normalizeOptionalString(value) {
    const normalizedValue = String(value || "").trim();
    return normalizedValue || null;
}

module.exports = {
    administratorRole,
    adminStorePath,
    createAdminAccount,
    deleteAdminAccount,
    ensureAdminStore,
    getAdminAccountById,
    listAdminAccounts,
    ownerRole,
    updateAdminAccount,
    verifyAdminCredentials,
};
