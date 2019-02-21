const path = require("path");

module.exports = {
    webpack(config, options) {

        // NOTE(swatinem): we just assume the babel loader is configured last
        const babelRule = config.module.rules[config.module.rules.length - 1]
        babelRule.include = undefined

        // alias
        const modulesDir = path.resolve("../../", global.doodoo ? doodoo.getConf("app.root") : "app");
        config.resolve.alias["private-next-module-pages"] = modulesDir;

        console.log(config);
        

        return config
    }
};
