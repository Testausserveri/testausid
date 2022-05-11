const { randomUUID, randomBytes } = require("crypto")

/**
 * Generate a random hex string
 * @param {number} size
 * @returns {string}
 */
function generateRandomString(size) {
    return randomBytes(size).toString("hex")
}

/**
 * Generate a random UUID
 * @returns {String}
 */
function generateId() {
    return randomUUID()
}

/**
 * Generate a random client ID
 * @returns {String}
 */
function generateClientId() {
    return new Array(2)
        .fill(0)
        .map(() => randomBytes(8).readBigUInt64BE(0, true).toString())
        .join("")
}

module.exports = {
    generateRandomString,
    generateId,
    generateClientId
}
