const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const seedProfiles = require("../data/mockProfiles");
const { parseCsvRecords } = require("./csvParser");

const profilePlaceholderImageUrl = "/images/profile-plank.svg";
const storageDirectory = process.env.BACKEND_STORAGE_DIR
    ? path.resolve(process.env.BACKEND_STORAGE_DIR)
    : path.join(__dirname, "..", "storage");
const profileStorePath = path.join(storageDirectory, "profiles.json");
const requiredCsvHeaders = [
    "Class (C)",
    "Last Name",
    "First Name",
    "Preferred Name",
    "City",
    "State/Province",
    "Email 1",
    "Candlelight Date (C)",
    "Deceased",
    "Department",
    "Emeritus (C)",
];

async function ensureProfileStore() {
    await fs.mkdir(storageDirectory, { recursive: true });

    try {
        await fs.access(profileStorePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        const now = new Date().toISOString();
        const defaultStore = {
            profiles: seedProfiles.map((profile) => normalizeSeedProfile(profile, now)),
        };

        await fs.writeFile(profileStorePath, JSON.stringify(defaultStore, null, 2));
    }
}

async function readStore() {
    await ensureProfileStore();

    const rawStore = await fs.readFile(profileStorePath, "utf8");

    if (!rawStore.trim()) {
        return { profiles: [] };
    }

    const parsedStore = JSON.parse(rawStore);
    const profiles = Array.isArray(parsedStore.profiles) ? parsedStore.profiles : [];

    return {
        profiles: profiles.map((profile) => normalizeStoredProfile(profile)),
    };
}

async function writeStore(store) {
    await ensureProfileStore();
    await fs.writeFile(profileStorePath, JSON.stringify(store, null, 2));
}

async function listProfiles() {
    const store = await readStore();

    return store.profiles
        .map((profile) => toProfileResponse(profile))
        .sort(compareProfiles);
}

async function getProfileById(profileId) {
    const store = await readStore();
    const profile = store.profiles.find((entry) => String(entry.id) === String(profileId));

    return profile ? toProfileResponse(profile) : null;
}

async function importProfilesFromCsv(csvText) {
    const { headers, rows } = parseCsvRecords(csvText);

    validateCsvHeaders(headers);

    const store = await readStore();
    const now = new Date().toISOString();
    const profilesByKey = new Map(
        store.profiles
            .map((profile) => [buildProfileLookupKey(profile), profile])
            .filter(([key]) => Boolean(key)),
    );

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
        if (isEmptyCsvRow(row)) {
            skippedCount += 1;
            continue;
        }

        const incomingProfile = toProfileFromCsvRow(row, now);
        const lookupKey = buildProfileLookupKey(incomingProfile);

        if (!lookupKey) {
            skippedCount += 1;
            continue;
        }

        const existingProfile = profilesByKey.get(lookupKey);

        if (existingProfile) {
            Object.assign(existingProfile, {
                ...existingProfile,
                ...incomingProfile,
                id: existingProfile.id,
                createdAt: existingProfile.createdAt || now,
                updatedAt: now,
                profileImageMode: existingProfile.profileImageMode || "placeholder",
                profileImageUrl: existingProfile.profileImageUrl || profilePlaceholderImageUrl,
            });
            updatedCount += 1;
            continue;
        }

        const nextProfile = {
            ...incomingProfile,
            id: `profile-${crypto.randomUUID()}`,
            createdAt: now,
            updatedAt: now,
            profileImageMode: "placeholder",
            profileImageUrl: profilePlaceholderImageUrl,
        };

        store.profiles.push(nextProfile);
        profilesByKey.set(lookupKey, nextProfile);
        importedCount += 1;
    }

    store.profiles.sort(compareProfiles);
    await writeStore(store);

    return {
        importedCount,
        updatedCount,
        skippedCount,
        totalProfiles: store.profiles.length,
        profiles: store.profiles.map((profile) => toProfileResponse(profile)),
    };
}

function normalizeSeedProfile(profile, timestamp) {
    return normalizeStoredProfile({
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        preferredName: profile.firstName || "",
        displayName: profile.displayName || buildDisplayName(profile.firstName, profile.lastName, profile.firstName),
        graduationYear: profile.graduationYear || null,
        city: "",
        stateProvince: "",
        email: "",
        candlelightDate: "",
        deceased: false,
        department: "",
        emeritus: false,
        profileImageMode: "placeholder",
        profileImageUrl: profilePlaceholderImageUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
    });
}

