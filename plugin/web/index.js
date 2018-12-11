const next = require("next");
const conf = require("./next.config");
const dev = (process.env.NODE_ENV || "development") === "development";
const app = next({ dev, conf, dir: __dirname });
const handle = app.getRequestHandler();

module.exports = async () => {
    await app.prepare();

    doodoo.use(async (ctx, next) => {
        ctx.respond = false;
        ctx.status = 200;

        await handle(ctx.req, ctx.res);
    });
};
