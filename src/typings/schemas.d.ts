interface applicationRegistration {
    id: String,
    secret: String,
    redirectURLs: String[],
    name: String,
    homepage: String,
    icon: String
}

type sessionScope = "token" | "id" | "account" | "contact" | "security"

interface authenticationSession {
    applicationId: String,
    redirectURL: String,
    authenticationPlatform: String,
    status: String,
    state: String,
    internalState: String,
    redirectId: String,
    code: String,
    token: String,
    scopes: sessionScope[],
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
}

export declare const applicationRegistration: Object<applicationRegistration>
export declare const authenticationSession: Object<authenticationSession>