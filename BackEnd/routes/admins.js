const express = require("express");

const {
    administratorRole,
    createAdminAccount,
    deleteAdminAccount,
    listAdminAccounts,
    ownerRole,
    updateAdminAccount,
    verifyAdminCredentials,
} = require("../utils/adminStore");
const {
    createAdminToken,
    requireAdminAuth,
    requireOwnerRole,
} = require("../utils/adminAuth");

const router = express.Router();

router.post("/login", async (req, res, next) => {
    try {
        const adminAccount = await verifyAdminCredentials(req.body?.username, req.body?.password);

        if (!adminAccount) {
            return res.status(401).json({ error: "The username or password is incorrect." });
        }

        return res.json({
            token: await createAdminToken(adminAccount),
            admin: adminAccount,
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/me", requireAdminAuth, async (req, res) => {
    return res.json({ admin: req.admin });
});

router.get("/accounts", requireAdminAuth, async (req, res, next) => {
    try {
        const accounts = await listAdminAccounts();

        if (req.admin.role !== ownerRole) {
            return res.json({
                accounts: accounts.filter((account) => account.id === req.admin.id),
            });
        }

        return res.json({ accounts });
    } catch (error) {
        return next(error);
    }
});

router.post("/accounts", requireOwnerRole, async (req, res, next) => {
    try {
        const account = await createAdminAccount({
            username: req.body?.username,
            password: req.body?.password,
            role: req.body?.role || administratorRole,
        });

        return res.status(201).json({ account });
    } catch (error) {
        return next(error);
    }
});

router.put("/accounts/:adminId", requireAdminAuth, async (req, res, next) => {
    try {
        const targetAdminId = String(req.params.adminId || "");
        const isSelf = targetAdminId === req.admin.id;
        const isOwner = req.admin.role === ownerRole;

        if (!isSelf && !isOwner) {
            return res.status(403).json({ error: "You can only manage your own password." });
        }

        if (!isOwner) {
            const requestedKeys = Object.keys(req.body || {});
            const hasOnlyPasswordUpdate = requestedKeys.length === 1 && requestedKeys[0] === "password";

            if (!hasOnlyPasswordUpdate) {
                return res.status(403).json({ error: "Administrators can only update their own password." });
            }
        }

        const updates = {
            ...(isOwner && Object.prototype.hasOwnProperty.call(req.body || {}, "username")
                ? { username: req.body.username }
                : {}),
            ...(isOwner && Object.prototype.hasOwnProperty.call(req.body || {}, "role")
                ? { role: req.body.role }
                : {}),
            ...(Object.prototype.hasOwnProperty.call(req.body || {}, "password")
                ? { password: req.body.password }
                : {}),
        };
        const account = await updateAdminAccount(targetAdminId, updates);

        return res.json({ account });
    } catch (error) {
        return next(error);
    }
});

router.delete("/accounts/:adminId", requireOwnerRole, async (req, res, next) => {
    try {
        const targetAdminId = String(req.params.adminId || "");

        if (targetAdminId === req.admin.id) {
            return res.status(400).json({ error: "You cannot delete your own admin account." });
        }

        const account = await deleteAdminAccount(targetAdminId);

        return res.json({ account });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