function normalizeStoredProfile(profile) {
    const firstName = String(profile.firstName || "").trim();
    const lastName = String(profile.lastName || "").trim();
    const preferredName = String(profile.preferredName || firstName).trim();
    const displayName = buildDisplayName(firstName, lastName, preferredName);

    return {
        id: String(profile.id || `profile-${crypto.randomUUID()}`),
        firstName,
        lastName,
        preferredName,
        displayName,
        graduationYear: normalizeGraduationYear(profile.graduationYear),
        city: String(profile.city || "").trim(),
        stateProvince: String(profile.stateProvince || "").trim(),
        email: String(profile.email || "").trim(),
        candlelightDate: String(profile.candlelightDate || "").trim(),
        deceased: Boolean(profile.deceased),
        department: String(profile.department || "").trim(),
        emeritus: Boolean(profile.emeritus),
        profileImageMode: profile.profileImageMode || "placeholder",
        profileImageUrl: profile.profileImageUrl || profilePlaceholderImageUrl,
        createdAt: profile.createdAt || new Date().toISOString(),
        updatedAt: profile.updatedAt || new Date().toISOString(),
    };
}

function toProfileResponse(profile) {
    return {
        ...profile,
        graduationYear: profile.graduationYear || null,
    };
}

function validateCsvHeaders(headers) {
    const missingHeaders = requiredCsvHeaders.filter((header) => !headers.includes(header));

    if (missingHeaders.length > 0) {
        const error = new Error(`CSV is missing required columns: ${missingHeaders.join(", ")}`);
        error.statusCode = 400;
        throw error;
    }
}

function isEmptyCsvRow(row) {
    return requiredCsvHeaders.every((header) => String(row[header] || "").trim() === "");
}

function toProfileFromCsvRow(row, timestamp) {
    const firstName = String(row["First Name"] || "").trim();
    const lastName = String(row["Last Name"] || "").trim();
    const preferredName = String(row["Preferred Name"] || firstName).trim();

    return normalizeStoredProfile({
        firstName,
        lastName,
        preferredName,
        displayName: buildDisplayName(firstName, lastName, preferredName),
        graduationYear: row["Class (C)"],
        city: row["City"],
        stateProvince: row["State/Province"],
        email: row["Email 1"],
        candlelightDate: row["Candlelight Date (C)"],
        deceased: parseBooleanFlag(row["Deceased"]),
        department: row["Department"],
        emeritus: parseBooleanFlag(row["Emeritus (C)"]),
        profileImageMode: "placeholder",
        profileImageUrl: profilePlaceholderImageUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
    });
}

function buildDisplayName(firstName, lastName, preferredName) {
    const normalizedFirstName = String(firstName || "").trim();
    const normalizedLastName = String(lastName || "").trim();
    const normalizedPreferredName = String(preferredName || "").trim();
    const hasDistinctPreferredName = (
        normalizedPreferredName
        && normalizedFirstName
        && normalizedPreferredName.localeCompare(normalizedFirstName, undefined, {
            sensitivity: "base",
        }) !== 0
    );

    if (hasDistinctPreferredName) {
        return [normalizedFirstName, `"${normalizedPreferredName}"`, normalizedLastName]
            .filter(Boolean)
            .join(" ")
            .trim();
    }

    return [normalizedFirstName || normalizedPreferredName, normalizedLastName].filter(Boolean).join(" ").trim();
}

function buildProfileLookupKey(profile) {
    const year = normalizeGraduationYear(profile.graduationYear);
    const firstName = String(profile.firstName || "").trim().toLowerCase();
    const lastName = String(profile.lastName || "").trim().toLowerCase();

    if (!firstName && !lastName) {
        return "";
    }

    return [year || "na", lastName || "na", firstName || "na"].join("|");
}

function normalizeGraduationYear(value) {
    const normalizedValue = String(value || "").trim();

    if (!/^\d{4}$/.test(normalizedValue)) {
        return null;
    }

    return Number(normalizedValue);
}

function parseBooleanFlag(value) {
    return /^(yes|true|1|y)$/i.test(String(value || "").trim());
}

function compareProfiles(leftProfile, rightProfile) {
    return [
        compareStrings(leftProfile.lastName, rightProfile.lastName),
        compareStrings(leftProfile.firstName, rightProfile.firstName),
        compareStrings(String(leftProfile.graduationYear || ""), String(rightProfile.graduationYear || "")),
    ].find((result) => result !== 0) || 0;
}

function compareStrings(leftValue, rightValue) {
    return String(leftValue || "").localeCompare(String(rightValue || ""), undefined, {
        sensitivity: "base",
    });
}

module.exports = {
    ensureProfileStore,
    getProfileById,
    importProfilesFromCsv,
    listProfiles,
    profilePlaceholderImageUrl,
    profileStorePath,
    requiredCsvHeaders,
};
