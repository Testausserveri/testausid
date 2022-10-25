const Package = require("../../package.json")

/**
 * Server method example
 */
module.exports = {
    // eslint-disable-next-line no-useless-escape
    path: "/\/|\/.{0,256}|/g", // RegEx or a normal string
    /**
     * Method handler function
     * @param {import("http").IncomingMessage} req
     * @param {import("http").ServerResponse} res
     * @param {function} next
     */
    handler: async (_, res) => {
        res.writeHead(200, {
            "Content-Type": "text/html"
        })
        res.end(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Testausserveri ID</title>
                <meta name="description" content="Testausserveri ID - OpenID login service">
                <meta name="author" content="Testausserveri ry">
                <link rel="icon" type="image/png" href="/app/assets/favicon.png" />
                <link rel="stylesheet" href="/app/main.css">
                <link rel="preload" as="font" href="/app/assets/roboto.woff2">
            </head>
            <body>
                <!-- Thumbnail -->
                <span class="thumbnail"></span>
                <!-- Flex container -->
                <div class="container" id="container" style="opacity: 1; display: flex;">
                    <!-- Main app body -->
                    <div class="app" style="min-height: unset;">
                        <!-- App content -->
                        <div class="content" id="appContent">
                            <p>Package: ${Package.name}@${Package.version}</p>
                            <p>Author: ${Package.author}</p>
                            <p>License: ${Package.license}</p>
                            <p>Homepage: ${Package.homepage}</p>
                            <p>Bugs: ${Package.bugs.url}</p>
                        </div>
                        <!-- App content footer-->
                        <div class="footer" id="footer">
                            <span class="line"></span>
                            <p style="white-space: nowrap;">Copyright © <a name="copyright">Testausserveri ry and contributors</a>.<wbr> All rights reserved.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `)
    }
}
