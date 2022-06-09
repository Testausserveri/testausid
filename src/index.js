/**
 * Testausserveri ID
 * This service implements OAuth2 login methods from various providers. Such as Google, Github, Microsoft and Discord.
 * The idea is to simplify logging into services hosted by Testausserveri ry securely.
 *
 * @copyright Copyright 2022 Testausserveri ry
 * Original author: Eemil S.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Modules
require("dotenv").config()
const { existsSync, readdirSync, statSync } = require("fs")
const { createServer: createHTTPServer } = require("http")
const { join } = require("path")
const readline = require("readline")
const Package = require("../package.json")
const {
    createExpiryCheckLoop, prepareConnection, createApplication, updateApplication, getApplications, removeApplication
} = require("./database/client")

console.log(`Package: ${Package.name}@${Package.version}`)
console.log(`Runtime: ${process.version}`)

require("./console")

// Constants
const responseTimeout = process.env.RESPONSE_TIMEOUT ?? 30000
const serverPort = process.env.PORT ?? 7080 // Default in docker-compose
const serverIp = process.env.IP ?? "0.0.0.0" // Defaults to all
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> "
})

// Global variables
/**
 * @type {import("./typings/index").ServerMethod[]} Server methods
 */
const methods = []

// Functions
/**
 * Implement server methods
 * @param {string} dir The directory to implement methods from
 */
async function implementMethods(dir) {
    // Get all files in the directory and filter out folders
    const files = readdirSync(dir)
        .filter((fileName) => !fileName.startsWith("_")) // Skip files that start with _
    const methodsToImplement = files.filter((fileName) => statSync(dir + fileName).isFile())
    const folders = files.filter((fileName) => !methodsToImplement.includes(fileName))
    // Implement methods from folders recursively
    for (const folder of folders) implementMethods(join(dir, `${folder}/`))
    for (const methodName of methodsToImplement) {
        // Make sure requirements are met
        try {
            // eslint-disable-next-line global-require, import/no-dynamic-require
            const method = require(join(dir, methodName))
            if (method !== undefined && typeof method.path === "string" && typeof method.handler === "function") {
                methods.push({
                    name: methodName,
                    path: new RegExp(method.path), // Should we handle normal strings?
                    handler: method.handler
                })
            } else throw new Error("Method does not export path or handler properties")
        } catch (err) {
            console.error(`Failed to implement method from ${join(dir, methodName)} due to an error:`, err)
        }
    }
}

/**
 * HTTP(s) request handler
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const matchingMethods = methods.filter((method) => method.path.test(url.pathname))
    if (matchingMethods.length === 0) {
        res.writeHead(404)
        res.end("It's a 404. Try these: Check the URL, ask yourself why you want to view this page, break down.")
        return
    }
    for await (const method of matchingMethods) {
        let nextCalled = false
        const next = () => { nextCalled = true }
        try {
            await method.handler(req, res, next)
        } catch (e) {
            res.writeHead(500, {
                "Content-Type": "text/plain"
            })
            res.end(`An unexpected internal server error ocurred while handling method ${method.name}`)
            break
        }
        if (!nextCalled) break
    }
    if (!res.headersSent && res.writable) {
        res.writeHead(500)
        res.end("Request not handled.")
    }
}

/**
 * Create a HTTP(s) server
 * @param {string} ip The IP the server will listen to
 * @param {string} port The port the server will listen to
 * @param {CertificateObject} certificateConfiguration Possible certificate configuration
 * @returns {Promise<void>}
 */
function createServer(ip, port) {
    return new Promise((resolve, reject) => {
        let isPending = true
        const instance = createHTTPServer(async (request, response) => {
            try {
                const timeout = setTimeout(() => {
                    // TODO: Possible race conditions here?
                    if (!response.headersSent && response.writable) {
                        response.writeHead(408)
                        response.end("Oops! It seems your response was lost to the void...")
                    }
                }, responseTimeout)
                handleRequest(request, response).then(() => clearTimeout(timeout))
            } catch (err) {
                console.error("Failed to handle request:", err)
                if (!response.headersSent && response.writable) {
                    response.writeHead(500)
                    response.end("Oops! Something broke...")
                }
            }
        })
        instance.on("error", (e) => {
            if (!isPending) return
            isPending = false
            reject(e)
        })
        instance.listen(port, ip, () => {
            if (!isPending) return
            isPending = false
            resolve()
        })
    })
}

// CLI
function cli() {
    rl.on("line", async (input) => {
        const command = input.split(" ")[0]
        switch (command) {
        case "createApplication": {
            const functionInput = JSON.parse(input.replace(`${command} `, ""))
            try {
                await createApplication(
                    functionInput.name, functionInput.homepage, functionInput.icon, functionInput.redirectURLs
                )
                console.log("Application created!")
            } catch (e) {
                console.error("Failed to create application:\n", e)
            }
            break
        }
        case "updateApplication": {
            const functionInput = JSON.parse(input.replace(`${command} `, ""))
            try {
                await updateApplication({ id: functionInput.id }, functionInput)
                console.log("Application updated!")
            } catch (e) {
                console.error("Failed to update application:\n", e)
            }
            break
        }
        case "getApplications": {
            console.log(await getApplications())
            break
        }
        case "removeApplication": {
            const functionInput = JSON.parse(input.replace(`${command} `, ""))
            try {
                await removeApplication(functionInput)
                console.log("Application removed!")
            } catch (e) {
                console.error("Failed to remove application:\n", e)
            }
            break
        }
        case "exit": {
            console.log("Goodbye.")
            process.exit()
            break
        }
        case "help": {
            console.log(`
                Commands:
                - "exit", closes the program.
                - "help", displays this message.
                - "createApplication <name, ?icon, ?homepage, redirectURLs>*", create an application.
                - "updateApplication <id, ?name, ?icon, ?homepage, ?redirectURLs>*", update an application.
                - "getApplications", get all applications.
                - "removeApplication <id>*", remove an application.

                * A MongoDB query
            `.split("\n").map((line) => line.trim()).join("\n"))
            break
        }
        default:
            console.error("Unknown command. Use \"help\" to view a list of commands.")
        }
        rl.prompt()
    })
    rl.prompt()
}

// Main
async function main() {
    try {
        // Database connection
        console.log("Connecting to the database...")
        await prepareConnection()
        global.expiryLoop = await createExpiryCheckLoop()
        console.log("Connected!")

        // HTTP Server
        console.log("Running method discovery...")
        if (existsSync("./src/methods/")) {
            implementMethods(join(process.cwd(), "./src/methods/"))
            console.log(`Implemented ${methods.length} method(s).`)
        } else console.warn("There are no methods to implement.")
        await createServer(serverIp, serverPort)
        console.log(`Server online on port ${serverPort}.`)
        cli()
    } catch (err) {
        console.error("Main error:", err)
    }
}
main()
