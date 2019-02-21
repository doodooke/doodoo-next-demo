// This file is used for when users run `require('next')`
const NextHotReloader = require('next/dist/server/hot-reloader').default
const NextDevServer = require('next/dist/server/next-dev-server').default
const onDemandEntryHandler = require('./on-demand-entry-handler');
const WebpackDevMiddleware = require('webpack-dev-middleware');
const WebpackHotMiddleware = require('webpack-hot-middleware');
const WebSocket = require('ws')
const webpack = require('webpack')

class HotReloader extends NextHotReloader {
    async start() {
        await this.clean()

        this.wsPort = await new Promise((resolve, reject) => {
            const { websocketPort } = this.config.onDemandEntries
            // create on-demand-entries WebSocket
            this.wss = new WebSocket.Server({ port: websocketPort }, function (err) {
                if (err) {
                    return reject(err)
                }

                const { port } = this.address()
                if (!port) {
                    return reject(new Error('No websocket port could be detected'))
                }
                resolve(port)
            })
        })

        const configs = await this.getWebpackConfig()
        this.addWsConfig(configs)

        const multiCompiler = webpack(configs)
        const buildTools = await this.prepareBuildTools(multiCompiler)
        this.assignBuildTools(buildTools)

        this.stats = (await this.waitUntilValid()).stats[0]
    }

    async start() {
        await this.clean()

        this.wsPort = await new Promise((resolve, reject) => {
            const { websocketPort } = this.config.onDemandEntries
            // create on-demand-entries WebSocket
            this.wss = new WebSocket.Server({ port: websocketPort }, function (err) {
                if (err) {
                    return reject(err)
                }

                const { port } = this.address()
                if (!port) {
                    return reject(new Error('No websocket port could be detected'))
                }
                resolve(port)
            })
        })

        const configs = await this.getWebpackConfig()
        this.addWsConfig(configs)

        const multiCompiler = webpack(configs)
        const buildTools = await this.prepareBuildTools(multiCompiler)
        this.assignBuildTools(buildTools)

        this.stats = (await this.waitUntilValid()).stats[0]
    }

    async prepareBuildTools(multiCompiler) {

        // This plugin watches for changes to _document.js and notifies the client side that it should reload the page
        multiCompiler.compilers[1].hooks.done.tap('NextjsHotReloaderForServer', (stats) => {
            if (!this.initialized) {
                return
            }

            const { compilation } = stats

            // We only watch `_document` for changes on the server compilation
            // the rest of the files will be triggered by the client compilation
            const documentChunk = compilation.chunks.find(c => c.name === normalize(`static/${this.buildId}/pages/_document.js`))
            // If the document chunk can't be found we do nothing
            if (!documentChunk) {
                console.warn('_document.js chunk not found')
                return
            }

            // Initial value
            if (this.serverPrevDocumentHash === null) {
                this.serverPrevDocumentHash = documentChunk.hash
                return
            }

            // If _document.js didn't change we don't trigger a reload
            if (documentChunk.hash === this.serverPrevDocumentHash) {
                return
            }

            // Notify reload to reload the page, as _document.js was changed (different hash)
            this.send('reloadPage')
            this.serverPrevDocumentHash = documentChunk.hash
        })

        multiCompiler.compilers[0].hooks.done.tap('NextjsHotReloaderForClient', (stats) => {
            const { compilation } = stats
            const chunkNames = new Set(
                compilation.chunks
                    .map((c) => c.name)
                    .filter(name => IS_BUNDLED_PAGE_REGEX.test(name))
            )

            if (this.initialized) {
                // detect chunks which have to be replaced with a new template
                // e.g, pages/index.js <-> pages/_error.js
                const addedPages = diff(chunkNames, this.prevChunkNames)
                const removedPages = diff(this.prevChunkNames, chunkNames)

                if (addedPages.size > 0) {
                    for (const addedPage of addedPages) {
                        let page = '/' + ROUTE_NAME_REGEX.exec(addedPage)[1].replace(/\\/g, '/')
                        page = page === '/index' ? '/' : page
                        this.send('addedPage', page)
                    }
                }

                if (removedPages.size > 0) {
                    for (const removedPage of removedPages) {
                        let page = '/' + ROUTE_NAME_REGEX.exec(removedPage)[1].replace(/\\/g, '/')
                        page = page === '/index' ? '/' : page
                        this.send('removedPage', page)
                    }
                }
            }

            this.initialized = true
            this.stats = stats
            this.prevChunkNames = chunkNames
        })

        // We don’t watch .git/ .next/ and node_modules for changes
        const ignored = [
            /[\\/]\.git[\\/]/,
            /[\\/]\.next[\\/]/,
            /[\\/]node_modules[\\/]/
        ]

        let webpackDevMiddlewareConfig = {
            publicPath: `/_next/static/webpack`,
            noInfo: true,
            logLevel: 'silent',
            watchOptions: { ignored },
            writeToDisk: true
        }

        if (this.config.webpackDevMiddleware) {
            console.log(`> Using "webpackDevMiddleware" config function defined in ${this.config.configOrigin}.`)
            webpackDevMiddlewareConfig = this.config.webpackDevMiddleware(webpackDevMiddlewareConfig)
        }

        const webpackDevMiddleware = WebpackDevMiddleware(multiCompiler, webpackDevMiddlewareConfig)

        const webpackHotMiddleware = WebpackHotMiddleware(multiCompiler.compilers[0], {
            path: '/_next/webpack-hmr',
            log: false,
            heartbeat: 2500
        })

        const onDemandEntries = onDemandEntryHandler(webpackDevMiddleware, multiCompiler, {
            dir: this.dir,
            buildId: this.buildId,
            reload: this.reload.bind(this),
            pageExtensions: this.config.pageExtensions,
            wsPort: this.wsPort,
            ...this.config.onDemandEntries
        })

        return {
            webpackDevMiddleware,
            webpackHotMiddleware,
            onDemandEntries
        }
    }
}
class DevServer extends NextDevServer {
    async prepare() {
        this.hotReloader = new HotReloader(this.dir, { config: this.nextConfig, buildId: this.buildId });
        await this.addExportPathMapRoutes();
        await this.hotReloader.start();
        this.setDevReady();
    }
}

module.exports = (options) => {
    if (options.dev) {
        return new DevServer(options)
    }

    const next = require('next-server')
    return next(options)
}
