const { model, Schema } = require("mongoose")

// Application registration model
const applicationRegistrationModel = model("applicationRegistrationModel",
    new Schema({
        id: String, // UUIDv4
        secret: String, // 32 random characters
        redirectURLs: Array,
        name: String,
        homepage: String,
        icon: String
    }))

// Authentication session model
const authenticationSessionModel = model("authenticationRegistrationModel",
    new Schema({
        applicationId: String,
        redirectURL: String,
        authenticationPlatform: String,
        status: String,
        state: String,
        internalState: String,
        redirectId: String,
        code: String,
        token: String,
        scopes: Array,
        allowedMethods: Array,
        oauthToken: String,
        responseType: String,
        user: {
            name: String,
            account: {
                avatar: String,
                color: String,
                createdAt: String,
                language: String
            },
            contact: {
                email: String,
                phone: String
            },
            security: {
                has2FA: Boolean,
                hasSMSBackup: Boolean
            },
            id: String,
            token: String
        },
        timestamp: String
    }))

module.exports = {
    applicationRegistrationModel,
    authenticationSessionModel
}
