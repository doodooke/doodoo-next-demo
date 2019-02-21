const path = require('path')
const nanoid = require('nanoid')
const loadConfig = require('next-server/next-config')
const { PHASE_PRODUCTION_BUILD } = require('next-server/constants')
const getBaseWebpackConfig = require('next/dist/build/webpack-config').default
const { generateBuildId } = require('next/dist/build/generate-build-id')
const { writeBuildId } = require('next/dist/build/write-build-id')
const { isWriteable } = require('next/dist/build/is-writeable')
const { runCompiler } = require('next/dist/build/compiler')
const globModule = require('glob')
const { promisify } = require('util')
const { createPagesMapping, createEntrypoints } = require('next/dist/build/entries')
const formatWebpackMessages = require('next/dist/client/dev-error-overlay/format-webpack-messages')
const chalk = require('chalk')
const { printAndExit } = require('next/dist/server/lib/utils')

const glob = promisify(globModule)
const constants = {
  PAGES_MODULE_DIR_ALIAS: "private-next-module-pages"
}

function createModulePagesMapping(pagePaths, extensions) {
  const pages = pagePaths.reduce((result, pagePath) => {
    let pagePaths = pagePath.split("/");
    pagePaths.splice(1, 1);
    let _pagePath = pagePaths.join("/")

    let page = `/${_pagePath.replace(new RegExp(`\\.+(${extensions.join('|')})$`), '').replace(/\\/g, '/')}`.replace(/\/index$/, '');
    result[page === '' ? '/' : page] = path.join(constants.PAGES_MODULE_DIR_ALIAS, pagePath).replace(/\\/g, '/');
    return result;
  }, {});
  pages['/_app'] = pages['/_app'] || 'next/dist/pages/_app';
  pages['/_error'] = pages['/_error'] || 'next/dist/pages/_error';
  pages['/_document'] = pages['/_document'] || 'next/dist/pages/_document';
  return pages;
}

function printTreeView(list) {
  list
    .sort((a, b) => a > b ? 1 : -1)
    .forEach((item, i) => {
      const corner = i === 0 ? list.length === 1 ? '─' : '┌' : i === list.length - 1 ? '└' : '├';
      console.log(` \x1b[90m${corner}\x1b[39m ${item}`);
    });
  console.log();
}

async function build(dir, conf = null) {
  if (!(await isWriteable(dir))) {
    throw new Error(
      '> Build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable'
    )
  }

  console.log('Creating an optimized production build ...')
  console.log()

  const config = loadConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const buildId = await generateBuildId(config.generateBuildId, nanoid)
  const distDir = path.join(dir, config.distDir)
  const pagesDir = path.join(dir, 'pages')
  const pagePaths = await glob(`**/*.+(${config.pageExtensions.join('|')})`, { cwd: pagesDir })

  const modulesDir = global.doodoo ? doodoo.getConf("app.root") : path.resolve("../../", "app");
  const modulePagePaths = await glob(`*/view/**/*.+(${config.pageExtensions.join('|')})`, { cwd: modulesDir })

  const pages = Object.assign(createModulePagesMapping(modulePagePaths, config.pageExtensions), createPagesMapping(pagePaths, config.pageExtensions))
  const entrypoints = createEntrypoints(pages, config.target, buildId, config)
  const configs = await Promise.all([
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: false,
      config,
      target: config.target,
      entrypoints: entrypoints.client,
    }),
    getBaseWebpackConfig(dir, {
      buildId,
      isServer: true,
      config,
      target: config.target,
      entrypoints: entrypoints.server,
    }),
  ])

  let result = { warnings: [], errors: [] };
  if (config.target === 'serverless') {
    if (config.publicRuntimeConfig)
      throw new Error(
        'Cannot use publicRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
      )

    const clientResult = await runCompiler([configs[0]])
    // Fail build if clientResult contains errors
    if (clientResult.errors.length > 0) {
      result = {
        warnings: [...clientResult.warnings],
        errors: [...clientResult.errors],
      }
    } else {
      const serverResult = await runCompiler([configs[1]])
      result = {
        warnings: [...clientResult.warnings, ...serverResult.warnings],
        errors: [...clientResult.errors, ...serverResult.errors],
      }
    }
  } else {
    result = await runCompiler(configs)
  }

  console.log(result);
  
  result = formatWebpackMessages(result)

  if (result.errors.length > 0) {
    // Only keep the first error. Others are often indicative
    // of the same problem, but confuse the reader with noise.
    if (result.errors.length > 1) {
      result.errors.length = 1
    }

    console.error(chalk.red('Failed to compile.\n'))
    console.error(result.errors.join('\n\n'))
    console.error()
    throw new Error('> Build failed because of webpack errors')
  } else if (result.warnings.length > 0) {
    console.warn(chalk.yellow('Compiled with warnings.\n'))
    console.warn(result.warnings.join('\n\n'))
    console.warn()
  } else {
    console.log(chalk.green('Compiled successfully.\n'))
  }

  printTreeView(Object.keys(pages))

  await writeBuildId(distDir, buildId)
}

build(path.resolve('.'))
  .catch((err) => {
    // tslint:disable-next-line
    console.error('> Build error occurred')
    printAndExit(err)
  })