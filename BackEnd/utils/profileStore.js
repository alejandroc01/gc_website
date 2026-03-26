const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const seedProfiles = require("../data/mockProfiles");
const { parseCsvRecords } = require("./csvParser");
const {
    copyBundledStorageFileIfMissing,
    storageDirectory,
} = require("./storageConfig");

const profilePlaceholderImageUrl = "/images/profile-plank.svg";
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
    await copyBundledStorageFileIfMissing("profiles.json");

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

async function createProfile(profileInput) {
    const store = await readStore();
    const now = new Date().toISOString();
    const nextProfile = buildManualProfileRecord(profileInput, now);
    const lookupKey = buildProfileLookupKey(nextProfile);

    ensureManualProfileLookupKey(lookupKey);
    assertProfileLookupKeyIsUnique(store.profiles, lookupKey);

    const createdProfile = {
        ...nextProfile,
        id: `profile-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
        profileImageMode: "placeholder",
        profileImageUrl: profilePlaceholderImageUrl,
    };

    store.profiles.push(createdProfile);
    store.profiles.sort(compareProfiles);
    await writeStore(store);

    return toProfileResponse(createdProfile);
}

async function updateProfile(profileId, profileInput) {
    const store = await readStore();
    const profileIndex = store.profiles.findIndex((entry) => String(entry.id) === String(profileId));

    if (profileIndex === -1) {
        return null;
    }

    const existingProfile = store.profiles[profileIndex];
    const now = new Date().toISOString();
    const nextProfileData = buildManualProfileRecord(
        {
            ...existingProfile,
            ...profileInput,
        },
        now,
    );
    const lookupKey = buildProfileLookupKey(nextProfileData);

    ensureManualProfileLookupKey(lookupKey);
    assertProfileLookupKeyIsUnique(store.profiles, lookupKey, existingProfile.id);

    const updatedProfile = {
        ...existingProfile,
        ...nextProfileData,
        id: existingProfile.id,
        createdAt: existingProfile.createdAt || now,
        updatedAt: now,
        profileImageMode: existingProfile.profileImageMode || "placeholder",
        profileImageUrl: existingProfile.profileImageUrl || profilePlaceholderImageUrl,
    };

    store.profiles[profileIndex] = updatedProfile;
    store.profiles.sort(compareProfiles);
    await writeStore(store);

    return toProfileResponse(updatedProfile);
}

async function deleteProfile(profileId) {
    const store = await readStore();
    const profileIndex = store.profiles.findIndex((entry) => String(entry.id) === String(profileId));

    if (profileIndex === -1) {
        return null;
    }

    const [deletedProfile] = store.profiles.splice(profileIndex, 1);
    await writeStore(store);

    return toProfileResponse(deletedProfile);
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

function buildManualProfileRecord(profileInput, timestamp) {
    return normalizeStoredProfile({
        firstName: sanitizeRequiredText(profileInput?.firstName, "First name"),
        lastName: sanitizeRequiredText(profileInput?.lastName, "Last name"),
        preferredName: sanitizeOptionalText(profileInput?.preferredName, 80),
        graduationYear: sanitizeRequiredGraduationYear(profileInput?.graduationYear),
        city: sanitizeOptionalText(profileInput?.city, 80),
        stateProvince: sanitizeOptionalText(profileInput?.stateProvince, 80),
        email: sanitizeOptionalText(profileInput?.email, 120),
        candlelightDate: sanitizeOptionalText(profileInput?.candlelightDate, 40),
        deceased: parseFlexibleBoolean(profileInput?.deceased),
        department: sanitizeOptionalText(profileInput?.department, 120),
        emeritus: parseFlexibleBoolean(profileInput?.emeritus),
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

function ensureManualProfileLookupKey(lookupKey) {
    if (lookupKey) {
        return;
    }

    const error = new Error("Member profiles require a first name, last name, and class year.");
    error.statusCode = 400;
    throw error;
}

function normalizeGraduationYear(value) {
    const normalizedValue = String(value || "").trim();

    if (!/^\d{4}$/.test(normalizedValue)) {
        return null;
    }

    return Number(normalizedValue);
}

function sanitizeRequiredGraduationYear(value) {
    const normalizedValue = String(value || "").trim();

    if (!normalizedValue) {
        const error = new Error("Class year is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^\d{4}$/.test(normalizedValue)) {
        const error = new Error("Class year must be a four-digit year.");
        error.statusCode = 400;
        throw error;
    }

    const yearNumber = Number(normalizedValue);

    if (yearNumber < 1900 || yearNumber > 2100) {
        const error = new Error("Class year must be between 1900 and 2100.");
        error.statusCode = 400;
        throw error;
    }

    return yearNumber;
}

function sanitizeRequiredText(value, label) {
    const normalizedValue = sanitizeOptionalText(value, 80);

    if (normalizedValue) {
        return normalizedValue;
    }

    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
}

function sanitizeOptionalText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function parseBooleanFlag(value) {
    return /^(yes|true|1|y)$/i.test(String(value || "").trim());
}

function parseFlexibleBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    return /^(yes|true|1|y|on)$/i.test(String(value || "").trim());
}

function assertProfileLookupKeyIsUnique(profiles, lookupKey, excludedProfileId = null) {
    const conflictingProfile = profiles.find((profile) => {
        if (excludedProfileId && String(profile.id) === String(excludedProfileId)) {
            return false;
        }

        return buildProfileLookupKey(profile) === lookupKey;
    });

    if (!conflictingProfile) {
        return;
    }

    const error = new Error(
        `A member profile already exists for ${conflictingProfile.displayName} (${conflictingProfile.graduationYear || "Unknown"}).`,
    );
    error.statusCode = 409;
    throw error;
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
    createProfile,
    deleteProfile,
    ensureProfileStore,
    getProfileById,
    importProfilesFromCsv,
    listProfiles,
    profilePlaceholderImageUrl,
    profileStorePath,
    requiredCsvHeaders,
    updateProfile,
};
