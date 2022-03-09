interface CertificateConfiguration {
    key: string,
    cert: string
}

interface ServerMethod {
    name: string,
    path: RegExp,
    handler: Function
}

export declare const CertificateConfiguration: Object<CertificateConfiguration>
export declare const ServerMethod: Object<ServerMethod>