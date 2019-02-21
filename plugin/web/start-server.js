const Koa = require("koa");
const next = require("./next");
const conf = require("./next.config");
const port = parseInt(process.env.PORT, 10) || 3000
const dev = (process.env.NODE_ENV || "development") === "development";

const app = next({ dev, conf, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = new Koa()

  server.use(async (ctx, next) => {
    ctx.respond = false;
    ctx.status = 200;

    await handle(ctx.req, ctx.res);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
