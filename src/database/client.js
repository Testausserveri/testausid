const { connect } = require("mongoose")
const { generateRandomString } = require("../util/generate")
const { applicationRegistrationModel, authenticationSessionModel } = require("./schemas")

/**
 * Connect to the database or validate the connection status
 * @returns {Promise<void>}
 */
async function prepareConnection() {
    return new Promise((resolve, reject) => {
        if (global.databaseConnected !== true) {
            connect(process.env.DATABASE_URL)
                .then((db) => {
                    global.databaseConnected = true
                    db.connection.once("error", (err) => {
                        console.error("Mongoose error:", err)
                        setTimeout(async () => {
                            console.warn("Trying to reconnect...")
                            await prepareConnection()
                            resolve()
                        }, 5000)
                    })
                    resolve()
                })
                // eslint-disable-next-line prefer-promise-reject-errors
                .catch((...err) => reject(...err))
        } else {
            resolve()
        }
    })
}

// Database utility functions

/**
 * Get application data
 * @param {string} id Application id
 * @returns {Promise<import("../typings/schemas").applicationRegistration>}
 */
async function getApplication(id) {
    await prepareConnection()
    return applicationRegistrationModel.findOne({ id }).exec()
}

const allowedScopes = ["token", "id", "account", "contact", "security"]

/**
 * Create a new authentication session
 * @param {String} applicationId The authenticating application id
 * @param {String[]} scopes Authentication scopes
 * @param {String} redirectURL Redirection URL
 * @param {String} state Application generated state
 * @param {String} internalState Internal authentication state
 * @param {String} redirectId Method selection redirect id
 * @returns {Promise<any>}
 */
async function createAuthenticationSession(
    applicationId, scopes, redirectURL, state, internalState, redirectId
) {
    await prepareConnection()
    const application = await getApplication(applicationId)
    // Validate information
    if (application === null) throw new Error("safe: Invalid application id")
    if (!application.redirectURLs.includes(redirectURL)) throw new Error("safe: Unknown redirect URL")
    const invalidScopes = scopes.filter((scope) => !allowedScopes.includes(scope))
    if (invalidScopes.length !== 0) throw new Error(`safe: Invalid scopes: ${invalidScopes.join(",")}. Allowed: ${allowedScopes.join(",")}`)
    return authenticationSessionModel.create({
        applicationId: application.id,
        redirectURL,
        authenticationPlatform: null,
        status: "created",
        state,
        internalState,
        redirectId,
        code: null,
        token: null,
        scopes,
        user: {
            name: null,
            id: null,
            token: null
        },
        timestamp: new Date().getTime()
    })
}

/**
 * Update authentication session fields
 * @param {Object} query
 * @param {import("../typings/schemas").authenticationSession} fields
 * @returns {Promise<any>}
 */
async function updateAuthenticationSession(query, fields) {
    await prepareConnection()
    const exists = (await authenticationSessionModel.findOne(query).exec()) !== null
    if (!exists) throw new Error("safe: Session does not exist.")
    return authenticationSessionModel.updateOne(query, { $set: fields })
}

/**
 * Get authentication session
 * @param {Object} query
 * @returns {Promise<import("../typings/schemas").authenticationSession|null>}
 */
async function getAuthenticationSession(query) {
    await prepareConnection()
    return authenticationSessionModel.findOne(query).exec()
}

/**
 * Remove an authentication session
 * @param {String} query
 * @returns {Promise<void>}
 */
async function removeAuthenticationSession(query) {
    await prepareConnection()
    const exists = (await authenticationSessionModel.findOne(query).exec()) !== null
    if (!exists) throw new Error("safe: Session does not exist.")
    return authenticationSessionModel.deleteOne(query)
}

const expiryForStatuses = {
    created: 2 * 60000, // 2 minutes
    pending: 5 * 60000, // 5 minutes
    completed: 60000, // 1 minute
    stored: 2 * 60000 // 2 minutes
}

/**
 * Create session expiry check loop
 * @returns {NodeJS.Timer}
 */
async function createExpiryCheckLoop() {
    const check = async () => {
        await prepareConnection()
        for await (const session of authenticationSessionModel.find()) {
            if (parseInt(session.timestamp, 10) + expiryForStatuses[session.status] < new Date().getTime()) {
                await authenticationSessionModel.deleteOne({ id: session.id })
            }
        }
    }
    check() // Run once immediately
    return setInterval(check, 30000) // Run every 30 seconds
}

/**
 * Create a new application
 * @param {string} name
 * @param {string} homepage
 * @param {string} icon Base64 png image
 * @param {string} redirectURLs
 * @returns {Promise<void>}
 */
async function createApplication(
    name, homepage, icon, redirectURLs
) {
    await prepareConnection()
    if (typeof name !== "string") throw new Error("Invalid application name")
    return applicationRegistrationModel.create({
        id: generateRandomString(16),
        secret: generateRandomString(32),
        name,
        homepage: homepage ?? "",
        icon: icon ?? "",
        redirectURLs: redirectURLs ?? []
    })
}

/**
 * Update an application
 * @param {Object} query
 * @param {Object} fields
 * @returns {Promise<void>}
 */
async function updateApplication(query, fields) {
    await prepareConnection()
    const exists = (await applicationRegistrationModel.findOne(query).exec()) !== null
    if (!exists) throw new Error("safe: Session does not exist.")
    return applicationRegistrationModel.updateOne(query, { $set: fields })
}

/**
 * Get all applications
 * @returns {Promise<void>}
 */
function getApplications() {
    return applicationRegistrationModel.find().exec()
}

/**
 * Remove application
 * @param {Object} query
 * @returns {Promise<void>}
 */
async function removeApplication(query) {
    await prepareConnection()
    const exists = (await applicationRegistrationModel.findOne(query).exec()) !== null
    if (!exists) throw new Error("safe: Session does not exist.")
    return applicationRegistrationModel.deleteOne(query)
}

module.exports = {
    prepareConnection,
    getApplication,
    createAuthenticationSession,
    updateAuthenticationSession,
    getAuthenticationSession,
    removeAuthenticationSession,
    createExpiryCheckLoop,
    expiryForStatuses,
    allowedScopes,
    createApplication,
    updateApplication,
    getApplications,
    removeApplication
}
