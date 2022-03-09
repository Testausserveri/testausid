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

module.exports = {
    generateRandomString,
    generateId
}
